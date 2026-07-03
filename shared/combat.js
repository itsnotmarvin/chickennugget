export const WEAPON_STATS = Object.freeze({
  pike: Object.freeze({
    id: "pike",
    slot: "primary",
    damage: 26,
    headMult: 2.4,
    cooldownMs: 102,
    reloadMs: 1900,
    mag: 30,
    reserve: 90,
    range: 60,
    speedMult: 1,
  }),
  wasp: Object.freeze({
    id: "wasp",
    slot: "primary",
    damage: 18,
    headMult: 2,
    cooldownMs: 66,
    reloadMs: 1500,
    mag: 26,
    reserve: 104,
    range: 34,
    speedMult: 1.09,
  }),
  longshot: Object.freeze({
    id: "longshot",
    slot: "primary",
    damage: 60,
    headMult: 2.2,
    cooldownMs: 520,
    reloadMs: 2200,
    mag: 10,
    reserve: 40,
    range: 120,
    speedMult: 0.94,
  }),
  hawk: Object.freeze({
    id: "hawk",
    slot: "primary",
    damage: 109,
    headMult: 1.5,
    cooldownMs: 1000,
    reloadMs: 1900,
    mag: 3,
    reserve: 18,
    range: 160,
    speedMult: 0.95,
  }),
  backstop: Object.freeze({
    id: "backstop",
    slot: "sidearm",
    damage: 25,
    headMult: 2.6,
    cooldownMs: 175,
    reloadMs: 1300,
    mag: 12,
    reserve: 36,
    range: 40,
    speedMult: 1,
  }),
});

export const KNIFE_STATS = Object.freeze({
  id: "knife",
  slot: "melee",
  moveSpeedMult: 1.1,
  slash: Object.freeze({
    kind: "slash",
    damage: 45,
    cooldownMs: 450,
    range: 2.2,
    feelRange: 1.9,
    coneDeg: 70,
  }),
  stab: Object.freeze({
    kind: "stab",
    damage: 90,
    cooldownMs: 1000,
    range: 1.7,
    coneDeg: 30,
    backstabMultiplier: 2,
    backstabBehindDeg: 60,
  }),
});

export const BODY_CYLINDER_RADIUS = 0.42;
export const BODY_CYLINDER_HEIGHT = 1.5;
export const HEAD_RADIUS = 0.27;
export const HEAD_CENTER_Y = 1.62;
export const EYE_HEIGHT = 1.62;

export function weaponRpm(weaponId) {
  const weapon = WEAPON_STATS[weaponId];
  return weapon ? 60000 / weapon.cooldownMs : 0;
}

export function normalizeVector(x, y, z) {
  const length = Math.hypot(x, y, z);
  if (length < 1e-6) return null;
  return { x: x / length, y: y / length, z: z / length };
}

export function distance3(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function wrapAngle(angle) {
  let next = angle;
  while (next > Math.PI) next -= Math.PI * 2;
  while (next < -Math.PI) next += Math.PI * 2;
  return next;
}

export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, radius) {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const t = lx * dx + ly * dy + lz * dz;
  if (t < 0) return null;
  const px = ox + dx * t - cx;
  const py = oy + dy * t - cy;
  const pz = oz + dz * t - cz;
  const d2 = px * px + py * py + pz * pz;
  if (d2 > radius * radius) return null;
  return Math.max(0.01, t - Math.sqrt(radius * radius - d2));
}

export function rayCylinder(ox, oy, oz, dx, dy, dz, cx, cz, radius, yMin, yMax) {
  const fx = ox - cx;
  const fz = oz - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-8) return null;
  const b = 2 * (fx * dx + fz * dz);
  const cc = fx * fx + fz * fz - radius * radius;
  const disc = b * b - 4 * a * cc;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0) return null;
  const y = oy + dy * t;
  if (y < yMin || y > yMax) return null;
  return t;
}

export function raycastPlayerCapsule(origin, direction, player, maxDist = Infinity) {
  const headHit = raySphere(
    origin.x,
    origin.y,
    origin.z,
    direction.x,
    direction.y,
    direction.z,
    player.x,
    player.y + HEAD_CENTER_Y,
    player.z,
    HEAD_RADIUS,
  );
  if (headHit !== null && headHit <= maxDist) {
    return { dist: headHit, head: true };
  }

  const bodyHit = rayCylinder(
    origin.x,
    origin.y,
    origin.z,
    direction.x,
    direction.y,
    direction.z,
    player.x,
    player.z,
    BODY_CYLINDER_RADIUS,
    player.y,
    player.y + BODY_CYLINDER_HEIGHT,
  );
  if (bodyHit !== null && bodyHit <= maxDist) {
    return { dist: bodyHit, head: false };
  }

  return null;
}

export function nearestCapsuleHit(origin, direction, targets, maxDist = Infinity) {
  let best = null;
  for (const player of targets) {
    const hit = raycastPlayerCapsule(origin, direction, player, maxDist);
    if (!hit) continue;
    if (!best || hit.dist < best.dist) best = { ...hit, player };
  }
  return best;
}

export function withinFacingCone(attacker, target, coneDeg) {
  const forwardX = -Math.sin(attacker.yaw);
  const forwardZ = -Math.cos(attacker.yaw);
  const dx = target.x - attacker.x;
  const dz = target.z - attacker.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return true;
  const dot = (forwardX * dx + forwardZ * dz) / length;
  return dot >= Math.cos((coneDeg * Math.PI) / 180 / 2);
}

export function isBackstab(attacker, victim) {
  const victimForwardX = -Math.sin(victim.yaw);
  const victimForwardZ = -Math.cos(victim.yaw);
  const rearX = -victimForwardX;
  const rearZ = -victimForwardZ;
  const toAttackerX = attacker.x - victim.x;
  const toAttackerZ = attacker.z - victim.z;
  const length = Math.hypot(toAttackerX, toAttackerZ);
  if (length < 1e-6) return false;
  const dot = (rearX * toAttackerX + rearZ * toAttackerZ) / length;
  return dot >= Math.cos((KNIFE_STATS.stab.backstabBehindDeg * Math.PI) / 180);
}
