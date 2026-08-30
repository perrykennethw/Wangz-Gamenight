import assert from "node:assert/strict";
import type { FeudCommand, FeudGameConfig } from "../src/roomTypes.js";
import {
  applyFeudCommand,
  createFeudGame,
  viewFeudGame,
  type FeudGameState,
} from "./feud.js";

const config: FeudGameConfig = {
  kind: "feud",
  teamOne: "Alpha",
  teamTwo: "Beta",
  winningScore: 100,
  pack: {
    version: 1,
    kind: "feud",
    title: "Server state rules",
    questions: [
      {
        id: "question-one",
        prompt: "First question",
        answers: [
          { id: "answer-34", label: "First answer", points: 34 },
          { id: "answer-21", label: "Second answer", points: 21 },
        ],
      },
      {
        id: "question-two",
        prompt: "Second question",
        answers: [{ id: "answer-20", label: "Next answer", points: 20 }],
      },
    ],
  },
};

let state = createFeudGame(config);
const run = (command: FeudCommand): FeudGameState => {
  const result = applyFeudCommand(state, config, command);
  if (!result.ok) assert.fail(result.error);
  state = result.state;
  return state;
};

run({ type: "reveal-answer", questionIndex: 0, answerIndex: 0 });
run({ type: "set-strikes", questionIndex: 0, strikes: 2 });
run({ type: "navigate-question", questionIndex: 0, direction: 1 });
assert.deepEqual(viewFeudGame(state, config), {
  kind: "feud",
  round: 1,
  activeQuestionIndex: 1,
  revealed: [],
  strikes: 0,
  resolution: null,
  scores: { one: 0, two: 0 },
  roundPot: 0,
  winnerTeam: null,
});

run({ type: "navigate-question", questionIndex: 1, direction: -1 });
run({ type: "award-round", questionIndex: 0, team: "one" });
const awardedOnce = run({ type: "award-round", questionIndex: 0, team: "one" });
assert.equal(awardedOnce.scores.one, 34, "retrying an award must not duplicate its points");

run({ type: "reveal-answer", questionIndex: 0, answerIndex: 1 });
run({ type: "finish-round", questionIndex: 0 });
run({ type: "navigate-question", questionIndex: 1, direction: -1 });
const completed = viewFeudGame(state, config);
assert.deepEqual(completed, {
  kind: "feud",
  round: 2,
  activeQuestionIndex: 0,
  revealed: [0, 1],
  strikes: 2,
  resolution: { team: "one", points: 34, round: 1, advanced: true },
  scores: { one: 34, two: 0 },
  roundPot: 55,
  winnerTeam: null,
});

const immutable = applyFeudCommand(state, config, {
  type: "reveal-answer",
  questionIndex: 0,
  answerIndex: 0,
});
assert.deepEqual(immutable, { ok: false, error: "Completed Family Feud rounds are read-only." });

const stale = applyFeudCommand(state, config, {
  type: "navigate-question",
  questionIndex: 1,
  direction: 1,
});
assert.deepEqual(stale, {
  ok: false,
  error: "The active Family Feud question changed. Try that action again.",
});

console.log("Server-owned Family Feud state preserves boards, bounds navigation, and makes awards idempotent.");
