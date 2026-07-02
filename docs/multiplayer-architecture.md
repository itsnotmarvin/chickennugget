# Angle Protocol — v1 Multiplayer Architecture

Status: ADR, governs the v1 online implementation. Owner: David. Written 2026-07-02.

## Goals

Two players load the game from different places, pick a display name (no account),
queue or join by invite code, and play a server-authoritative match. Offline Bot
Strike, Training Range, progression, settings, and audio are preserved unchanged.

## Hosting

- **Frontend**: GitHub Pages (repo root, `main` branch) — unchanged.
- **Backend**: Cloudflare Workers + Durable Objects, free tier. SQLite-backed DO
  storage (`new_sqlite_classes` migration). No paid provider without explicit approval.
- Frontend talks to the backend cross-origin via WebSocket/HTTPS. Backend URL lives
  in `js/config.js` (public, not a secret) and can be overridden with `?backend=`
  query param or `localStorage.angleBackendOverride` for local dev.

## Repo layout (new)

```
server/
  wrangler.jsonc        # worker "angle-protocol", DO bindings, migrations
  src/index.js          # Worker fetch router: /health /version /rooms /queue/* /room/*
  src/matchmaker.js     # MatchmakerDO
  src/room.js           # RoomDO (authoritative match sim)
  src/limits.js         # rate limiting helpers
  test/*.test.mjs       # node --test unit tests (protocol, combat math, movement clamp)
shared/
  map-data.js           # MAP_GRID, CELL_SIZE, CELL_HEIGHTS, spawn cells (moved from js/data.js — js/data.js re-exports)
  collision.js          # cellOf/heightAt/collides/groundAt/wallRay/hasLos (extracted from js/engine.js)
  combat.js             # weapon + knife damage/range/rate constants, capsule hit test
  protocol.js           # message types, schema validators, bounds, rate constants
js/
  config.js             # public backend URL + region endpoints metadata
  net.js                # WS client: queue, rooms, snapshot buffer, interpolation, send loop
docs/
  multiplayer-architecture.md   # this file
  deploy.md             # deploy/update/rollback runbook
```

Both the browser (native ES modules, no build step) and the Worker (wrangler/esbuild)
import `shared/` via relative paths. Keep `shared/` dependency-free and DOM-free.

## Durable Object topology

### MatchmakerDO — one instance per (region, mode)

- Id: `idFromName("queue:{region}:{mode}")`, created with `locationHint`
  (`uswest → wnam`, `asia → apac`).
- Client: `GET /queue/{region}/{mode}/ws?name=...` (WebSocket).
- Modes: `duel` (1v1, needs 2), `squad` (2v2, needs 4).
- Pairs players FIFO; on enough players it creates a room id
  (`ROOM.newUniqueId()`), sends each client `match_found { roomId, ticket, region }`,
  then closes their queue sockets. Tickets are random UUIDs the RoomDO checks
  (matchmaker passes roster to the room via an internal fetch before notifying clients).
- Sends `queue_status { waiting, needed, elapsedMs }` every ~2s.
- After `QUEUE_WINDOW_MS` (25 000) without a full lobby, sends
  `bot_offer { countdownMs }` (10 000). Client shows the fallback modal
  (Cancel / Keep Waiting / Play Bots Now). "Keep Waiting" restarts the window
  (client sends `keep_waiting`). Countdown expiry or "Play Bots Now" → client
  leaves the queue and starts a **local** bot match. Real players arriving during
  the countdown still produce `match_found`. Never silently switch to bots.
- Uses WebSocket Hibernation API (`state.acceptWebSocket`, `webSocketMessage`).

### RoomDO — one instance per match or private room

- Matched rooms: `newUniqueId()` with `locationHint`. Private rooms:
  `idFromName("private:{CODE}")`, code `[A-Z2-9]{6}`, created via
  `POST /rooms { region, mode, name }` → `{ code, region }`.
- Client: `GET /room/{roomIdOrCode}/ws?name=...&ticket=...`.
- Owns: roster, teams, phase (`lobby → freeze → live → round_end → match_end`),
  round timer, scores (first to 4 rounds, matching offline Bot Strike), HP,
  damage, deaths, respawn-on-next-round, match end, disconnect cleanup.
- Tick: 20 Hz sim, 15 Hz snapshot broadcast while `live`; no timers when idle in
  lobby (hibernation-friendly). Persist room metadata (code, mode, roster names,
  consent-relevant nothing) to DO storage; live sim state is memory-only —
  **a deploy resets in-flight matches** (documented limitation).
- Capacity: 2 (duel) / 4 (squad) + reject with structured errors:
  `{ type:"error", code:"room_full" | "room_not_found" | "bad_ticket" | "stale_invite" | "name_invalid" | "rate_limited" | "region_mismatch" }`.

## Authority model

- **Server-authoritative**: HP, damage, kills, deaths, scores, round/match phase,
  timers, room membership, results. Clients never report damage or hits as truth.
- **Movement**: client sends claims `input { seq, x, y, z, yaw, pitch, vx, vz, anim }`
  at ≤ 30 Hz. Server clamps: per-packet displacement ≤ maxSpeed × dt × 1.25,
  position inside map bounds, no crossing solid cells (`shared/collision.js`
  `collides`/`wallRay` check between last accepted and claimed position; on
  violation, snap back to last valid). Accepted position becomes server truth.
- **Hitscan fire**: client sends `fire { seq, ox,oy,oz, dx,dy,dz, weapon }`.
  Server: rate-limit vs weapon RPM, origin within 1.5 m of server position,
  `wallRay` for wall hit, capsule test vs other players at latest server
  positions (no lag compensation in v1 — documented), headshot if hit height in
  top capsule segment, apply damage, broadcast `hit`/`kill`.
