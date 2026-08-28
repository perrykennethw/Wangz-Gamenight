import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import type { RoomConnectionStatus } from "../src/roomClient";
import type { RoomSnapshot } from "../src/roomTypes";

const roomClientMock = vi.hoisted(() => ({
  hasRecoveryIntent: vi.fn(() => true),
  subscribe: vi.fn(),
  subscribeTyping: vi.fn(() => () => undefined),
  subscribeFastMoneyRepeat: vi.fn(() => () => undefined),
  leaveRoom: vi.fn(),
  chooseTeam: vi.fn(),
  sendMessage: vi.fn(),
  pressBuzzer: vi.fn(),
  updateIdentity: vi.fn(),
}));

vi.mock("../src/roomClient", () => ({ roomClient: roomClientMock }));

let root: Root | null = null;
let notifyClosed: ((message: string) => void) | null = null;
let notifyStatus: ((status: RoomConnectionStatus) => void) | null = null;
let notifyRecovered: ((snapshot: RoomSnapshot) => void) | null = null;

class TestBroadcastChannel {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  postMessage() {}
  close() {}
}

function playerSnapshot(hostStatus: "connected" | "reconnecting"): RoomSnapshot {
  return {
    code: "ABCDE",
    phase: "lobby",
    hostConnection: {
      status: hostStatus,
      recoveryDeadline: hostStatus === "reconnecting" ? Date.now() + 60_000 : null,
    },
    gameRevision: 1,
    config: { kind: "spin-solve", teamOne: "Comets", teamTwo: "Rockets", rounds: 3 },
    participants: [
      { id: "player-1", name: "Avery", avatarId: null, team: "one", status: "active" },
    ],
    messages: [],
    teamChats: { one: [] },
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
    buzzer: { status: "idle", winner: null, representatives: { one: null, two: null } },
    timer: { status: "idle", durationSeconds: null, startedAt: null, deadline: null },
    viewer: { role: "player", participantId: "player-1", team: "one" },
    game: null,
  };
}

function pageText(): string {
  return document.body.textContent?.replace(/\s+/g, " ").trim() ?? "";
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
  window.scrollTo = vi.fn();
  window.matchMedia = vi.fn(() => ({
    matches: false,
    media: "",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  vi.stubGlobal("BroadcastChannel", TestBroadcastChannel);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  roomClientMock.hasRecoveryIntent.mockReturnValue(true);
  notifyClosed = null;
  notifyStatus = null;
  notifyRecovered = null;
  roomClientMock.subscribe.mockImplementation((
    _onSnapshot: (snapshot: RoomSnapshot) => void,
    onClosed: (message: string) => void,
    onStatus: (status: RoomConnectionStatus) => void,
    onRecovered: (snapshot: RoomSnapshot) => void,
  ) => {
    notifyClosed = onClosed;
    notifyStatus = onStatus;
    notifyRecovered = onRecovered;
    onStatus({ state: "reconnecting", message: "Rejoining your room…" });
    return () => undefined;
  });
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  vi.unstubAllGlobals();
});

describe("room recovery UI", () => {
  it("restores the player screen and reports transport and moderator recovery states", async () => {
    await renderApp();
    expect(pageText()).toContain("Rejoining");
    expect(pageText()).toContain("your room.");

    await act(async () => {
      notifyRecovered?.(playerSnapshot("reconnecting"));
    });
    expect(pageText()).toContain("Your team · waiting for host");
    expect(pageText()).toContain("Moderator reconnecting");

    await act(async () => {
      notifyStatus?.({ state: "reconnecting", message: "Connection lost. Rejoining your room…" });
    });
    expect(pageText()).toContain("Connection lost. Rejoining your room…");

    await act(async () => {
      notifyStatus?.({ state: "back-online", message: "Back online." });
    });
    expect(pageText()).toContain("Back online.");
  });

  it("returns home with a specific notice when recovery has expired", async () => {
    await renderApp();
    await act(async () => {
      notifyClosed?.("Recovery expired. That room is no longer active.");
    });

    expect(pageText()).toContain("Pick your game.");
    expect(pageText()).toContain("Recovery expired. That room is no longer active.");
  });
});
