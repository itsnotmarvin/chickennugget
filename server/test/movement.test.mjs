import test from "node:test";
import assert from "node:assert/strict";

import { acceptMovementClaim, createPlayerState } from "../src/room-logic.js";
import {
  BODY_RADIUS,
  cellCenter,
  collides,
  resolveHorizontalMove,
} from "../../shared/collision.js";
import { CELL_SIZE, MAP_GRID } from "../../shared/map-data.js";

function findOpenLeftOf(marker) {
  for (let r = 0; r < MAP_GRID.length; r += 1) {
    for (let c = 1; c < MAP_GRID[r].length; c += 1) {
      if (MAP_GRID[r][c] === marker && MAP_GRID[r][c - 1] === ".") return { r, c };
    }
  }
  throw new Error(`No open-left ${marker} cell found`);
}

test("movement claim accepts modest legal movement", () => {
  const player = createPlayerState({ id: "a", name: "A", team: "blue", primary: "pike" });
  player.connected = true;
  player.alive = true;
  player.lastInputAt = 0;

  const result = acceptMovementClaim(player, {
    seq: 1,
    x: 0.4,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    vx: 4,
    vz: 0,
    anim: "run",
  }, 100);

  assert.equal(result.accepted, true);
  assert.equal(player.x, 0.4);
});

test("movement claim rejects teleporting", () => {
  const player = createPlayerState({ id: "a", name: "A", team: "blue", primary: "pike" });
  player.connected = true;
  player.alive = true;
  player.lastInputAt = 0;

  const result = acceptMovementClaim(player, {
    seq: 2,
    x: 20,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    vx: 12,
    vz: 0,
    anim: "run",
  }, 100);

  assert.equal(result.accepted, false);
  assert.equal(player.x, 0);
});

test("horizontal resolver stops at low crate boundary instead of stepping through", () => {
  const crate = findOpenLeftOf("c");
  const center = cellCenter(crate.r, crate.c);
  const crateLeftEdge = center.x - CELL_SIZE / 2;
  const start = {
    x: crateLeftEdge - BODY_RADIUS - 0.04,
    y: 0,
    z: center.z,
  };

  const result = resolveHorizontalMove(start, 0.7, 0);

  assert.equal(result.blockedX, true);
  assert.ok(result.x <= crateLeftEdge - BODY_RADIUS + 1e-9);
  assert.equal(collides(result.x, result.z, 0), false);
});

test("server rejects floor-level movement into a low crate", () => {
  const crate = findOpenLeftOf("c");
  const center = cellCenter(crate.r, crate.c);
  const crateLeftEdge = center.x - CELL_SIZE / 2;
  const player = createPlayerState({ id: "a", name: "A", team: "blue", primary: "pike" });
  player.connected = true;
  player.alive = true;
  player.lastInputAt = 0;
  player.x = crateLeftEdge - BODY_RADIUS - 0.04;
  player.z = center.z;

  const result = acceptMovementClaim(player, {
    seq: 3,
    x: crateLeftEdge + 0.2,
    y: 0,
    z: center.z,
    yaw: 0,
    pitch: 0,
    vx: 4,
    vz: 0,
    anim: "run",
  }, 100);

  assert.equal(result.accepted, false);
  assert.equal(player.x, crateLeftEdge - BODY_RADIUS - 0.04);
});