- **Melee**: `melee { kind: "slash"|"stab", ox..dz }`. Range ≤ 2.2 m (slash) /
  1.7 m (stab), 70°/30° facing cone, LOS required, rate ≤ 2/s. Backstab
  (attacker behind victim ±60°) doubles stab damage.
- **Rendering** stays 100% client-side Three.js. Remote players interpolate
  ~100 ms behind latest snapshots; local player is client-predicted (server
  clamp corrections snap only on large divergence > 2 m).

## Protocol (`shared/protocol.js`)

JSON messages v1 (debuggable; binary later if needed). Every inbound message is
schema-validated: unknown type → ignore + count; malformed → structured error;
repeated abuse → close 1008. Bounds: name 3–16 code points (letters, digits,
space, `_ - .`, CJK allowed; control chars stripped; trimmed); room code
`^[A-Z2-9]{6}$`; positions within map AABB; |velocity| ≤ 12 m/s; pitch ±89°;
rates: input ≤ 40/s, fire ≤ weapon RPM + 20 %, melee ≤ 2/s, chatless v1 (no
chat messages in v1). Queue joins ≤ 6/min/socket, room creates ≤ 3/min/IP
(best-effort per-DO counters). Heartbeat `ping`/`pong` every 10 s; 30 s silence → disconnect + cleanup.

Client → server: `join`, `input`, `fire`, `melee`, `reload`, `switch_weapon`,
`keep_waiting`, `leave`, `pong`.
Server → client: `welcome`, `queue_status`, `bot_offer`, `match_found`,
`room_state`, `snapshot`, `hit`, `kill`, `round_start`, `round_end`,
`match_end`, `player_joined`, `player_left`, `error`, `ping`.

## Regions — honest v1 behavior

UI options: **Auto**, **US West**, **Asia**. These are Cloudflare `locationHint`s
(`wnam`, `apac`) — best-effort placement near that region, not hard pinning;
there is a single global backend URL. Auto measures latency by timing
`GET /health` and currently just picks the default hint (documented: with one
Worker URL, Auto ≈ nearest edge automatically). Invite links carry region +
room: `?room=ABCD12&region=asia`. Document all of this in README; do not
promise hard pinning.

## Guest identity & consent

- No account. Display name entered on the Play screen, persisted in the existing
  localStorage save (`callsign`). Progression stays local (works in mainland China).
- First-run **consent modal** gates online play only: short, game-friendly copy
  covering guest play, network/gameplay data during online matches, local stats,
  and future optional Google sign-in. Buttons: Accept / Decline / Details
  (expandable). Stored as `{ version: 1, acceptedAt }` under
  `angleConsent_v1`. Decline → offline modes only; online buttons prompt again.
- **Google sign-in**: v1 ships a clean stub interface (`js/auth.js` with
  `getIdentity()`, `signIn()` throwing `not_implemented`) + UI affordance hidden
  behind a `config.js` flag (off). Documented as remaining work.

## Knife / melee (original, CS-inspired feel)

- Slot 3 (key `3`; `Q` toggles last weapon). Knife out = +10 % move speed.
- LMB **slash**: 45 dmg, 0.45 s swing, 1.9 m, wide arc. RMB **stab**: 90 dmg
  (×2 backstab = 180), 1.0 s, 1.7 m, narrow. `F` inspect/flip animation.
- Constants live in `shared/combat.js`; offline engine and RoomDO use the same
  numbers. Viewmodel: simple low-poly blade matching existing art style.

## Client UI direction

First screen is an **io-game lobby** (Krunker/Cryzen energy), not a marketing
page: top nav (Play / Loadout / Profile / Settings), central 3D-ish preview or
lobby backdrop, big PLAY button with mode selector (Random 1v1, Random 2v2,
2v2 vs Bots, Private Room, Practice), name input adjacent, compact region
select, join-by-code field, quick-settings gear. Practice/Training demoted to
secondary placement. All player-controlled strings rendered via `textContent`
(never `innerHTML`) — audit existing `escapeHtml` usages too.

## Scripts (root `package.json`)

- `dev:web` — static server for repo root (port 5173, no cache).
- `dev:api` — `wrangler dev` (port 8787) with `--config server/wrangler.jsonc`.
- `dev` — both concurrently.
- `check` — `node --check` over all first-party modules + `node --test server/test`.
- `deploy:api` — `wrangler deploy --config server/wrangler.jsonc`.
- Frontend deploy = push to `main` (GitHub Pages). Documented in `docs/deploy.md`
  with rollback notes (revert commit / `wrangler rollback`).

## Known v1 limitations (document in README)

- No lag compensation; hit registration favors shooter's server-side view.
- In-flight matches reset on backend deploy.
- 2v2: queueing, rooms, and sim support 4 players; full 2v2 polish (team spawn
  logic, ally HUD) may lag 1v1 — state exactly what remains in README.
- "2v2 vs Bots" runs on the local engine (existing Bot Strike), not the server.
- Region hints are best-effort placement, not pinning.
- Google sign-in is a stub.

## v1 deltas

- Knife controls shipped as `1` primary, `2` sidearm, `3` knife, `4` Splinter,
  `5` Dazzler, with `F` reserved for knife inspect.
- Round timeouts now break ties by summed alive HP, and matches hard-stop after
  round 12 with the higher score winning (`draw` on equal score).
- Private-room duplicate joins now reject with `name_taken` instead of kicking
  the connected player.
- Input rate limit shipped at `60/s` to tolerate arrival bunching over a `30/s`
  client send loop.
- Auto region currently resolves to the nearest edge behavior and uses the
  `uswest` hint for explicit room/queue selection.
