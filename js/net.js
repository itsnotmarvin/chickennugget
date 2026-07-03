import { resolveBackendUrl } from "./config.js";

const EMITTABLE_EVENTS = new Set([
  "queue_status",
  "bot_offer",
  "match_found",
  "room_state",
  "snapshot",
  "hit",
  "kill",
  "round_start",
  "round_end",
  "match_end",
  "player_joined",
  "player_left",
  "error",
  "disconnected",
]);

const SNAPSHOT_DELAY_MS = 100;
const MAX_SNAPSHOTS = 64;
const INPUT_SEND_MS = 1000 / 30;

const listeners = new Map();

let socket = null;
let socketKind = null;
let socketEpoch = 0;
let roomState = null;
let welcome = null;
let matchFound = null;
let snapshots = [];
let serverOffsetMs = 0;
let pendingInput = null;
let nextSeq = 1;
let inputLoop = 0;
let closedByClient = false;
let lastMessageAt = 0;
let timeoutTimer = 0;

function safeDecode(buffer) {
  return typeof buffer === "string" ? buffer : new TextDecoder().decode(buffer);
}

function wrapAngle(angle) {
  let next = angle;
  while (next > Math.PI) next -= Math.PI * 2;
  while (next < -Math.PI) next += Math.PI * 2;
  return next;
}

function lerpAngle(a, b, t) {
  return a + wrapAngle(b - a) * t;
}

function backendHttp() {
  return resolveBackendUrl().replace(/\/+$/, "");
}

function backendWs() {
  const url = new URL(backendHttp());
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url;
}

function socketIsOpen() {
  return !!socket && socket.readyState === WebSocket.OPEN;
}

function emit(type, payload) {
  const fns = listeners.get(type);
  if (!fns) return;
  for (const fn of Array.from(fns)) {
    try {
      fn(payload);
    } catch (error) {
      console.error("net listener failed", type, error);
    }
  }
}

function clearTimers() {
  if (inputLoop) {
    clearInterval(inputLoop);
    inputLoop = 0;
  }
  if (timeoutTimer) {
    clearTimeout(timeoutTimer);
    timeoutTimer = 0;
  }
}

function resetRoomTracking() {
  roomState = null;
  welcome = null;
  matchFound = null;
  snapshots = [];
  serverOffsetMs = 0;
  pendingInput = null;
  nextSeq = 1;
}

function scheduleTimeoutGuard(epoch) {
  if (timeoutTimer) clearTimeout(timeoutTimer);
  timeoutTimer = window.setTimeout(() => {
    if (epoch !== socketEpoch) return;
    if (!socket) return;
    if (performance.now() - lastMessageAt < 30000) {
      scheduleTimeoutGuard(epoch);
      return;
    }
    try {
      socket.close(4000, "Heartbeat timeout");
    } catch {
      // Ignore close failures.
    }
  }, 31000);
}

function handleServerTime(serverTime, localNow = performance.now()) {
  if (!Number.isFinite(serverTime)) return;
  const measured = serverTime - localNow;
  if (!serverOffsetMs) {
    serverOffsetMs = measured;
    return;
  }
  serverOffsetMs = serverOffsetMs * 0.85 + measured * 0.15;
}

function pushSnapshot(message) {
  const localNow = performance.now();
  handleServerTime(message.serverTime, localNow);
  snapshots.push({
    serverTime: message.serverTime,
    localReceivedAt: localNow,
    players: message.players,
  });
  snapshots.sort((a, b) => a.serverTime - b.serverTime);
  if (snapshots.length > MAX_SNAPSHOTS) {
    snapshots = snapshots.slice(-MAX_SNAPSHOTS);
  }
}

function send(message) {
  if (!socketIsOpen()) return false;
  socket.send(JSON.stringify(message));
  return true;
}

function sendSequenced(type, payload = {}) {
  return send({ type, seq: nextSeq++, ...payload });
}

function startInputLoop(epoch) {
  if (inputLoop) clearInterval(inputLoop);
  let lastSentAt = 0;
  inputLoop = window.setInterval(() => {
    if (epoch !== socketEpoch || socketKind !== "room") return;
    if (!socketIsOpen() || !pendingInput) return;
    const now = performance.now();
    if (now - lastSentAt < INPUT_SEND_MS - 1) return;
    lastSentAt = now;
    sendSequenced("input", pendingInput);
  }, 16);
}

function teardownSocket({ silent = false } = {}) {
  clearTimers();
  const previous = socket;
  const previousKind = socketKind;
  socket = null;
  socketKind = null;
  socketEpoch += 1;
  if (previous) {
    previous.onopen = null;
    previous.onmessage = null;
    previous.onerror = null;
    previous.onclose = null;
    try {
      previous.close();
    } catch {
      // Ignore close failures.
    }
  }
  if (!silent) {
    emit("disconnected", {
      kind: previousKind,
      code: 1000,
      reason: "closed",
      expected: true,
    });
  }
}

function handleMessage(message) {
  lastMessageAt = performance.now();
  if (typeof message?.ts === "number") handleServerTime(message.ts);
  if (typeof message?.serverTime === "number") handleServerTime(message.serverTime);

  if (message?.type === "ping") {
    send({ type: "pong" });
    return;
  }

  if (message?.type === "welcome") {
    welcome = message;
    return;
  }

  if (message?.type === "room_state") {
    roomState = message;
  } else if (message?.type === "match_found") {
    matchFound = message;
  } else if (message?.type === "snapshot") {
    pushSnapshot(message);
  }

  if (EMITTABLE_EVENTS.has(message?.type)) {
    emit(message.type, message);
  }
}

