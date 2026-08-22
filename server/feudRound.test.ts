import assert from "node:assert/strict";
import { starterFeudPack } from "../src/gameData.js";
import {
  applyFeudRoundCommand,
  createFeudRoundState,
  multiplierForFeudRound,
  setFeudControl,
} from "../src/feudRound.js";
import type { FeudGameConfig, FeudRoundCommand, FeudRoundView } from "../src/roomTypes.js";

const config: FeudGameConfig = {
  kind: "feud",
  teamOne: "Comets",
  teamTwo: "Rockets",
  winningScore: 300,
  pack: starterFeudPack,
};

function run(state: FeudRoundView, command: FeudRoundCommand, gameConfig = config) {
  const result = applyFeudRoundCommand(state, gameConfig, command);
  if (!result.ok) throw new Error(result.error);
  return result;
}

assert.deepEqual(
  [1, 2, 3, 4, 5, 6].map(multiplierForFeudRound),
  [1, 1, 2, 2, 3, 3],
);

let state = setFeudControl(createFeudRoundState(), "one");
assert.equal(state.selectedAwardTeam, "one");
state = run(state, { type: "reveal-answer", index: 0 }).state;
assert.equal(state.roundPot, starterFeudPack.questions[0].answers[0].points);
state = run(state, { type: "add-strike" }).state;
state = run(state, { type: "add-strike" }).state;
assert.equal(state.phase, "playing");
assert.equal(state.strikes, 2);
state = run(state, { type: "add-strike" }).state;
assert.equal(state.phase, "steal");
assert.equal(state.selectedAwardTeam, "two");
assert.equal(state.strikeRevision, 3);

const failedSteal = run(state, { type: "set-steal-outcome", outcome: "failed" }).state;
assert.equal(failedSteal.selectedAwardTeam, "one");
assert.deepEqual(failedSteal.scores, { one: 0, two: 0 });
const successfulSteal = run(state, { type: "set-steal-outcome", outcome: "success" }).state;
assert.equal(successfulSteal.selectedAwardTeam, "two");
assert.deepEqual(successfulSteal.scores, { one: 0, two: 0 });

state = run(failedSteal, { type: "select-award-team", team: "two" }).state;
const awarded = run(state, { type: "confirm-award" });
assert.equal(awarded.event, "round-awarded");
assert.equal(awarded.state.scores.two, starterFeudPack.questions[0].answers[0].points);
assert.equal(awarded.state.round, 2);
assert.equal(awarded.state.multiplier, 1);
assert.equal(awarded.state.strikes, 0);
assert.equal(awarded.state.phase, "faceoff");

let boundary = { ...createFeudRoundState(), round: 2, multiplier: 1 };
boundary = setFeudControl(boundary, "one");
boundary = run(boundary, { type: "reveal-answer", index: 0 }).state;
boundary = run(boundary, { type: "confirm-award" }).state;
assert.equal(boundary.round, 3);
assert.equal(boundary.multiplier, 2);
boundary = { ...boundary, round: 4, multiplier: 2 };
boundary = setFeudControl(boundary, "one");
boundary = run(boundary, { type: "reveal-answer", index: 0 }).state;
boundary = run(boundary, { type: "confirm-award" }).state;
assert.equal(boundary.round, 5);
assert.equal(boundary.multiplier, 3);

const earlyWinConfig = { ...config, winningScore: 30 };
let earlyWin = setFeudControl(createFeudRoundState(), "one");
earlyWin = run(earlyWin, { type: "reveal-answer", index: 0 }, earlyWinConfig).state;
const won = run(earlyWin, { type: "confirm-award" }, earlyWinConfig);
assert.equal(won.event, "game-won");
assert.equal(won.state.winnerTeam, "one");
assert.equal(won.state.round, 1);

console.log("Family Feud round rules cover control, strikes, steal outcomes, editable awards, multiplier boundaries, reset, and early wins.");
