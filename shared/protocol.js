import { MAP_AABB } from "./map-data.js";

export const PROTOCOL_VERSION = 1;
export const ROOM_CODE_RE = /^[A-Z2-9]{6}$/;
export const VALID_REGIONS = Object.freeze(["uswest", "asia"]);
export const REGION_HINTS = Object.freeze({
  uswest: "wnam",
  asia: "apac",
});
export const MODE_DEFS = Object.freeze({
  duel: Object.freeze({ id: "duel", players: 2, scoreTarget: 4, roundMs: 90000 }),
  squad: Object.freeze({ id: "squad", players: 4, scoreTarget: 4, roundMs: 90000 }),
});
export const ERROR_CODES = Object.freeze([
  "room_full",
  "room_not_found",
  "bad_ticket",
  "stale_invite",
  "name_invalid",
  "name_taken",
  "rate_limited",
  "timeout",
  "region_mismatch",
  "malformed",
]);
export const RATE_LIMITS = Object.freeze({
  queueJoinsPerMinute: 6,
  roomCreatesPerMinute: 3,
  inputPerSecond: 60,
  meleePerSecond: 2,
  pingMs: 10000,
  timeoutMs: 30000,
  queueWindowMs: 25000,
  botOfferMs: 10000,
  queueStatusMs: 2000,
  fireSlackMultiplier: 1.2,
  abuseMalformedBeforeClose: 4,
});
export const PHASE_MS = Object.freeze({
  freeze: 3000,
  roundEnd: 3000,
  matchEnd: 3200,
  simTick: 50,
  snapshot: 67,
});
export const INPUT_BOUNDS = Object.freeze({
  minNameLength: 3,
  maxNameLength: 16,
  maxVelocity: 12,
  maxPitch: 89,
  map: MAP_AABB,
});
export const INBOUND_TYPES = Object.freeze([
  "join",
  "input",
  "fire",
  "melee",
  "reload",
  "switch_weapon",
  "keep_waiting",
  "leave",
  "pong",
]);
export const OUTBOUND_TYPES = Object.freeze([
  "welcome",
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
  "ping",
]);

const NAME_CHAR_RE = /[^\p{L}\p{N} _.-]/gu;

export function controlStripped(value) {
  return String(value ?? "").replace(/[\p{C}]/gu, "");
}

export function sanitizeName(value) {
  return controlStripped(value)
    .replace(NAME_CHAR_RE, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function countCodePoints(value) {
  return Array.from(value).length;
}

export function validateName(value) {
  const name = sanitizeName(value);
  const length = countCodePoints(name);
  if (length < INPUT_BOUNDS.minNameLength || length > INPUT_BOUNDS.maxNameLength) {
    return { ok: false, code: "name_invalid" };
  }
  return { ok: true, value: name };
}

export function validateRegion(region) {
  return VALID_REGIONS.includes(region);
}

export function validateMode(mode) {
  return Object.hasOwn(MODE_DEFS, mode);
}

export function normalizeRoomCode(code) {
  return String(code ?? "").toUpperCase().trim();
}

export function validateRoomCode(code) {
  const normalized = normalizeRoomCode(code);
  if (!ROOM_CODE_RE.test(normalized)) return { ok: false };
  return { ok: true, value: normalized };
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function integer(value) {
  return Number.isInteger(value);
}

function vec3(obj, fields) {
  return fields.every((field) => finiteNumber(obj[field]));
}

function withinPitch(pitch) {
  return Math.abs(pitch) <= INPUT_BOUNDS.maxPitch;
}

function withinVelocity(vx, vz) {
  return Math.hypot(vx, vz) <= INPUT_BOUNDS.maxVelocity;
}

function withinMap(x, y, z) {
  return x >= MAP_AABB.minX
    && x <= MAP_AABB.maxX
    && y >= MAP_AABB.minY
    && y <= MAP_AABB.maxY
    && z >= MAP_AABB.minZ
    && z <= MAP_AABB.maxZ;
}

export function parseClientMessage(raw) {
  try {
    const value = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    return { ok: true, value };
  } catch {
    return { ok: false, code: "malformed", detail: "invalid_json" };
  }
}

export function validateClientMessage(message) {
  if (!message || typeof message !== "object") {
    return { ok: false, code: "malformed", detail: "object_required" };
  }
  if (!INBOUND_TYPES.includes(message.type)) {
    return { ok: false, code: "malformed", detail: "unknown_type" };
  }

  switch (message.type) {
    case "join":
      return { ok: true, value: message };
    case "keep_waiting":
    case "leave":
    case "reload":
    case "pong":
      return { ok: true, value: message };
    case "switch_weapon":
      if (typeof message.weapon !== "string") {
        return { ok: false, code: "malformed", detail: "weapon_required" };
      }
      return { ok: true, value: message };
    case "input":
      if (
        !integer(message.seq)
        || !vec3(message, ["x", "y", "z"])
        || !finiteNumber(message.yaw)
        || !finiteNumber(message.pitch)
        || !finiteNumber(message.vx)
        || !finiteNumber(message.vz)
        || !withinPitch(message.pitch)
        || !withinVelocity(message.vx, message.vz)
        || !withinMap(message.x, message.y, message.z)
      ) {
        return { ok: false, code: "malformed", detail: "bad_input" };
      }
      return { ok: true, value: message };
    case "fire":
      if (
        !integer(message.seq)
        || typeof message.weapon !== "string"
        || !vec3(message, ["ox", "oy", "oz"])
        || !vec3(message, ["dx", "dy", "dz"])
      ) {
        return { ok: false, code: "malformed", detail: "bad_fire" };
      }
      return { ok: true, value: message };
    case "melee":
      if (
        !integer(message.seq)
        || (message.kind !== "slash" && message.kind !== "stab")
        || !vec3(message, ["ox", "oy", "oz"])
        || !vec3(message, ["dx", "dy", "dz"])
      ) {
        return { ok: false, code: "malformed", detail: "bad_melee" };
      }
      return { ok: true, value: message };
    default:
      return { ok: false, code: "malformed", detail: "unsupported" };
  }
}

export function errorMessage(code, detail) {
  return { type: "error", code, detail };
}

export function protocolMeta() {
  return {
    version: PROTOCOL_VERSION,
    modes: MODE_DEFS,
    regions: VALID_REGIONS,
  };
}
