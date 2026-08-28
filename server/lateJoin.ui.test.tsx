import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { starterFeudPack } from "../src/gameData";
import type {
  ChatMessage,
  FeudGameConfig,
  Participant,
  RoomSnapshot,
  RoomViewer,
} from "../src/roomTypes";

const roomClientMock = vi.hoisted(() => ({
  subscribe: vi.fn(),
  subscribeTyping: vi.fn(() => () => undefined),
  subscribeFastMoneyRepeat: vi.fn(() => () => undefined),
  createRoom: vi.fn(),
  joinRoom: vi.fn(),
  leaveRoom: vi.fn(),
  startGame: vi.fn(),
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
  setTyping: vi.fn(),
}));

vi.mock("../src/roomClient", () => ({ roomClient: roomClientMock }));

const config: FeudGameConfig = {
  kind: "feud",
  teamOne: "Comets",
  teamTwo: "Rockets",
  winningScore: 300,
  pack: starterFeudPack,
};
const activePlayers: Participant[] = [
  { id: "player-one", name: "Avery", avatarId: null, team: "one", status: "active" },
  { id: "player-two", name: "Blake", avatarId: null, team: "two", status: "active" },
];
const teamMessage: ChatMessage = {
  id: "message-one",
  senderId: "player-one",
  senderName: "Avery",
  senderAvatarId: null,
  team: "one",
  text: "Welcome to the Comets huddle",
  sentAt: 1,
};

let root: Root | null = null;
let deliverSnapshot: ((snapshot: RoomSnapshot) => void) | null = null;

class TestBroadcastChannel {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  postMessage() {}
  close() {}
}

