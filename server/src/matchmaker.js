import { DurableObject } from "cloudflare:workers";

import { MODE_DEFS, normalizePrimaryWeapon, RATE_LIMITS, validateName } from "../../shared/protocol.js";
import { teamForSeat } from "./room-logic.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export class MatchmakerDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.sessions = new Map();
    this.interval = null;
    this.matching = false;
    this.region = null;
    this.mode = null;

    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment();
      if (attachment?.id) {
        this.sessions.set(ws, attachment);
        this.region = this.region ?? attachment.region ?? null;
        this.mode = this.mode ?? attachment.mode ?? null;
      }
    }
    if (this.sessions.size) this.ensureLoop();
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (!url.pathname.endsWith("/ws")) return new Response("Not found", { status: 404 });
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket upgrade", { status: 426 });
    }

    const nameCheck = validateName(url.searchParams.get("name") ?? "");
    if (!nameCheck.ok) return json({ type: "error", code: nameCheck.code }, 400);
    const primary = normalizePrimaryWeapon(url.searchParams.get("primary"));

    const parts = url.pathname.split("/").filter(Boolean);
    this.region = parts[1] ?? this.region;
    this.mode = parts[2] ?? this.mode;

    const session = {
      id: crypto.randomUUID(),
      name: nameCheck.value,
      joinedAt: Date.now(),
      windowStartedAt: Date.now(),
      offerAt: 0,
      lastSeenAt: Date.now(),
      lastStatusAt: 0,
      lastPingAt: 0,
      region: this.region,
      mode: this.mode,
      primary,
    };

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [session.id]);
    server.serializeAttachment(session);
    this.sessions.set(server, session);
    server.send(JSON.stringify({ type: "welcome", queue: true, version: 1 }));
    this.ensureLoop();
    await this.tryMatch();

    return new Response(null, { status: 101, webSocket: client });
  }

  ensureLoop() {
    if (this.interval) return;
    this.interval = setInterval(() => {
      this.tick().catch((error) => console.error("matchmaker tick failed", error));
    }, 500);
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
      // Ignore send failures.
    }
  }

  async tick() {
    const sockets = Array.from(this.sessions.entries()).sort((a, b) => a[1].joinedAt - b[1].joinedAt);
    if (!sockets.length) {
      this.maybeStopLoop();
      return;
    }

    const now = Date.now();
    for (const [ws, session] of sockets) {
      if (now - session.lastSeenAt > RATE_LIMITS.timeoutMs) {
        try {
          ws.close(1001, "Timeout");
        } catch {
          // Ignore close failures.
        }
        this.sessions.delete(ws);
        continue;
      }

      if (now - session.lastStatusAt >= RATE_LIMITS.queueStatusMs) {
        const needed = MODE_DEFS[this.mode].players;
        this.send(ws, {
          type: "queue_status",
          waiting: this.sessions.size,
          needed,
          elapsedMs: now - session.windowStartedAt,
        });
        session.lastStatusAt = now;
      }

      if (!session.offerAt && now - session.windowStartedAt >= RATE_LIMITS.queueWindowMs) {
        session.offerAt = now;
        this.send(ws, { type: "bot_offer", countdownMs: RATE_LIMITS.botOfferMs });
      }

      if (session.offerAt && now - session.offerAt >= RATE_LIMITS.botOfferMs) {
        try {
          ws.close(1000, "Bot fallback");
        } catch {
          // Ignore close failures.
        }
        this.sessions.delete(ws);
      }

      if (now - session.lastPingAt >= RATE_LIMITS.pingMs) {
        this.send(ws, { type: "ping", ts: now });
        session.lastPingAt = now;
      }
    }

    if (sockets.length) await this.tryMatch();
  }

  async tryMatch() {
    if (this.matching) return;
    this.matching = true;
    try {
      if (!this.mode || !MODE_DEFS[this.mode]) return;

      const needed = MODE_DEFS[this.mode].players;
      const ordered = Array.from(this.sessions.entries())
        .sort((a, b) => a[1].joinedAt - b[1].joinedAt);

      while (ordered.length >= needed) {
        const group = ordered.splice(0, needed);
        const roomId = this.env.ROOM.newUniqueId();
        const roomStub = this.env.ROOM.get(roomId, { locationHint: this.region === "asia" ? "apac" : "wnam" });
        const roster = group.map(([, session], index) => ({
          id: crypto.randomUUID(),
          name: session.name,
          ticket: crypto.randomUUID(),
          team: teamForSeat(this.mode, index),
          primary: session.primary,
        }));

        await roomStub.fetch("https://room/internal/setup-match", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            roomId: roomId.toString(),
            region: this.region,
            mode: this.mode,
            roster,
          }),
        });

        group.forEach(([ws, session], index) => {
          this.send(ws, {
            type: "match_found",
            roomId: roomId.toString(),
            ticket: roster[index].ticket,
            region: this.region,
          });
          try {
            ws.close(1000, "Matched");
          } catch {
            // Ignore close failures.
          }
          this.sessions.delete(ws);
        });
      }
    } finally {
      this.matching = false;
      this.maybeStopLoop();
    }
  }

  async webSocketMessage(ws, rawMessage) {
    const session = this.sessions.get(ws);
    if (!session) return;
    session.lastSeenAt = Date.now();
    let message = null;
    try {
      message = JSON.parse(typeof rawMessage === "string" ? rawMessage : new TextDecoder().decode(rawMessage));
    } catch {
      return;
    }

    if (message.type === "keep_waiting") {
      session.windowStartedAt = Date.now();
      session.offerAt = 0;
      return;
    }
    if (message.type === "leave") {
      try {
        ws.close(1000, "Leave");
      } catch {
        // Ignore close failures.
      }
      this.sessions.delete(ws);
      return;
    }
  }

  async webSocketClose(ws, code, reason) {
    this.sessions.delete(ws);
    try {
      ws.close(code, reason);
    } catch {
      // Ignore close failures.
    }
    this.maybeStopLoop();
  }

  async webSocketError(ws) {
    this.sessions.delete(ws);
    try {
      ws.close(1011, "Socket error");
    } catch {
      // Ignore close failures.
    }
    this.maybeStopLoop();
  }
}
