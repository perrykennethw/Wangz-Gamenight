import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { starterFeudPack } from "../src/gameData";
import type { RoomSnapshot, RoomViewer } from "../src/roomTypes";

const roomClientMock = vi.hoisted(() => ({
  subscribe: vi.fn(),
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
  subscribeTyping: vi.fn(() => () => undefined),
}));

vi.mock("../src/roomClient", () => ({ roomClient: roomClientMock }));

const closureMessage = "The host closed this room.";
let root: Root | null = null;
let notifyClosed: ((message: string) => void) | null = null;

class TestBroadcastChannel {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;

  postMessage() {}
  close() {}
}

function roomSnapshot(viewer: RoomViewer): RoomSnapshot {
  const participant = viewer.role === "player"
    ? [{ id: viewer.participantId, name: "Avery", avatarId: null, team: viewer.team, status: "active" as const }]
    : [];

  return {
    code: "ABCDE",
    phase: "lobby",
    gameRevision: 1,
    config: {
      kind: "feud",
      teamOne: "Comets",
      teamTwo: "Rockets",
      winningScore: 300,
      pack: starterFeudPack,
    },
    participants: participant,
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
      activeTeam: null,
      teams: {
        one: { order: [], currentPlayerId: null, nextPlayerId: null },
        two: { order: [], currentPlayerId: null, nextPlayerId: null },
      },
    },
    buzzer: {
      status: "idle",
      winner: null,
      representatives: { one: null, two: null },
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
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

async function submit(form: HTMLFormElement): Promise<void> {
  await act(async () => {
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
  });
}

async function deliverClosure(message = closureMessage): Promise<void> {
  await act(async () => {
    notifyClosed?.(message);
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
  vi.stubGlobal("BroadcastChannel", TestBroadcastChannel);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

  notifyClosed = null;
  vi.clearAllMocks();
  roomClientMock.subscribe.mockImplementation(
    (_onSnapshot: (snapshot: RoomSnapshot) => void, onClosed: (message: string) => void) => {
      notifyClosed = onClosed;
      return () => {
        notifyClosed = null;
      };
    },
  );
  roomClientMock.leaveRoom.mockReturnValue(undefined);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  vi.unstubAllGlobals();
});

describe("App room-notice orchestration", () => {
  it("shows, dismisses, and clears terminal notices when entering new room flows", async () => {
    await renderApp();

    await deliverClosure();
    expect(pageText()).toContain(closureMessage);
    await click("×");
    expect(pageText()).not.toContain(closureMessage);

    await deliverClosure();
    await click("Join a room");
    expect(pageText()).not.toContain(closureMessage);
    await click("← Game cabinet");
    expect(pageText()).not.toContain(closureMessage);

    await deliverClosure();
    await click("Set up Family Feud");
    expect(pageText()).not.toContain(closureMessage);
    await click("← All games");
    expect(pageText()).not.toContain(closureMessage);
  });

  it("clears a notice received during a successful join before a later return home", async () => {
    const joinedRoom = roomSnapshot({
      role: "player",
      participantId: "player-1",
      team: null,
    });
    const pendingJoin = deferred<RoomSnapshot>();
    roomClientMock.joinRoom.mockReturnValueOnce(pendingJoin.promise);
    await renderApp();

    await click("Join a room");
    await enter(document.querySelector("input.code-input")!, "ABCDE");
    await enter(document.querySelector('input[placeholder="What should we call you?"]')!, "Avery");
    await submit(document.querySelector("form.join-form")!);
    expect(roomClientMock.joinRoom).toHaveBeenCalledWith("ABCDE", "Avery", null);

    await deliverClosure("The reconnect attempt failed.");
    expect(pageText()).toContain("The reconnect attempt failed.");

    await act(async () => {
      pendingJoin.resolve(joinedRoom);
      await pendingJoin.promise;
    });
    expect(pageText()).toContain("You’re in");
    await click("Leave");
    expect(pageText()).toContain("Pick your game.");
    expect(pageText()).not.toContain("The reconnect attempt failed.");
  });

  it("clears a notice received during successful creation before a later return home", async () => {
    const createdRoom = roomSnapshot({ role: "host" });
    const pendingCreation = deferred<RoomSnapshot>();
    roomClientMock.createRoom.mockReturnValueOnce(pendingCreation.promise);
    await renderApp();

    await click("Set up Family Feud");
    await submit(document.querySelector("form.setup-form")!);
    expect(roomClientMock.createRoom).toHaveBeenCalledOnce();

    await deliverClosure("The previous room disconnected.");
    expect(pageText()).toContain("The previous room disconnected.");

    await act(async () => {
      pendingCreation.resolve(createdRoom);
      await pendingCreation.promise;
    });
    expect(pageText()).toContain("Room ABCDE");
    await click("Close room");
    expect(pageText()).toContain("Pick your game.");
    expect(pageText()).not.toContain("The previous room disconnected.");
  });
});