function snapshot({
  viewer,
  participants = activePlayers,
  phase = "playing",
  messages = [],
}: {
  viewer: RoomViewer;
  participants?: Participant[];
  phase?: "lobby" | "playing";
  messages?: ChatMessage[];
}): RoomSnapshot {
  const viewerTeam = viewer.role === "player" ? viewer.team : null;
  return {
    code: "ABCDE",
    phase,
    gameRevision: 1,
    config,
    participants,
    messages,
    teamChats: viewer.role === "host"
      ? { one: messages, two: [] }
      : viewerTeam
        ? { [viewerTeam]: messages }
        : {},
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
      activeTeam: null,
      teams: {
        one: { order: ["player-one"], currentPlayerId: "player-one", nextPlayerId: "player-one" },
        two: { order: ["player-two"], currentPlayerId: "player-two", nextPlayerId: "player-two" },
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
    viewer,
    game: null,
  };
}

function pageText(): string {
  return document.body.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function button(name: string, container: ParentNode = document): HTMLButtonElement {
  const match = [...container.querySelectorAll("button")].find((candidate) => {
    const accessibleName = candidate.getAttribute("aria-label");
    const text = candidate.textContent?.replace(/\s+/g, " ").trim();
    return accessibleName === name || text === name;
  });
  if (!match) throw new Error(`Could not find button: ${name}`);
  return match;
}

async function click(name: string, container: ParentNode = document): Promise<void> {
  await act(async () => {
    button(name, container).click();
  });
}

async function enter(input: HTMLInputElement, value: string): Promise<void> {
  const setValue = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    setValue?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function renderApp(): Promise<void> {
  root = createRoot(document.querySelector("#root")!);
  await act(async () => {
    root?.render(<App />);
  });
}

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  window.history.replaceState({}, "", "/");
  window.localStorage.clear();
  window.scrollTo = vi.fn();
  window.confirm = vi.fn(() => true);
  window.matchMedia = vi.fn(() => ({
    matches: false,
    media: "",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  }));
  vi.stubGlobal("BroadcastChannel", TestBroadcastChannel);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

  deliverSnapshot = null;
  vi.clearAllMocks();
  roomClientMock.subscribe.mockImplementation((onSnapshot: (value: RoomSnapshot) => void) => {
    deliverSnapshot = onSnapshot;
    return () => {
      deliverSnapshot = null;
    };
  });
  roomClientMock.subscribeTyping.mockReturnValue(() => undefined);
  roomClientMock.subscribeFastMoneyRepeat.mockReturnValue(() => undefined);
  roomClientMock.assignTeam.mockResolvedValue(undefined);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  vi.unstubAllGlobals();
});

describe("mid-session player joining", () => {
  it("lets the host assign waiting players without adding them to live controls", async () => {
    roomClientMock.createRoom.mockResolvedValue(snapshot({
      viewer: { role: "host" },
      phase: "lobby",
    }));
    roomClientMock.startGame.mockResolvedValue(snapshot({ viewer: { role: "host" } }));
    await renderApp();

    await click("Set up Family Feud");
    await act(async () => {
      document.querySelector<HTMLFormElement>("form.setup-form")?.requestSubmit();
    });
    await click("Start the game");

    const waitingPlayer: Participant = {
      id: "waiting-player",
      name: "Emery",
      avatarId: null,
      team: null,
      status: "waiting",
    };
    await act(async () => {
      deliverSnapshot?.(snapshot({
        viewer: { role: "host" },
        participants: [...activePlayers, waitingPlayer],
      }));
    });

    const panel = document.querySelector<HTMLElement>('[aria-label="Players waiting to join"]');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain("Emery");
    expect([...document.querySelectorAll("select option")].map((option) => option.textContent))
      .not.toContain("Emery");

    await click("Comets", panel!);
    expect(roomClientMock.assignTeam).toHaveBeenCalledWith("waiting-player", "one");
    expect(pageText()).toContain("Emery will join Comets on the next question.");
  });

  it("keeps a new player waiting, opens only their assigned huddle, then enables play after activation", async () => {
    const unassignedWaiting: Participant = {
      id: "waiting-player",
      name: "Emery",
      avatarId: null,
      team: null,
      status: "waiting",
    };
    roomClientMock.joinRoom.mockResolvedValue(snapshot({
      viewer: { role: "player", participantId: "waiting-player", team: null },
      participants: [...activePlayers, unassignedWaiting],
    }));
    await renderApp();

    await click("Join a room");
    await enter(document.querySelector<HTMLInputElement>("input.code-input")!, "ABCDE");
    await enter(
      document.querySelector<HTMLInputElement>('input[placeholder="What should we call you?"]')!,
      "Emery",
    );
    await act(async () => {
      document.querySelector<HTMLFormElement>("form.join-form")?.requestSubmit();
    });

    expect(pageText()).toContain("Waiting for the host.");
    expect(document.querySelector('[aria-label="Buzzer status"]')).toBeNull();
    expect(document.querySelector('[aria-label="Comets private chat"]')).toBeNull();

    const assignedWaiting: Participant = { ...unassignedWaiting, team: "one" };
    await act(async () => {
      deliverSnapshot?.(snapshot({
        viewer: { role: "player", participantId: "waiting-player", team: "one" },
        participants: [...activePlayers, assignedWaiting],
        messages: [teamMessage],
      }));
    });

    expect(pageText()).toContain("Your team is set.");
    expect(pageText()).toContain("You’ll enter the answering order when the host advances.");
    expect(document.querySelector('[aria-label="Comets private chat"]')).not.toBeNull();
    expect(pageText()).toContain("Welcome to the Comets huddle");
    expect(document.querySelector('[aria-label="Rockets private chat"]')).toBeNull();
    expect(document.querySelector('[aria-label="Buzzer status"]')).toBeNull();

    await act(async () => {
      deliverSnapshot?.(snapshot({
        viewer: { role: "player", participantId: "waiting-player", team: "one" },
        participants: [
          ...activePlayers,
          { ...assignedWaiting, status: "active" },
        ],
        messages: [teamMessage],
      }));
    });

    expect(pageText()).not.toContain("Your team is set.");
    expect(document.querySelector('[aria-label="Buzzer status"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Comets private chat"]')).not.toBeNull();
  });
});
