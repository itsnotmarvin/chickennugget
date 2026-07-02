import {
  BODY_RADIUS,
  cellCenter,
  clampToPlayableBounds,
  collides,
  hasLos,
  segmentCrossesWall,
  wallRay,
} from "../../shared/collision.js";
import {
  distance3,
  EYE_HEIGHT,
  isBackstab,
  KNIFE_STATS,
  nearestCapsuleHit,
  normalizeVector,
  WEAPON_STATS,
  withinFacingCone,
} from "../../shared/combat.js";
import { SPAWN_CELLS } from "../../shared/map-data.js";
import { INPUT_BOUNDS, MODE_DEFS, PHASE_MS } from "../../shared/protocol.js";

const DEFAULT_PRIMARY = "pike";
const DEFAULT_SIDEARM = "backstop";
const DEFAULT_MELEE = "knife";

function createWeaponState(id) {
  if (id === DEFAULT_MELEE) {
    return { id, mag: 0, reserve: 0, reloadEndsAt: 0, lastShotAt: 0 };
  }
  const weapon = WEAPON_STATS[id];
  return {
    id,
    mag: weapon.mag,
    reserve: weapon.reserve,
    reloadEndsAt: 0,
    lastShotAt: 0,
  };
}

export function createPlayerState(entry) {
  return {
    id: entry.id,
    name: entry.name,
    team: entry.team,
    ticket: entry.ticket ?? null,
    primary: entry.primary ?? DEFAULT_PRIMARY,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    vx: 0,
    vz: 0,
    anim: "idle",
    hp: 100,
    alive: false,
    connected: false,
    kills: 0,
    deaths: 0,
    damage: 0,
    activeWeapon: entry.primary ?? DEFAULT_PRIMARY,
    weapons: {
      [entry.primary ?? DEFAULT_PRIMARY]: createWeaponState(entry.primary ?? DEFAULT_PRIMARY),
      [DEFAULT_SIDEARM]: createWeaponState(DEFAULT_SIDEARM),
      [DEFAULT_MELEE]: createWeaponState(DEFAULT_MELEE),
    },
    rate: {
      input: [],
      melee: [],
    },
    lastSeenAt: 0,
    lastInputAt: 0,
    lastInputSeq: -1,
    lastMeleeAt: 0,
  };
}

export function createRoomLiveState(meta) {
  const players = new Map();
  for (const entry of meta.roster ?? []) {
    players.set(entry.id, createPlayerState(entry));
  }
  return {
    phase: "lobby",
    round: 0,
    scoreBlue: 0,
    scoreRed: 0,
    phaseEndsAt: 0,
    roundEndsAt: 0,
    lastSnapshotAt: 0,
    lastPingAt: 0,
    players,
  };
}

export function roomCapacity(modeId) {
  return MODE_DEFS[modeId].players;
}

export function teamForSeat(modeId, seatIndex) {
  if (modeId === "duel") return seatIndex === 0 ? "blue" : "red";
  return seatIndex < 2 ? "blue" : "red";
}

export function roomHasCapacity(meta) {
  return (meta.roster?.length ?? 0) < roomCapacity(meta.mode);
}

export function addPrivateRosterEntry(meta, live, name, now = Date.now()) {
  const seat = meta.roster.length;
  const entry = {
    id: crypto.randomUUID(),
    name,
    team: teamForSeat(meta.mode, seat),
    createdAt: now,
    primary: DEFAULT_PRIMARY,
  };
  meta.roster.push(entry);
  const player = createPlayerState(entry);
  live.players.set(entry.id, player);
  return entry;
}

function spawnYawForCell(cell) {
  const { x, z } = cellCenter(cell.r, cell.c);
  return Math.atan2(x, z);
}

export function resetPlayerForRound(player, spawnCell) {
  const { x, z } = cellCenter(spawnCell.r, spawnCell.c);
  player.x = x;
  player.y = 0;
  player.z = z;
  player.yaw = spawnYawForCell(spawnCell);
  player.pitch = 0;
  player.vx = 0;
  player.vz = 0;
  player.anim = "idle";
  player.hp = 100;
  player.alive = player.connected;
  player.activeWeapon = player.primary;
  player.weapons[player.primary] = createWeaponState(player.primary);
  player.weapons[DEFAULT_SIDEARM] = createWeaponState(DEFAULT_SIDEARM);
  player.weapons[DEFAULT_MELEE] = createWeaponState(DEFAULT_MELEE);
  player.lastMeleeAt = 0;
}

