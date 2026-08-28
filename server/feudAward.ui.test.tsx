import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import type { FeudGameConfig, RoomSnapshot } from "../src/roomTypes";

const roomClientMock = vi.hoisted(() => ({
  hasRecoveryIntent: vi.fn(() => false),
  subscribe: vi.fn(() => () => undefined),
  subscribeTyping: vi.fn(() => () => undefined),
  subscribeFastMoneyRepeat: vi.fn(() => () => undefined),
  createRoom: vi.fn(),
  startGame: vi.fn(),
  leaveRoom: vi.fn(),
  prepareNextGame: vi.fn(),
  gameAction: vi.fn(),
  chooseTeam: vi.fn(),
  sendMessage: vi.fn(),
  pressBuzzer: vi.fn(),
  updateIdentity: vi.fn(),
  randomizeTeams: vi.fn(),
  assignTeam: vi.fn(),
  clearTeamChats: vi.fn(),
  startTimer: vi.fn(),
  stopTimer: vi.fn(),
  openPlayPass: vi.fn(),
  decidePlayPass: vi.fn(),
  setFeudTurnPlayer: vi.fn(),
  selectBuzzerRepresentative: vi.fn(),
  armBuzzer: vi.fn(),
  closeBuzzer: vi.fn(),
  resetBuzzer: vi.fn(),
  nextBuzzerPair: vi.fn(),
  endFeudQuestion: vi.fn(),
  prepareNextFeudQuestion: vi.fn(),
  advanceFeudTurn: vi.fn(),
}));

vi.mock("../src/roomClient", () => ({ roomClient: roomClientMock }));

let root: Root | null = null;
let latestConfig: FeudGameConfig | null = null;
const presenterStates: unknown[] = [];

class TestBroadcastChannel {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;

  postMessage(message: unknown) {
    presenterStates.push(message);
  }

  close() {}
}

function roomSnapshot(config: FeudGameConfig, phase: "lobby" | "playing"): RoomSnapshot {
  return {
    code: "ABCDE",
    phase,
    hostConnection: { status: "connected", recoveryDeadline: null },
    gameRevision: 1,
    config,
    participants: [
      { id: "player-one", name: "Avery", avatarId: null, team: "one", status: "active" },
      { id: "player-two", name: "Blake", avatarId: null, team: "two", status: "active" },
    ],
    messages: [],
    teamChats: { one: [], two: [] },
    chat: { lockedTeam: null, reason: null },
    playPass: {
      status: "closed",
      team: null,
      activePlayerId: null,
      votes: { play: 0, pass: 0 },
      viewerVote: null,
      decision: null,
      controllingTeam: null,
    },
    feudTurns: {
      activeTeam: "one",
      teams: {
        one: {
          order: ["player-one"],
          currentPlayerId: "player-one",
          nextPlayerId: "player-one",
        },
        two: {
          order: ["player-two"],
          currentPlayerId: "player-two",
          nextPlayerId: "player-two",
        },
      },
    },
    buzzer: {
      status: "idle",
      winner: null,
      representatives: { one: "player-one", two: "player-two" },
    },
    timer: {
      status: "idle",
      durationSeconds: null,
      startedAt: null,
      deadline: null,
    },
    viewer: { role: "host" },
    game: null,
  };
}

