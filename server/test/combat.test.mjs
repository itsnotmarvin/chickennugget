import test from "node:test";
import assert from "node:assert/strict";

import {
  isBackstab,
  nearestCapsuleHit,
  normalizeVector,
  WEAPON_STATS,
} from "../../shared/combat.js";
import { createPlayerState, handleFire, handleMelee } from "../src/room-logic.js";

test("nearestCapsuleHit finds the closest head hit", () => {
  const direction = normalizeVector(0, 0, -1);
  const hit = nearestCapsuleHit(
    { x: 0, y: 1.62, z: 0 },
    direction,
    [{ x: 0, y: 0, z: -5, id: "enemy" }],
    60,
  );
  assert.equal(hit.player.id, "enemy");
  assert.equal(typeof hit.head, "boolean");
});

test("fire applies weapon damage and kill state", () => {
  const attacker = createPlayerState({ id: "a", name: "A", team: "blue", primary: "pike" });
  const victim = createPlayerState({ id: "b", name: "B", team: "red", primary: "pike" });
  attacker.connected = true;
  attacker.alive = true;
  victim.connected = true;
  victim.alive = true;
  victim.x = 0;
  victim.z = -5;
  victim.y = 0;

  const result = handleFire(attacker, {
    type: "fire",
    seq: 1,
    weapon: "pike",
    ox: 0,
    oy: 1.62,
    oz: 0,
    dx: 0,
    dy: 0,
    dz: -1,
  }, [victim], WEAPON_STATS.pike.cooldownMs + 10);

  assert.ok(result?.hit);
  assert.ok(victim.hp < 100);
});

test("stab doubles on backstab", () => {
  const attacker = createPlayerState({ id: "a", name: "A", team: "blue", primary: "pike" });
  const victim = createPlayerState({ id: "b", name: "B", team: "red", primary: "pike" });
  attacker.connected = true;
  attacker.alive = true;
  attacker.activeWeapon = "knife";
  victim.connected = true;
  victim.alive = true;
  attacker.x = 0;
  attacker.z = 1.4;
  attacker.yaw = 0;
  victim.x = 0;
  victim.z = 0.5;
  victim.yaw = 0;

  assert.equal(isBackstab(attacker, victim), true);
  const result = handleMelee(attacker, {
    type: "melee",
    seq: 1,
    kind: "stab",
    ox: 0,
    oy: 1.62,
    oz: 1.4,
    dx: 0,
    dy: 0,
    dz: -1,
  }, [victim], 1000);

  assert.ok(result?.hit);
  assert.ok(result.hit.damage >= 180);
});