export function beginFreeze(meta, live, now = Date.now()) {
  const blueSeats = SPAWN_CELLS.blue;
  const redSeats = SPAWN_CELLS.red;
  let blueIndex = 0;
  let redIndex = 0;

  for (const player of live.players.values()) {
    const spawnCell = player.team === "blue"
      ? blueSeats[blueIndex % blueSeats.length]
      : redSeats[redIndex % redSeats.length];
    if (player.team === "blue") blueIndex += 1;
    else redIndex += 1;
    resetPlayerForRound(player, spawnCell);
  }

  live.round += 1;
  live.phase = "freeze";
  live.phaseEndsAt = now + PHASE_MS.freeze;
  live.roundEndsAt = live.phaseEndsAt + MODE_DEFS[meta.mode].roundMs;
  live.lastSnapshotAt = 0;
}

export function allSeatsConnected(meta, live) {
  if ((meta.roster?.length ?? 0) !== roomCapacity(meta.mode)) return false;
  return meta.roster.every((entry) => live.players.get(entry.id)?.connected);
}

export function playerSummary(player) {
  return {
    id: player.id,
    name: player.name,
    team: player.team,
    connected: player.connected,
    alive: player.alive,
    hp: player.hp,
    kills: player.kills,
    deaths: player.deaths,
    weapon: player.activeWeapon,
  };
}

export function serializeRoomState(meta, live, selfId = null) {
  return {
    type: "room_state",
    roomId: meta.roomId,
    code: meta.code ?? null,
    region: meta.region,
    mode: meta.mode,
    phase: live.phase,
    round: live.round,
    selfId,
    scoreBlue: live.scoreBlue,
    scoreRed: live.scoreRed,
    phaseEndsAt: live.phaseEndsAt,
    roundEndsAt: live.roundEndsAt,
    players: Array.from(live.players.values(), playerSummary),
  };
}

export function serializeSnapshot(live, now = Date.now()) {
  return {
    type: "snapshot",
    serverTime: now,
    players: Array.from(live.players.values(), (player) => ({
      id: player.id,
      x: player.x,
      y: player.y,
      z: player.z,
      yaw: player.yaw,
      pitch: player.pitch,
      vx: player.vx,
      vz: player.vz,
      anim: player.anim,
      hp: player.hp,
      alive: player.alive,
      weapon: player.activeWeapon,
    })),
  };
}

export function advanceReload(player, now = Date.now()) {
  const current = player.weapons[player.activeWeapon];
  if (!current || !current.reloadEndsAt || current.reloadEndsAt > now) return false;
  const weapon = WEAPON_STATS[current.id];
  if (!weapon) {
    current.reloadEndsAt = 0;
    return false;
  }
  const need = weapon.mag - current.mag;
  const take = Math.min(need, current.reserve);
  current.mag += take;
  current.reserve -= take;
  current.reloadEndsAt = 0;
  return true;
}

export function beginReload(player, now = Date.now()) {
  const current = player.weapons[player.activeWeapon];
  const weapon = WEAPON_STATS[current?.id];
  if (!current || !weapon) return false;
  if (current.reloadEndsAt > now) return false;
  if (current.mag >= weapon.mag || current.reserve <= 0) return false;
  current.reloadEndsAt = now + weapon.reloadMs;
  return true;
}

export function switchWeapon(player, weaponId) {
  if (!player.weapons[weaponId]) return false;
  player.activeWeapon = weaponId;
  return true;
}

export function acceptMovementClaim(player, claim, now = Date.now()) {
  const dt = Math.max(0.016, Math.min(0.25, (now - (player.lastInputAt || now - 50)) / 1000));
  const maxStep = INPUT_BOUNDS.maxVelocity * dt * 1.25;
  const clamped = clampToPlayableBounds(claim.x, claim.z);
  const displacement = Math.hypot(
    clamped.x - player.x,
    claim.y - player.y,
    clamped.z - player.z,
  );

  const wallViolation = segmentCrossesWall(player.x, player.z, clamped.x, clamped.z, Math.max(0, player.y))
    || collides(clamped.x, clamped.z, Math.max(0, claim.y));

  const accepted = displacement <= maxStep && !wallViolation;
  player.lastSeenAt = now;
  player.lastInputAt = now;

  if (!accepted) {
    return {
      accepted: false,
      snapped: true,
      position: { x: player.x, y: player.y, z: player.z },
    };
  }

  player.lastInputSeq = claim.seq;
  player.x = clamped.x;
  player.y = claim.y;
  player.z = clamped.z;
  player.yaw = claim.yaw;
  player.pitch = claim.pitch;
  player.vx = claim.vx;
  player.vz = claim.vz;
  player.anim = typeof claim.anim === "string" ? claim.anim : player.anim;

  return {
    accepted: true,
    snapped: false,
    position: { x: player.x, y: player.y, z: player.z },
  };
}

