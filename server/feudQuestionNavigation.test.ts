import assert from "node:assert/strict";
import {
  activeFeudQuestionIndex,
  activeFeudQuestionProgress,
  createFeudQuestionNavigationState,
  feudQuestionNavigationReducer,
  type FeudQuestionNavigationAction,
} from "../src/feudQuestionNavigation.js";

let state = createFeudQuestionNavigationState(["question-one", "question-two"]);
const dispatch = (action: FeudQuestionNavigationAction) => {
  state = feudQuestionNavigationReducer(state, action);
};

dispatch({ type: "navigate", direction: -1 });
assert.equal(activeFeudQuestionIndex(state), 0, "Previous does not wrap from the first question.");

dispatch({ type: "reveal", answerIndex: 0 });
dispatch({ type: "set-strikes", strikes: 2 });
dispatch({ type: "navigate", direction: 1 });
assert.equal(activeFeudQuestionIndex(state), 1);
assert.deepEqual(activeFeudQuestionProgress(state), {
  revealed: [],
  strikes: 0,
  resolution: null,
});

dispatch({ type: "navigate", direction: 1 });
assert.equal(activeFeudQuestionIndex(state), 1, "Next does not wrap from the final question.");

dispatch({ type: "navigate", direction: -1 });
assert.deepEqual(activeFeudQuestionProgress(state), {
  revealed: [0],
  strikes: 2,
  resolution: null,
});

dispatch({ type: "award", teamIndex: 0, points: 34, round: 1 });
dispatch({ type: "navigate", direction: 1 });
assert.equal(activeFeudQuestionIndex(state), 0, "A pending award must be finished before navigation.");

dispatch({ type: "reveal", answerIndex: 1 });
assert.deepEqual(activeFeudQuestionProgress(state).revealed, [0, 1]);

dispatch({ type: "advance-award" });
dispatch({ type: "navigate", direction: 1 });
assert.equal(activeFeudQuestionIndex(state), 1);

dispatch({ type: "navigate", direction: -1 });
const completed = activeFeudQuestionProgress(state);
assert.equal(completed.resolution?.advanced, true);
assert.equal(completed.resolution?.points, 34);

dispatch({ type: "reveal", answerIndex: 2 });
dispatch({ type: "set-strikes", strikes: 3 });
dispatch({ type: "award", teamIndex: 1, points: 99, round: 2 });
assert.deepEqual(
  activeFeudQuestionProgress(state),
  completed,
  "Completed questions are immutable when revisited.",
);

console.log(
  "Family Feud question navigation preserves board progress, respects pack boundaries, and locks completed awards.",
);