function connect(url, kind) {
  closedByClient = false;
  teardownSocket({ silent: true });

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const epoch = socketEpoch + 1;
    socket = ws;
    socketKind = kind;
    socketEpoch = epoch;
    lastMessageAt = performance.now();
    scheduleTimeoutGuard(epoch);
    if (kind === "room") startInputLoop(epoch);

    ws.onopen = () => resolve();
    ws.onmessage = (event) => {
      if (epoch !== socketEpoch) return;
      let message = null;
      try {
        message = JSON.parse(safeDecode(event.data));
      } catch {
        emit("error", { type: "error", code: "malformed", detail: "invalid_json" });
        return;
      }
      handleMessage(message);
      scheduleTimeoutGuard(epoch);
    };
    ws.onerror = () => {
      if (epoch !== socketEpoch) return;
      reject(new Error(`WebSocket ${kind} failed`));
    };
    ws.onclose = (event) => {
      if (epoch !== socketEpoch) return;
      const expected = closedByClient || event.code === 1000;
      clearTimers();
      socket = null;
      socketKind = null;
      if (!expected) {
        emit("disconnected", {
          kind,
          code: event.code,
          reason: event.reason || "socket_closed",
          expected: false,
        });
      }
      if (kind === "room") {
        pendingInput = null;
      }
    };
  });
}

export function on(type, fn) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(fn);
  return () => off(type, fn);
}

export function off(type, fn) {
  listeners.get(type)?.delete(fn);
}

export async function joinQueue(region, mode, name, primary = "pike") {
  resetRoomTracking();
  const url = backendWs();
  url.pathname = `/queue/${encodeURIComponent(region)}/${encodeURIComponent(mode)}/ws`;
  url.searchParams.set("name", name);
  url.searchParams.set("primary", primary);
  await connect(url, "queue");
}

export async function leaveQueue() {
  closedByClient = true;
  if (socketIsOpen()) send({ type: "leave" });
  teardownSocket({ silent: true });
}

export async function createRoom({ region, mode, name, primary = "pike" }) {
  const response = await fetch(`${backendHttp()}/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ region, mode, name, primary }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    emit("error", body || { type: "error", code: "malformed" });
    throw new Error(body?.code || `room_create_${response.status}`);
  }
  return body;
}

export async function joinRoom(codeOrId, { name, ticket = null, region = "uswest", primary = "pike" }) {
  resetRoomTracking();
  const url = backendWs();
  url.pathname = `/room/${encodeURIComponent(codeOrId)}/ws`;
  url.searchParams.set("name", name);
  url.searchParams.set("region", region);
  url.searchParams.set("primary", primary);
  if (ticket) url.searchParams.set("ticket", ticket);
  await connect(url, "room");
}

export function setInputState(input) {
  pendingInput = { ...input };
}

export function sendFire({ ox, oy, oz, dx, dy, dz, weapon }) {
  return sendSequenced("fire", { ox, oy, oz, dx, dy, dz, weapon });
}

export function sendMelee(kind, { ox, oy, oz, dx, dy, dz }) {
  return sendSequenced("melee", { kind, ox, oy, oz, dx, dy, dz });
}

export function sendReload() {
  return send({ type: "reload" });
}

export function sendSwitchWeapon(weapon) {
  return send({ type: "switch_weapon", weapon });
}

export function sendKeepWaiting() {
  return send({ type: "keep_waiting" });
}

export function sampleSnapshots(nowMs = performance.now()) {
  if (!snapshots.length) return null;

  const targetServerTime = nowMs + serverOffsetMs - SNAPSHOT_DELAY_MS;
  let before = snapshots[0];
  let after = snapshots[snapshots.length - 1];

  for (let index = 0; index < snapshots.length; index += 1) {
    const current = snapshots[index];
    if (current.serverTime <= targetServerTime) before = current;
    if (current.serverTime >= targetServerTime) {
      after = current;
      break;
    }
  }

  if (!before) before = after;
  if (!after) after = before;
  if (!before || !after) return null;

  const span = Math.max(1, after.serverTime - before.serverTime);
  const t = before === after
    ? 1
    : Math.max(0, Math.min(1, (targetServerTime - before.serverTime) / span));

  const byId = new Map();
  for (const sample of before.players) byId.set(sample.id, { before: sample, after: sample });
  for (const sample of after.players) {
    const current = byId.get(sample.id);
    if (current) current.after = sample;
    else byId.set(sample.id, { before: sample, after: sample });
  }

  return {
    serverTime: targetServerTime,
    players: Array.from(byId.values(), ({ before: a, after: b }) => ({
      id: b.id,
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
      yaw: lerpAngle(a.yaw, b.yaw, t),
      pitch: a.pitch + (b.pitch - a.pitch) * t,
      vx: a.vx + (b.vx - a.vx) * t,
      vz: a.vz + (b.vz - a.vz) * t,
      anim: t < 0.5 ? a.anim : b.anim,
      hp: t < 0.5 ? a.hp : b.hp,
      alive: t < 0.5 ? a.alive : b.alive,
      weapon: t < 0.5 ? a.weapon : b.weapon,
    })),
  };
}

export function getRoomState() {
  return roomState;
}

export function getWelcome() {
  return welcome;
}

export function getMatchFound() {
  return matchFound;
}

export function getSocketKind() {
  return socketKind;
}

export function isConnected() {
  return socketIsOpen();
}

export function destroy() {
  closedByClient = true;
  if (socketIsOpen()) send({ type: "leave" });
  teardownSocket({ silent: true });
  resetRoomTracking();
}

export { emit };
