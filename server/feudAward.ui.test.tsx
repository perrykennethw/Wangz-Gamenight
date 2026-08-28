import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import type { FeudGameConfig, RoomSnapshot } from "../src/roomTypes";

const roomClientMock = vi.hoisted(() => ({
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
    gameRevision: 1,
    config,
    participants: [
      { id: "player-one", name: "Avery", avatarId: null, team: "one" },
      { id: "player-two", name: "Blake", avatarId: null, team: "two" },
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
