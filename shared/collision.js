import {
  CELL_HEIGHTS,
  CELL_SIZE,
  GRID_H,
  GRID_W,
  MAP_AABB,
  MAP_GRID,
  WORLD_H,
  WORLD_W,
} from "./map-data.js";

export const BODY_RADIUS = 0.36;
export const STEP_HEIGHT = 0.55;
export const PLAYABLE_MARGIN = CELL_SIZE + 0.4;
export const PLAYABLE_BOUNDS = Object.freeze({
  minX: -WORLD_W / 2 + PLAYABLE_MARGIN,
  maxX: WORLD_W / 2 - PLAYABLE_MARGIN,
  minZ: -WORLD_H / 2 + PLAYABLE_MARGIN,
  maxZ: WORLD_H / 2 - PLAYABLE_MARGIN,
});

const baseHeight = MAP_GRID.map((row) => Array.from(row, (cell) => CELL_HEIGHTS[cell] || 0));

export function cellOf(x, z) {
  return {
    c: Math.floor(x / CELL_SIZE + GRID_W / 2),
    r: Math.floor(z / CELL_SIZE + GRID_H / 2),
  };
}

export function cellCenter(r, c) {
  return {
    x: (c - GRID_W / 2 + 0.5) * CELL_SIZE,
    z: (r - GRID_H / 2 + 0.5) * CELL_SIZE,
  };
}

export function heightAt(r, c) {
  if (r < 0 || c < 0 || r >= GRID_H || c >= GRID_W) return 4;
  return baseHeight[r][c];
}

export function heightAtPos(x, z) {
  const { r, c } = cellOf(x, z);
  return heightAt(r, c);
}

export function collides(x, z, feetY = 0) {
  const minC = Math.floor((x - BODY_RADIUS) / CELL_SIZE + GRID_W / 2);
  const maxC = Math.floor((x + BODY_RADIUS) / CELL_SIZE + GRID_W / 2);
  const minR = Math.floor((z - BODY_RADIUS) / CELL_SIZE + GRID_H / 2);
  const maxR = Math.floor((z + BODY_RADIUS) / CELL_SIZE + GRID_H / 2);
  for (let r = minR; r <= maxR; r += 1) {
    for (let c = minC; c <= maxC; c += 1) {
      if (heightAt(r, c) > feetY + STEP_HEIGHT) return true;
    }
  }
  return false;
}

export function groundAt(x, z, feetY = 0) {
  const minC = Math.floor((x - BODY_RADIUS * 0.8) / CELL_SIZE + GRID_W / 2);
  const maxC = Math.floor((x + BODY_RADIUS * 0.8) / CELL_SIZE + GRID_W / 2);
  const minR = Math.floor((z - BODY_RADIUS * 0.8) / CELL_SIZE + GRID_H / 2);
  const maxR = Math.floor((z + BODY_RADIUS * 0.8) / CELL_SIZE + GRID_H / 2);
  let ground = 0;
  for (let r = minR; r <= maxR; r += 1) {
    for (let c = minC; c <= maxC; c += 1) {
      const h = heightAt(r, c);
      if (h > 0 && h <= feetY + STEP_HEIGHT && h > ground) ground = h;
    }
  }
  return ground;
}

export function wallRay(ox, oy, oz, dx, dy, dz, maxDist) {
  const step = 0.14;
  for (let dist = step; dist <= maxDist; dist += step) {
    const x = ox + dx * dist;
    const y = oy + dy * dist;
    const z = oz + dz * dist;
    if (y <= 0.02) return dist;
    if (y < heightAtPos(x, z)) return dist;
  }
  return Infinity;
}

export function hasLos(ax, ay, az, bx, by, bz) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 0.01) return true;
  return wallRay(ax, ay, az, dx / dist, dy / dist, dz / dist, dist - 0.1) === Infinity;
}

export function clampToPlayableBounds(x, z) {
  return {
    x: Math.max(PLAYABLE_BOUNDS.minX, Math.min(PLAYABLE_BOUNDS.maxX, x)),
    z: Math.max(PLAYABLE_BOUNDS.minZ, Math.min(PLAYABLE_BOUNDS.maxZ, z)),
  };
}

export function positionInMapAabb(x, y, z) {
  return x >= MAP_AABB.minX
    && x <= MAP_AABB.maxX
    && y >= MAP_AABB.minY
    && y <= MAP_AABB.maxY
    && z >= MAP_AABB.minZ
    && z <= MAP_AABB.maxZ;
}

export function segmentCrossesWall(ax, az, bx, bz, feetY = 0) {
  const dist = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(dist / 0.18));
  for (let index = 1; index <= steps; index += 1) {
    const t = index / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    if (collides(x, z, feetY)) return true;
  }
  return false;
}
