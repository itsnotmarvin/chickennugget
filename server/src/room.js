import { DurableObject } from "cloudflare:workers";

import { allowWindowHit } from "./limits.js";
import {
  acceptMovementClaim,
  addPrivateRosterEntry,
  advanceReload,
  allSeatsConnected,
  beginFreeze,
  beginReload,
  createRoomLiveState,
  currentRoundWinner,
  handleFire,
  handleMelee,
  markDisconnected,
  matchWinner,
  playerSummary,
  roomHasCapacity,
  serializeRoomState,
  serializeSnapshot,
  switchWeapon,
  timeoutRoundWinner,
} from "./room-logic.js";
import {
  errorMessage,
  INBOUND_TYPES,
  MODE_DEFS,
  parseClientMessage,
  PHASE_MS,
  RATE_LIMITS,
  validateClientMessage,
  validateName,
} from "../../shared/protocol.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function wsResponseError(code, status = 400) {
  return json(errorMessage(code), status);
}

export class RoomDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.meta = null;
    this.live = null;
    this.loaded = false;
    this.interval = null;
    this.sessions = new Map();
  }

  async ensureLoaded() {
    if (this.loaded) return;
    this.meta = await this.ctx.storage.get("meta") ?? null;
    this.live = this.meta ? createRoomLiveState(this.meta) : null;
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment();
      if (!attachment?.playerId) continue;
      this.sessions.set(ws, attachment.playerId);
      const player = this.live?.players.get(attachment.playerId);
      if (player) {
        player.connected = true;
        player.lastSeenAt = Date.now();
      }
    }
    this.loaded = true;
    if (this.sessions.size) this.ensureLoop();
  }

  async fetch(request) {
    await this.ensureLoaded();
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/internal/setup-match") {
      const payload = await request.json();
      this.meta = {
        roomId: payload.roomId,
        code: null,
        kind: "match",
        region: payload.region,
        mode: payload.mode,
        roster: payload.roster,
        createdAt: Date.now(),
      };
      await this.ctx.storage.put("meta", this.meta);
      this.live = createRoomLiveState(this.meta);
      this.loaded = true;
      return json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/internal/create-private") {
      const payload = await request.json();
      if (this.meta) return json({ ok: true, code: this.meta.code });
      this.meta = {
        roomId: payload.roomId,
        code: payload.code,
        kind: "private",
        region: payload.region,
        mode: payload.mode,
        roster: [],
        createdAt: Date.now(),
      };
      await this.ctx.storage.put("meta", this.meta);
      this.live = createRoomLiveState(this.meta);
      this.loaded = true;
      return json({ ok: true, code: payload.code });
    }

    if (url.pathname.endsWith("/ws")) {
      return this.handleSocketJoin(request, url);
    }

    return new Response("Not found", { status: 404 });
  }

  async handleSocketJoin(request, url) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket upgrade", { status: 426 });
    }
    if (!this.meta || !this.live) return wsResponseError("room_not_found", 404);

    const region = url.searchParams.get("region");
    if (region && region !== this.meta.region) {
      return wsResponseError("region_mismatch", 409);
    }

    const nameCheck = validateName(url.searchParams.get("name") ?? "");
    if (!nameCheck.ok) return wsResponseError(nameCheck.code, 400);

    const ticket = url.searchParams.get("ticket");
    let rosterEntry = null;

    if (this.meta.kind === "match") {
      rosterEntry = this.meta.roster.find((entry) => entry.ticket === ticket) ?? null;
      if (!rosterEntry) return wsResponseError("bad_ticket", 403);
    } else {
      rosterEntry = this.meta.roster.find((entry) => entry.name === nameCheck.value) ?? null;
      if (!rosterEntry) {
        if (!roomHasCapacity(this.meta)) return wsResponseError("room_full", 409);
        rosterEntry = addPrivateRosterEntry(this.meta, this.live, nameCheck.value);
        await this.ctx.storage.put("meta", this.meta);
      } else if (this.live.players.get(rosterEntry.id)?.connected) {
        return wsResponseError("name_taken", 409);
      }
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [rosterEntry.id]);
    server.serializeAttachment({ playerId: rosterEntry.id });

    const player = this.live.players.get(rosterEntry.id);
    player.connected = true;
    player.lastSeenAt = Date.now();

    for (const [ws, playerId] of this.sessions.entries()) {
      if (playerId === rosterEntry.id && ws !== server) {
        try {
          ws.close(1012, "Reconnected elsewhere");
        } catch {
          // Ignore close failures.
        }
        this.sessions.delete(ws);
      }
    }
    this.sessions.set(server, rosterEntry.id);

    server.send(JSON.stringify({
      type: "welcome",
      roomId: this.meta.roomId,
      code: this.meta.code ?? null,
      region: this.meta.region,
      mode: this.meta.mode,
      playerId: rosterEntry.id,
      version: 1,
    }));
    server.send(JSON.stringify(serializeRoomState(this.meta, this.live, rosterEntry.id)));
    this.broadcast({
      type: "player_joined",
      player: playerSummary(player),
    }, server);

    if (allSeatsConnected(this.meta, this.live) && this.live.phase === "lobby") {
      beginFreeze(this.meta, this.live, Date.now());
      this.broadcast({
        type: "round_start",
        round: this.live.round,
        freezeEndsAt: this.live.phaseEndsAt,
        scoreBlue: this.live.scoreBlue,
        scoreRed: this.live.scoreRed,
      });
      this.broadcast(serializeRoomState(this.meta, this.live));
    }

    this.ensureLoop();
    return new Response(null, { status: 101, webSocket: client });
  }

  ensureLoop() {
    if (this.interval) return;
    this.interval = setInterval(() => {
      this.tick().catch((error) => console.error("room tick failed", error));
    }, PHASE_MS.simTick);
  }

  maybeStopLoop() {
    if (!this.interval) return;
    if (this.sessions.size > 0) return;
    clearInterval(this.interval);
    this.interval = null;
  }

  send(ws, payload) {
    try {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
    } catch {
      // Ignore send failures and let close cleanup handle it.
    }
  }

  broadcast(payload, skip = null) {
    for (const ws of this.sessions.keys()) {
      if (ws === skip) continue;
      this.send(ws, payload);
    }
  }

  async tick() {
    if (!this.live || !this.meta) return;
    const now = Date.now();

    for (const [ws, playerId] of Array.from(this.sessions.entries())) {
      const player = this.live.players.get(playerId);
      if (!player) {
        this.sessions.delete(ws);
        continue;
      }
      if (now - player.lastSeenAt > RATE_LIMITS.timeoutMs) {
        this.send(ws, errorMessage("timeout", "idle"));
        try {
          ws.close(1001, "Timeout");
        } catch {
          // Ignore close failures.
        }
        this.handleDisconnect(playerId, ws);
      }
    }

    if (now - this.live.lastPingAt >= RATE_LIMITS.pingMs) {
      this.broadcast({ type: "ping", ts: now });
      this.live.lastPingAt = now;
    }

    for (const player of this.live.players.values()) {
      advanceReload(player, now);
    }

    if (this.live.phase === "freeze" && now >= this.live.phaseEndsAt) {
      this.live.phase = "live";
      this.broadcast(serializeRoomState(this.meta, this.live));
    } else if (this.live.phase === "live") {
      let winner = currentRoundWinner(this.live);
      if (!winner && now >= this.live.roundEndsAt) {
        winner = timeoutRoundWinner(this.live);
      }
      if (winner || now >= this.live.roundEndsAt) {
        if (winner === "blue") this.live.scoreBlue += 1;
        else if (winner === "red") this.live.scoreRed += 1;
        this.live.phase = "round_end";
        this.live.phaseEndsAt = now + PHASE_MS.roundEnd;
        this.broadcast({
          type: "round_end",
          round: this.live.round,
          winner,
          scoreBlue: this.live.scoreBlue,
          scoreRed: this.live.scoreRed,
        });
        this.broadcast(serializeRoomState(this.meta, this.live));
      } else if (now - this.live.lastSnapshotAt >= PHASE_MS.snapshot) {
        this.broadcast(serializeSnapshot(this.live, now));
        this.live.lastSnapshotAt = now;
      }
    } else if (this.live.phase === "round_end" && now >= this.live.phaseEndsAt) {
      const target = MODE_DEFS[this.meta.mode].scoreTarget;
      if (this.live.scoreBlue >= target || this.live.scoreRed >= target || this.live.round >= 12) {
        this.live.phase = "match_end";
        this.live.phaseEndsAt = now + PHASE_MS.matchEnd;
        const winner = matchWinner(this.live);
        this.broadcast({
          type: "match_end",
          winner,
          scoreBlue: this.live.scoreBlue,
          scoreRed: this.live.scoreRed,
        });
        this.broadcast(serializeRoomState(this.meta, this.live));
      } else {
        beginFreeze(this.meta, this.live, now);
        this.broadcast({
          type: "round_start",
          round: this.live.round,
          freezeEndsAt: this.live.phaseEndsAt,
          scoreBlue: this.live.scoreBlue,
          scoreRed: this.live.scoreRed,
        });
        this.broadcast(serializeRoomState(this.meta, this.live));
      }
    }

    this.maybeStopLoop();
  }

  async webSocketMessage(ws, rawMessage) {
    await this.ensureLoaded();
    const playerId = this.sessions.get(ws);
    const player = this.live?.players.get(playerId);
    if (!player) return;

    player.lastSeenAt = Date.now();
    const parsed = parseClientMessage(rawMessage);
    if (!parsed.ok) {
      this.send(ws, errorMessage(parsed.code, parsed.detail));
      return;
    }
    if (!INBOUND_TYPES.includes(parsed.value?.type)) return;

    const validated = validateClientMessage(parsed.value);
    if (!validated.ok) {
      this.send(ws, errorMessage(validated.code, validated.detail));
      return;
    }

    const message = validated.value;
    const now = Date.now();

    if (message.type === "pong" || message.type === "join") return;
    if (message.type === "leave") {
      try {
        ws.close(1000, "Leave");
      } catch {
        // Ignore close failures.
      }
      this.handleDisconnect(playerId, ws);
      return;
    }

    if (message.type === "switch_weapon") {
      switchWeapon(player, message.weapon);
      return;
    }

    if (message.type === "reload") {
      beginReload(player, now);
      return;
    }

    if (message.type === "input") {
      const rate = allowWindowHit(player.rate.input, RATE_LIMITS.inputPerSecond, 1000, now);
      player.rate.input = rate.bucket;
      if (!rate.allowed) {
        this.send(ws, errorMessage("rate_limited", "input"));
        return;
      }
      acceptMovementClaim(player, message, now);
      return;
    }

    if (message.type === "fire" && this.live.phase === "live") {
      const others = Array.from(this.live.players.values()).filter((other) => other.team !== player.team && other.id !== player.id);
      const result = handleFire(player, message, others, now);
      if (!result) return;
      this.broadcast(result.hit);
      if (result.kill) {
        this.broadcast(result.kill);
        this.broadcast(serializeRoomState(this.meta, this.live));
      }
      return;
    }

    if (message.type === "melee" && this.live.phase === "live") {
      const rate = allowWindowHit(player.rate.melee, RATE_LIMITS.meleePerSecond, 1000, now);
      player.rate.melee = rate.bucket;
      if (!rate.allowed) {
        this.send(ws, errorMessage("rate_limited", "melee"));
        return;
      }
      const others = Array.from(this.live.players.values()).filter((other) => other.team !== player.team && other.id !== player.id);
      const result = handleMelee(player, message, others, now);
      if (!result) return;
      this.broadcast(result.hit);
      if (result.kill) {
        this.broadcast(result.kill);
        this.broadcast(serializeRoomState(this.meta, this.live));
      }
    }
  }

  handleDisconnect(playerId, ws) {
    this.sessions.delete(ws);
    const player = this.live ? markDisconnected(this.live, playerId) : null;
    if (player) {
      this.broadcast({ type: "player_left", playerId });
    }
    this.maybeStopLoop();
  }

  async webSocketClose(ws, code, reason) {
    const playerId = this.sessions.get(ws);
    if (playerId) this.handleDisconnect(playerId, ws);
    try {
      ws.close(code, reason);
    } catch {
      // Ignore close failures.
    }
  }

  async webSocketError(ws) {
    const playerId = this.sessions.get(ws);
    if (playerId) this.handleDisconnect(playerId, ws);
    try {
      ws.close(1011, "Socket error");
    } catch {
      // Ignore close failures.
    }
  }
}
