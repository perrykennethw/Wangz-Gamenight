import assert from "node:assert/strict";
import {
  activateFeudTurnTeam,
  advanceFeudTurn,
  createFeudTurnState,
  repairFeudTurnState,
  selectFeudTurnPlayer,
  viewFeudTurnOrder,
} from "../src/feudTurnOrder.js";
import type { Participant } from "../src/roomTypes.js";

const participants: Participant[] = [
  { id: "a", name: "Avery", avatarId: null, team: "one", status: "active" },
  { id: "b", name: "Bailey", avatarId: null, team: "one", status: "active" },
  { id: "c", name: "Casey", avatarId: null, team: "one", status: "active" },
  { id: "d", name: "Devon", avatarId: null, team: "two", status: "active" },
  { id: "e", name: "Ellis", avatarId: null, team: "two", status: "active" },
];
const everyone = new Set(participants.map((participant) => participant.id));

let state = createFeudTurnState(
  participants,
  { one: "a", two: "d" },
  everyone,
);
let view = viewFeudTurnOrder(state, everyone);
assert.deepEqual(view.teams.one, {
  order: ["a", "b", "c"],
  currentPlayerId: "b",
  nextPlayerId: "c",
});
assert.deepEqual(view.teams.two, {
  order: ["d", "e"],
  currentPlayerId: "e",
  nextPlayerId: "d",
});

state = activateFeudTurnTeam(state, "one");
state = advanceFeudTurn(state, everyone);
assert.equal(state.teams.one.currentPlayerId, "c");
state = advanceFeudTurn(state, everyone);
assert.equal(state.teams.one.currentPlayerId, "a");

state = selectFeudTurnPlayer(state, "one", "b");
state = advanceFeudTurn(state, everyone);
assert.equal(state.teams.one.currentPlayerId, "c");

const withoutCasey = new Set(["a", "b", "d", "e"]);
state = repairFeudTurnState(state, participants, withoutCasey);
assert.equal(state.teams.one.currentPlayerId, "a");
view = viewFeudTurnOrder(state, withoutCasey);
assert.deepEqual(view.teams.one.order, ["a", "b"]);
assert.equal(view.teams.one.nextPlayerId, "b");

state = repairFeudTurnState(state, participants, everyone);
assert.equal(state.teams.one.currentPlayerId, "a");
assert.deepEqual(viewFeudTurnOrder(state, everyone).teams.one.order, ["a", "b", "c"]);

state = repairFeudTurnState(
  state,
  participants.filter((participant) => participant.id !== "a"),
  new Set(["b", "c", "d", "e"]),
);
assert.equal(state.teams.one.currentPlayerId, "b");

const solo = createFeudTurnState(
  [participants[3]],
  { one: null, two: "d" },
  new Set(["d"]),
);
assert.equal(solo.teams.two.currentPlayerId, "d");
assert.equal(viewFeudTurnOrder(solo, new Set(["d"])).teams.two.nextPlayerId, "d");

console.log(
  "Family Feud turn order starts after face-off representatives, wraps, supports overrides, and repairs disconnects.",
);
