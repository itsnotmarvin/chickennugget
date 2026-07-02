import { MatchmakerDO } from "./matchmaker.js";
import { RoomDO } from "./room.js";
import {
  errorMessage,
  protocolMeta,
  REGION_HINTS,
  validateMode,
  validateName,
  validateRegion,
  validateRoomCode,
  RATE_LIMITS,
} from "../../shared/protocol.js";
import { SlidingWindowLimiter } from "./limits.js";

const createRoomLimiter = new SlidingWindowLimiter();

const CORS_HEADERS = Object.freeze({
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
});

function withCors(headers = {}) {
  return {
    ...headers,
    ...CORS_HEADERS,
  };
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: withCors({
      "content-type": "application/json; charset=utf-8",
      ...headers,
    }),
  });
}

function text(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: withCors(headers),
  });
}

function preflight() {
  return new Response(null, {
    status: 204,
    headers: withCors(),
  });
}

function clientIp(request) {
  return request.headers.get("CF-Connecting-IP")
    || request.headers.get("x-forwarded-for")
    || "unknown";
}

function roomStubFor(env, roomKey, region) {
  const codeCheck = validateRoomCode(roomKey);
  if (codeCheck.ok) {
    const id = env.ROOM.idFromName(`private:${codeCheck.value}`);
    return env.ROOM.get(id, { locationHint: REGION_HINTS[region] });
  }
  try {
    const id = env.ROOM.idFromString(roomKey);
    return env.ROOM.get(id, { locationHint: REGION_HINTS[region] });
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);

    if (request.method === "OPTIONS") {
      return preflight();
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, now: Date.now() });
    }

    if (request.method === "GET" && url.pathname === "/version") {
      return json({ protocol: protocolMeta(), deployedAt: "2026-07-02", worker: "angle-protocol" });
    }

    if (request.method === "POST" && url.pathname === "/rooms") {
      const ip = clientIp(request);
      if (!createRoomLimiter.allow(ip, RATE_LIMITS.roomCreatesPerMinute, 60000)) {
        return json(errorMessage("rate_limited"), 429);
      }

      const body = await request.json().catch(() => null);
      if (!body || !validateRegion(body.region) || !validateMode(body.mode)) {
        return json(errorMessage("malformed"), 400);
      }
      const nameCheck = validateName(body.name ?? "");
      if (!nameCheck.ok) return json(errorMessage(nameCheck.code), 400);

      let code = "";
      do {
        code = Array.from(crypto.getRandomValues(new Uint8Array(6)))
          .map((value) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[value % 32])
          .join("");
      } while (!validateRoomCode(code).ok);

      const id = env.ROOM.idFromName(`private:${code}`);
      const stub = env.ROOM.get(id, { locationHint: REGION_HINTS[body.region] });
      await stub.fetch("https://room/internal/create-private", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomId: id.toString(),
          code,
          region: body.region,
          mode: body.mode,
          name: nameCheck.value,
        }),
      });

      return json({ code, region: body.region });
    }

    if (request.method === "GET" && parts[0] === "queue" && parts[3] === "ws") {
      const [, region, mode] = parts;
      if (!validateRegion(region) || !validateMode(mode)) {
        return json(errorMessage("malformed"), 400);
      }
      const id = env.MATCHMAKER.idFromName(`queue:${region}:${mode}`);
      const stub = env.MATCHMAKER.get(id, { locationHint: REGION_HINTS[region] });
      return stub.fetch(request);
    }

    if (request.method === "GET" && parts[0] === "room" && parts[2] === "ws") {
      const roomKey = parts[1];
      const region = url.searchParams.get("region") ?? "uswest";
      if (!validateRegion(region)) return json(errorMessage("region_mismatch"), 409);
      const stub = roomStubFor(env, roomKey, region);
      if (!stub) return json(errorMessage("room_not_found"), 404);
      return stub.fetch(request);
    }

    return text("Not found", 404);
  },
};

export { MatchmakerDO, RoomDO };