function pageText(): string {
  return document.body.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function button(name: string): HTMLButtonElement {
  const match = [...document.querySelectorAll("button")].find((candidate) => {
    const accessibleName = candidate.getAttribute("aria-label");
    const text = candidate.textContent?.replace(/\s+/g, " ").trim();
    return accessibleName === name || text === name;
  });
  if (!match) throw new Error(`Could not find button: ${name}`);
  return match;
}

async function click(name: string): Promise<void> {
  await act(async () => {
    button(name).click();
  });
}

function input(name: string): HTMLInputElement {
  const match = document.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`);
  if (!match) throw new Error(`Could not find input: ${name}`);
  return match;
}

async function fillInput(name: string, value: string): Promise<void> {
  await act(async () => {
    const field = input(name);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submitClosestForm(name: string): Promise<void> {
  await act(async () => {
    input(name).form?.requestSubmit();
  });
}

async function renderGame(winningScore = 300): Promise<void> {
  root = createRoot(document.querySelector("#root")!);
  await act(async () => {
    root?.render(<App />);
  });

  await click("Set up Family Feud");
  if (winningScore !== 300) {
    await act(async () => {
      const radio = document.querySelector<HTMLInputElement>(`input[value="${winningScore}"]`);
      if (!radio) throw new Error(`Could not find ${winningScore}-point option.`);
      radio.click();
    });
  }
  await act(async () => {
    document.querySelector<HTMLFormElement>("form.setup-form")?.requestSubmit();
  });
  await click("Start the game");
}

async function revealAll(questionIndex: number): Promise<void> {
  const config = latestConfig;
  if (!config) throw new Error("The game config is unavailable.");
  for (const [answerIndex, answer] of config.pack.questions[questionIndex].answers.entries()) {
    await click(`Reveal answer ${answerIndex + 1}: ${answer.label}, ${answer.points} points`);
  }
}

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  window.history.replaceState({}, "", "/");
  window.localStorage.clear();
  window.scrollTo = vi.fn();
  window.confirm = vi.fn(() => true);
  vi.stubGlobal("BroadcastChannel", TestBroadcastChannel);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

  latestConfig = null;
  presenterStates.length = 0;
  vi.clearAllMocks();
  roomClientMock.subscribe.mockReturnValue(() => undefined);
  roomClientMock.subscribeTyping.mockReturnValue(() => undefined);
  roomClientMock.subscribeFastMoneyRepeat.mockReturnValue(() => undefined);
  roomClientMock.createRoom.mockImplementation(async (config: FeudGameConfig) => {
    latestConfig = config;
    return roomSnapshot(config, "lobby");
  });
  roomClientMock.startGame.mockImplementation(async () => {
    if (!latestConfig) throw new Error("The game config is unavailable.");
    return roomSnapshot(latestConfig, "playing");
  });
  roomClientMock.endFeudQuestion.mockResolvedValue(undefined);
  roomClientMock.prepareNextFeudQuestion.mockResolvedValue(undefined);
  roomClientMock.advanceFeudTurn.mockResolvedValue(undefined);
  roomClientMock.nextBuzzerPair.mockResolvedValue(undefined);
  roomClientMock.resetBuzzer.mockResolvedValue(undefined);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  vi.unstubAllGlobals();
});

describe("Family Feud round awards", () => {
  it("publishes a new wrong-answer cue only when the moderator adds a strike", async () => {
    await renderGame();

    const latestCueRevision = () => presenterStates
      .map((message) => (message as {
        state?: { mode?: string; wrongAnswerCueRevision?: number };
      }).state)
      .filter((state) => state?.mode === "feud")
      .at(-1)?.wrongAnswerCueRevision;

    expect(latestCueRevision()).toBe(0);
    await click("Add strike X");
    expect(latestCueRevision()).toBe(1);

    await click("Remove a strike");
    expect(latestCueRevision()).toBe(1);
    await click("Next question");
    await click("Previous question");
    expect(latestCueRevision()).toBe(1);

    await click("Add strike X");
    expect(latestCueRevision()).toBe(2);
  });

  it("navigates within the pack, preserves board progress, and keeps scores unchanged", async () => {
    await renderGame();

    expect(pageText()).toContain("Question 1 of 8");
    expect(button("Previous question").disabled).toBe(true);
    expect(button("Next question").disabled).toBe(false);

    await click("Reveal answer 1: Clean the house, 34 points");
    await click("Add strike X");
    await click("Next question");

    expect(pageText()).toContain("Question 2 of 8");
    expect(pageText()).toContain("Name something that always seems to disappear at a party.");
    expect(document.querySelector('[aria-label="The Leftovers: 0 points"]')).not.toBeNull();
    expect(roomClientMock.prepareNextFeudQuestion).toHaveBeenCalledOnce();
    expect(roomClientMock.endFeudQuestion).not.toHaveBeenCalled();
    expect(roomClientMock.resetBuzzer).not.toHaveBeenCalled();

    const questionTwo = latestConfig?.pack.questions[1];
    const latestPresenterState = presenterStates
      .map((message) => (message as {
        state?: { mode?: string; question?: { answers?: { id: string }[] } };
      }).state)
      .filter((state) => state?.mode === "feud")
      .at(-1);
    expect(latestPresenterState?.question?.answers?.[0].id)
      .toBe(questionTwo?.answers[0].id);

    await click("Previous question");
    expect(pageText()).toContain("Question 1 of 8");
    expect(button("Clean the house, 34 points")).toBeTruthy();
    expect(document.querySelector('[aria-label="1 strikes"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="The Leftovers: 0 points"]')).not.toBeNull();

    for (let index = 0; index < 7; index += 1) await click("Next question");
    expect(pageText()).toContain("Question 8 of 8");
    expect(button("Next question").disabled).toBe(true);
  });

  it("keeps completed questions reviewable without allowing a duplicate award", async () => {
    await renderGame();

    await click("Reveal answer 1: Clean the house, 34 points");
    await click("The Leftovers A");
    await click("Next question ↗");
    await click("Previous question");

    expect(pageText()).toContain("Reviewing completed round 1. Scoring controls are locked.");
    expect(pageText()).toContain("34 points awarded to The Leftovers");
    expect(button("Reveal answer 2: Hide the clutter, 21 points").disabled).toBe(true);
    expect(button("Add strike X").disabled).toBe(true);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "b" }));
    });
    expect(document.querySelector('[aria-label="The Leftovers: 34 points"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="The Plus Ones: 0 points"]')).not.toBeNull();

    await click("Next question");
    expect(pageText()).toContain("Question 2 of 8");
    expect(document.querySelector('[aria-label="The Leftovers: 34 points"]')).not.toBeNull();
  });

  it("sets an exact team score without changing the round and ignores shortcuts while editing", async () => {
    await renderGame();

    await click("Edit The Leftovers score");
    const scoreInput = input("Set The Leftovers score");
    expect(scoreInput.value).toBe("0");
    expect(document.activeElement).toBe(scoreInput);

    await fillInput("Set The Leftovers score", "137");
    await act(async () => {
      scoreInput.dispatchEvent(new KeyboardEvent("keydown", { key: "1", bubbles: true }));
      scoreInput.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }));
    });
    expect(pageText()).toContain("Award 0 points");
    expect(document.querySelector('[aria-label="0 strikes"]')).not.toBeNull();

    await submitClosestForm("Set The Leftovers score");
    expect(document.querySelector('[aria-label="The Leftovers: 137 points"]')).not.toBeNull();
    expect(pageText()).toContain("Round 1");
    expect(pageText()).toContain("Award 0 points");

    const lastFeudMessage = presenterStates
      .map((message) => (message as { state?: { mode?: string; scores?: number[] } }).state)
      .filter((state) => state?.mode === "feud")
      .at(-1);
    expect(lastFeudMessage?.scores).toEqual([137, 0]);
  });

  it("rejects invalid score edits and allows cancellation", async () => {
    await renderGame();

    await click("Edit The Plus Ones score");
    await fillInput("Set The Plus Ones score", "10000");
    await submitClosestForm("Set The Plus Ones score");

    expect(pageText()).toContain("Enter a whole number from 0 to 9999.");
    expect(document.querySelector('[aria-label="The Plus Ones: 0 points"]')).not.toBeNull();

    await fillInput("Set The Plus Ones score", "42");
    await click("Cancel");
    expect(document.querySelector('[aria-label="The Plus Ones: 0 points"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Set The Plus Ones score"]')).toBeNull();
  });

  it("keeps the board open for remaining reveals and advances explicitly", async () => {
    await renderGame();

    await click("Reveal answer 1: Clean the house, 34 points");
    await click("The Leftovers A");

    expect(pageText()).toContain("Name something people do right before guests arrive.");
    expect(pageText()).toContain("34 points awarded to The Leftovers");
    expect(button("Next question ↗")).toBeTruthy();
    expect(document.querySelector('[aria-label="The Leftovers: 34 points"]')).not.toBeNull();
    expect(roomClientMock.endFeudQuestion).toHaveBeenCalledOnce();
    expect(roomClientMock.nextBuzzerPair).not.toHaveBeenCalled();
    expect(roomClientMock.advanceFeudTurn).toHaveBeenCalledOnce();
    expect(button("Add strike X").disabled).toBe(true);

    await click("Reveal answer 2: Hide the clutter, 21 points");
    expect(document.querySelector('[aria-label="The Leftovers: 34 points"]')).not.toBeNull();
    expect(button("Hide the clutter, 21 points")).toBeTruthy();
    expect(roomClientMock.advanceFeudTurn).toHaveBeenCalledOnce();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    });
    expect(document.querySelector('[aria-label="The Leftovers: 34 points"]')).not.toBeNull();

    const lastFeudMessage = presenterStates
      .map((message) => (message as { state?: { mode?: string; revealed?: number[] } }).state)
      .filter((state) => state?.mode === "feud")
      .at(-1);
    expect(lastFeudMessage?.revealed).toEqual([0, 1]);

    await click("Next question ↗");
    expect(pageText()).toContain("Round 2");
    expect(pageText()).toContain("Name something that always seems to disappear at a party.");
    expect(pageText()).toContain("Award 0 points");
    expect(document.querySelector('[aria-label="The Leftovers: 34 points"]')).not.toBeNull();
    expect(roomClientMock.nextBuzzerPair).toHaveBeenCalledOnce();
  });

  it("delays a winning modal until the moderator finishes the board", async () => {
    await renderGame(200);

    await revealAll(0);
    await click("The Leftovers A");
    await click("Next question ↗");
    await revealAll(1);
    await click("The Leftovers A");

    expect(document.querySelector('[aria-label="The Leftovers: 200 points"]')).not.toBeNull();
    expect(pageText()).toContain("Name something that always seems to disappear at a party.");
    expect(pageText()).not.toContain("take the night!");
    expect(button("Finish game ↗")).toBeTruthy();

    await click("Finish game ↗");
    expect(pageText()).toContain("That’s the game");
    expect(pageText()).toContain("The Leftovers");
    expect(pageText()).toContain("take the night!");
  });
});
