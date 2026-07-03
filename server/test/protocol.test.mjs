import test from "node:test";
import assert from "node:assert/strict";

import {
  ERROR_CODES,
  normalizePrimaryWeapon,
  parseClientMessage,
  RATE_LIMITS,
  sanitizeName,
  validateClientMessage,
  validateRoomCode,
} from "../../shared/protocol.js";

test("sanitizeName strips controls and unsupported punctuation", () => {
  assert.equal(sanitizeName("  Aegis\u0000<>  "), "Aegis");
  assert.equal(sanitizeName("先锋-7"), "先锋-7");
});

test("validateRoomCode accepts Angle room alphabet", () => {
  assert.equal(validateRoomCode("ABCD23").ok, true);
  assert.equal(validateRoomCode("O0I1L2").ok, false);
});

test("normalizePrimaryWeapon accepts loadout primaries and falls back safely", () => {
  assert.equal(normalizePrimaryWeapon("hawk"), "hawk");
  assert.equal(normalizePrimaryWeapon("backstop"), "pike");
  assert.equal(normalizePrimaryWeapon("unknown"), "pike");
});

test("validateClientMessage enforces input bounds", () => {
  const result = validateClientMessage({
    type: "input",
    seq: 1,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 120,
    vx: 0,
    vz: 0,
    anim: "idle",
  });
  assert.equal(result.ok, false);
});

test("parseClientMessage rejects malformed json", () => {
  const result = parseClientMessage("{");
  assert.equal(result.ok, false);
});

test("protocol exports updated multiplayer limits and error codes", () => {
  assert.equal(RATE_LIMITS.inputPerSecond, 60);
  assert.ok(ERROR_CODES.includes("timeout"));
  assert.ok(ERROR_CODES.includes("name_taken"));
});