function applyDamage(attacker, victim, amount, weaponId, headshot) {
  const damage = Math.min(amount, victim.hp);
  victim.hp -= amount;
  attacker.damage += damage;
  if (victim.hp <= 0) {
    victim.hp = 0;
    victim.alive = false;
    victim.deaths += 1;
    attacker.kills += 1;
    return {
      hit: {
        type: "hit",
        attackerId: attacker.id,
        victimId: victim.id,
        weapon: weaponId,
        damage: amount,
        hp: victim.hp,
        head: headshot,
      },
      kill: {
        type: "kill",
        attackerId: attacker.id,
        victimId: victim.id,
        weapon: weaponId,
        head: headshot,
      },
    };
  }

  return {
    hit: {
      type: "hit",
      attackerId: attacker.id,
      victimId: victim.id,
      weapon: weaponId,
      damage: amount,
      hp: victim.hp,
      head: headshot,
    },
    kill: null,
  };
}

export function handleFire(player, shot, others, now = Date.now()) {
  advanceReload(player, now);
  if (!player.alive) return null;
  if (player.activeWeapon !== shot.weapon) return null;
  const current = player.weapons[shot.weapon];
  const weapon = WEAPON_STATS[shot.weapon];
  if (!current || !weapon) return null;
  if (current.reloadEndsAt > now) return null;
  if (current.mag <= 0) return null;
  if (now - current.lastShotAt < weapon.cooldownMs) return null;

  const serverOrigin = { x: player.x, y: player.y + EYE_HEIGHT, z: player.z };
  const clientOrigin = { x: shot.ox, y: shot.oy, z: shot.oz };
  if (distance3(serverOrigin, clientOrigin) > 1.5) return null;

  const direction = normalizeVector(shot.dx, shot.dy, shot.dz);
  if (!direction) return null;

  current.lastShotAt = now;
  current.mag -= 1;

  const wallDist = wallRay(
    clientOrigin.x,
    clientOrigin.y,
    clientOrigin.z,
    direction.x,
    direction.y,
    direction.z,
    weapon.range,
  );
  const hit = nearestCapsuleHit(clientOrigin, direction, others, Math.min(weapon.range, wallDist));
  if (!hit) return null;

  const damage = hit.head ? weapon.damage * weapon.headMult : weapon.damage;
  return applyDamage(player, hit.player, damage, weapon.id, hit.head);
}

export function handleMelee(player, attack, others, now = Date.now()) {
  if (!player.alive || player.activeWeapon !== DEFAULT_MELEE) return null;

  const spec = KNIFE_STATS[attack.kind];
  if (!spec) return null;
  const gateMs = Math.max(500, spec.cooldownMs);
  if (now - player.lastMeleeAt < gateMs) return null;

  const direction = normalizeVector(attack.dx, attack.dy, attack.dz);
  if (!direction) return null;

  const origin = { x: attack.ox, y: attack.oy, z: attack.oz };
  const serverOrigin = { x: player.x, y: player.y + EYE_HEIGHT, z: player.z };
  if (distance3(serverOrigin, origin) > 1.5) return null;

  let best = null;
  for (const other of others) {
    if (!other.alive) continue;
    const dist = Math.hypot(other.x - player.x, other.z - player.z) - BODY_RADIUS;
    if (dist > spec.range) continue;
    if (!withinFacingCone(player, other, spec.coneDeg)) continue;
    if (!hasLos(origin.x, origin.y, origin.z, other.x, other.y + 1.1, other.z)) continue;
    if (!best || dist < best.dist) best = { player: other, dist };
  }
  if (!best) return null;

  player.lastMeleeAt = now;
  let damage = spec.damage;
  const headshot = false;
  if (attack.kind === "stab" && isBackstab(player, best.player)) {
    damage *= KNIFE_STATS.stab.backstabMultiplier;
  }
  return applyDamage(player, best.player, damage, DEFAULT_MELEE, headshot);
}

export function currentRoundWinner(live) {
  let blueAlive = false;
  let redAlive = false;
  for (const player of live.players.values()) {
    if (!player.alive) continue;
    if (player.team === "blue") blueAlive = true;
    if (player.team === "red") redAlive = true;
  }
  if (blueAlive && redAlive) return null;
  if (blueAlive) return "blue";
  if (redAlive) return "red";
  return "draw";
}

function summedAliveHp(live, team) {
  let total = 0;
  for (const player of live.players.values()) {
    if (!player.alive || player.team !== team) continue;
    total += Math.max(0, player.hp);
  }
  return total;
}

export function timeoutRoundWinner(live) {
  const blueHp = summedAliveHp(live, "blue");
  const redHp = summedAliveHp(live, "red");
  if (blueHp === redHp) return "draw";
  return blueHp > redHp ? "blue" : "red";
}

export function matchWinner(live) {
  if (live.scoreBlue === live.scoreRed) return "draw";
  return live.scoreBlue > live.scoreRed ? "blue" : "red";
}

export function markDisconnected(live, playerId) {
  const player = live.players.get(playerId);
  if (!player) return null;
  player.connected = false;
  player.lastSeenAt = 0;
  if (live.phase === "freeze" || live.phase === "live") {
    player.alive = false;
    player.hp = 0;
  }
  return player;
}
