import test from "node:test";
import assert from "node:assert/strict";

import { acceptMovementClaim, createPlayerState } from "../src/room-logic.js";

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
