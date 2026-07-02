import test from "node:test";
import assert from "node:assert/strict";

import {
  createPlayerState,
  matchWinner,
  timeoutRoundWinner,
} from "../src/room-logic.js";

function buildLive(...entries) {
  return {
    scoreBlue: 0,
    scoreRed: 0,
    players: new Map(entries.map((player) => [player.id, player])),
  };
}

test("timeoutRoundWinner awards the team with more alive HP", () => {
  const blueA = createPlayerState({ id: "blue-a", name: "Blue A", team: "blue", primary: "pike" });
  const blueB = createPlayerState({ id: "blue-b", name: "Blue B", team: "blue", primary: "pike" });
  const redA = createPlayerState({ id: "red-a", name: "Red A", team: "red", primary: "pike" });
  const redB = createPlayerState({ id: "red-b", name: "Red B", team: "red", primary: "pike" });

  blueA.alive = true;
  blueA.hp = 65;
  blueB.alive = true;
  blueB.hp = 40;
  redA.alive = true;
  redA.hp = 70;
  redB.alive = true;
  redB.hp = 20;

  assert.equal(timeoutRoundWinner(buildLive(blueA, blueB, redA, redB)), "blue");
});

test("timeoutRoundWinner returns draw when alive HP is tied", () => {
  const blue = createPlayerState({ id: "blue", name: "Blue", team: "blue", primary: "pike" });
  const red = createPlayerState({ id: "red", name: "Red", team: "red", primary: "pike" });

  blue.alive = true;
  blue.hp = 45;
  red.alive = true;
  red.hp = 45;

  assert.equal(timeoutRoundWinner(buildLive(blue, red)), "draw");
});

test("matchWinner resolves the hard round cap result from score", () => {
  assert.equal(matchWinner({ scoreBlue: 4, scoreRed: 3 }), "blue");
  assert.equal(matchWinner({ scoreBlue: 2, scoreRed: 5 }), "red");
  assert.equal(matchWinner({ scoreBlue: 4, scoreRed: 4 }), "draw");
});
