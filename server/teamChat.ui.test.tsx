import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HostHuddles, PlayerChatDrawer, TeamChat } from "../src/App";
import type { ChatMessage, ChatTypingUpdate, RoomSnapshot, TeamId } from "../src/roomTypes";

const roomClientMock = vi.hoisted(() => ({
  subscribeTyping: vi.fn((_listener: (update: ChatTypingUpdate) => void) => () => undefined),
  setTyping: vi.fn(),
  sendMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/roomClient", () => ({ roomClient: roomClientMock }));

let root: Root | null = null;

function chatMessage(id: string, senderId = "player-two"): ChatMessage {
  return {
    id,
    senderId,
    senderName: senderId === "player-one" ? "Avery" : "Blake",
    senderAvatarId: null,
    team: "one",
    text: `Message ${id}`,
    sentAt: Number(id.replace(/\D/g, "")) || 1,
  };
}

async function renderChat(
  messages: ChatMessage[],
  active: boolean,
): Promise<void> {
  await act(async () => {
    root?.render(
      <TeamChat
        team="one"
        teamLabel="Comets"
        messages={messages}
        participantId="player-one"
        onSend={vi.fn().mockResolvedValue(undefined)}
        active={active}
      />,
    );
  });
}

function roomSnapshot({
  code = "ROOM1",
  messages = [],
  teamChats = {},
  lockedTeam = null,
}: {
  code?: string;
  messages?: ChatMessage[];
  teamChats?: Partial<Record<TeamId, ChatMessage[]>>;
  lockedTeam?: TeamId | null;
} = {}): RoomSnapshot {
  return {
    code,
    config: {
      kind: "feud",
      teamOne: "Comets",
      teamTwo: "Sparks",
      winningScore: 300,
    },
    messages,
    teamChats,
    chat: {
      lockedTeam,
      reason: lockedTeam ? "Answers are live." : null,
    },
  } as RoomSnapshot;
}

async function renderPlayerDrawer(
  room: RoomSnapshot,
  team: TeamId = "one",
): Promise<void> {
  await act(async () => {
    root?.render(
      <PlayerChatDrawer
        room={room}
        team={team}
        participantId="player-one"
        onSendMessage={vi.fn().mockResolvedValue(undefined)}
        phaseKey="lobby"
      />,
    );
  });
}

async function renderHostHuddles(room: RoomSnapshot): Promise<void> {
  await act(async () => {
    root?.render(<HostHuddles room={room} />);
  });
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function configureFeed(feed: HTMLDivElement) {
  let scrollHeight = 900;
  Object.defineProperties(feed, {
    clientHeight: { configurable: true, get: () => 300 },
    scrollHeight: { configurable: true, get: () => scrollHeight },
  });
  return {
    setScrollHeight(value: number) {
      scrollHeight = value;
    },
  };
}

async function scrollFeed(
  feed: HTMLDivElement,
  scrollTop: number,
): Promise<void> {
  await act(async () => {
    feed.scrollTop = scrollTop;
    feed.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
}

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  roomClientMock.subscribeTyping.mockReturnValue(() => undefined);
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
  root = createRoot(document.querySelector("#root")!);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
});

describe("TeamChat auto-scroll", () => {
  it("shows the latest message when the mobile drawer opens", async () => {
    const messages = [chatMessage("message-1"), chatMessage("message-2")];
    await renderChat(messages, false);
    const feed = document.querySelector<HTMLDivElement>(".chat-feed")!;
    configureFeed(feed);

    await renderChat(messages, true);

    expect(feed.scrollTop).toBe(900);
  });

  it("follows incoming messages while the player is near the bottom", async () => {
    const messages = [chatMessage("message-1")];
    await renderChat(messages, false);
    const feed = document.querySelector<HTMLDivElement>(".chat-feed")!;
    const feedSize = configureFeed(feed);
    await renderChat(messages, true);
    await scrollFeed(feed, 580);

    feedSize.setScrollHeight(1_050);
    await renderChat([...messages, chatMessage("message-2")], true);

    expect(feed.scrollTop).toBe(1_050);
  });

  it("preserves manual scrollback for incoming messages", async () => {
    const messages = [chatMessage("message-1")];
    await renderChat(messages, false);
    const feed = document.querySelector<HTMLDivElement>(".chat-feed")!;
    const feedSize = configureFeed(feed);
    await renderChat(messages, true);
    await scrollFeed(feed, 200);

    feedSize.setScrollHeight(1_050);
    await renderChat([...messages, chatMessage("message-2")], true);

    expect(feed.scrollTop).toBe(200);
  });

  it("follows the player's own message even after manual scrollback", async () => {
    const messages = [chatMessage("message-1")];
    await renderChat(messages, false);
    const feed = document.querySelector<HTMLDivElement>(".chat-feed")!;
    const feedSize = configureFeed(feed);
    await renderChat(messages, true);
    await scrollFeed(feed, 200);

    feedSize.setScrollHeight(1_050);
    await renderChat([...messages, chatMessage("message-2", "player-one")], true);

    expect(feed.scrollTop).toBe(1_050);
  });

  it("shows messages received while the mobile drawer was closed", async () => {
    const messages = [chatMessage("message-1")];
    await renderChat(messages, false);
    const feed = document.querySelector<HTMLDivElement>(".chat-feed")!;
    const feedSize = configureFeed(feed);
    feed.scrollTop = 200;

    feedSize.setScrollHeight(1_050);
    const updatedMessages = [...messages, chatMessage("message-2")];
    await renderChat(updatedMessages, false);
    expect(feed.scrollTop).toBe(200);

    await renderChat(updatedMessages, true);
    expect(feed.scrollTop).toBe(1_050);
  });

  it("offers a jump control without moving manual scrollback", async () => {
    const onReadLatest = vi.fn();
    const messages = [chatMessage("message-1")];
    await act(async () => {
      root?.render(
        <TeamChat
          team="one"
          teamLabel="Comets"
          messages={messages}
          participantId="player-one"
          onSend={vi.fn().mockResolvedValue(undefined)}
          onReadLatest={onReadLatest}
        />,
      );
    });
    const feed = document.querySelector<HTMLDivElement>(".chat-feed")!;
    const feedSize = configureFeed(feed);
    await scrollFeed(feed, 200);
    onReadLatest.mockClear();

    feedSize.setScrollHeight(1_050);
    await act(async () => {
      root?.render(
        <TeamChat
          team="one"
          teamLabel="Comets"
          messages={[...messages, chatMessage("message-2")]}
          participantId="player-one"
          onSend={vi.fn().mockResolvedValue(undefined)}
          unreadCount={1}
          onReadLatest={onReadLatest}
        />,
      );
    });

    expect(feed.scrollTop).toBe(200);
    const jump = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Jump to latest"),
    );
    expect(jump).toBeTruthy();
    await click(jump!);
    expect(feed.scrollTop).toBe(1_050);
    expect(onReadLatest).toHaveBeenCalledTimes(1);
  });

  it("marks messages read when the user scrolls back to the bottom", async () => {
    const onReadLatest = vi.fn();
    await act(async () => {
      root?.render(
        <TeamChat
          team="one"
          teamLabel="Comets"
          messages={[chatMessage("message-1"), chatMessage("message-2")]}
          participantId="player-one"
          onSend={vi.fn().mockResolvedValue(undefined)}
          unreadCount={1}
          onReadLatest={onReadLatest}
        />,
      );
    });
    const feed = document.querySelector<HTMLDivElement>(".chat-feed")!;
    configureFeed(feed);
    await scrollFeed(feed, 200);
    onReadLatest.mockClear();

    await scrollFeed(feed, 600);

    expect(onReadLatest).toHaveBeenCalledTimes(1);
  });

  it("uses one concise live announcement instead of a live message feed", async () => {
    await act(async () => {
      root?.render(
        <TeamChat
          team="one"
          teamLabel="Comets"
          messages={[chatMessage("message-1")]}
          participantId="player-one"
          onSend={vi.fn().mockResolvedValue(undefined)}
          announcement="New message in Comets from Blake."
        />,
      );
    });

    expect(document.querySelector(".chat-feed")?.hasAttribute("aria-live")).toBe(false);
    expect(document.querySelector('[role="status"]')?.textContent).toBe(
      "New message in Comets from Blake.",
    );
  });
});

describe("Player chat unread state", () => {
  it("counts rapid incoming messages while collapsed and clears on open", async () => {
    const initial = [chatMessage("message-1")];
    await renderPlayerDrawer(roomSnapshot({ messages: initial }));
    const feed = document.querySelector<HTMLDivElement>(".chat-feed")!;
    configureFeed(feed);

    await renderPlayerDrawer(roomSnapshot({
      messages: [
        ...initial,
        chatMessage("message-2"),
        chatMessage("message-3"),
        chatMessage("message-4"),
        chatMessage("message-5"),
      ],
    }));

    expect(document.querySelector('[aria-label="4 unread team chat messages"]')).toBeTruthy();
    await click(document.querySelector(".player-chat-drawer__toggle")!);
    expect(document.querySelector('[aria-label="4 unread team chat messages"]')).toBeNull();
  });

  it("resets the cursor when the server-authoritative team changes", async () => {
    await renderPlayerDrawer(roomSnapshot({ messages: [chatMessage("message-1")] }));
    await renderPlayerDrawer(roomSnapshot({
      messages: [chatMessage("message-1"), chatMessage("message-2")],
    }));
    expect(document.querySelector('[aria-label="1 unread team chat message"]')).toBeTruthy();

    const sparksMessage = { ...chatMessage("message-9"), team: "two" as const };
    await renderPlayerDrawer(roomSnapshot({ messages: [sparksMessage] }), "two");

    expect(document.querySelector('[aria-label*="unread team chat"]')).toBeNull();
  });

  it("resets unread state when leaving one room for another", async () => {
    const initial = [chatMessage("message-1")];
    await renderPlayerDrawer(roomSnapshot({ code: "ROOM1", messages: initial }));
    await renderPlayerDrawer(roomSnapshot({
      code: "ROOM1",
      messages: [...initial, chatMessage("message-2")],
    }));
    expect(document.querySelector('[aria-label="1 unread team chat message"]')).toBeTruthy();

    await renderPlayerDrawer(roomSnapshot({
      code: "ROOM2",
      messages: [chatMessage("message-8"), chatMessage("message-9")],
    }));

    expect(document.querySelector('[aria-label*="unread team chat"]')).toBeNull();
  });

  it("does not increment unread state for typing activity", async () => {
    await renderPlayerDrawer(roomSnapshot({ messages: [chatMessage("message-1")] }));
    const subscribe = roomClientMock.subscribeTyping.mock.calls.at(-1)?.[0];

    await act(async () => {
      subscribe?.({
        senderId: "player-two",
        senderName: "Blake",
        senderAvatarId: null,
        team: "one",
        isTyping: true,
      });
    });

    expect(document.querySelector('[aria-label*="unread team chat"]')).toBeNull();
    expect(document.body.textContent).toContain("Blake is typing");
  });

  it("keeps locked history readable while disabling the composer", async () => {
    await renderPlayerDrawer(roomSnapshot({
      messages: [chatMessage("message-1")],
      lockedTeam: "one",
    }));
    const feed = document.querySelector<HTMLDivElement>(".chat-feed")!;
    configureFeed(feed);
    await click(document.querySelector(".player-chat-drawer__toggle")!);

    expect(document.body.textContent).toContain("Message message-1");
    expect(document.body.textContent).toContain("Huddle paused.");
    expect(document.querySelector<HTMLInputElement>('.team-chat input')?.disabled).toBe(true);
  });
});

describe("Host huddle unread state", () => {
  beforeEach(() => {
    class OffscreenObserver {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal("IntersectionObserver", OffscreenObserver);
  });

  it("tracks both team huddles independently", async () => {
    const one = [chatMessage("message-1")];
    const two = [{ ...chatMessage("message-10"), team: "two" as const }];
    await renderHostHuddles(roomSnapshot({ teamChats: { one, two } }));

    await renderHostHuddles(roomSnapshot({
      teamChats: {
        one: [...one, chatMessage("message-2")],
        two: [
          ...two,
          { ...chatMessage("message-11"), team: "two" as const },
          { ...chatMessage("message-12"), team: "two" as const },
        ],
      },
    }));

    expect(document.querySelector('.team-chat--one [aria-label="1 unread message"]')).toBeTruthy();
    expect(document.querySelector('.team-chat--two [aria-label="2 unread messages"]')).toBeTruthy();
  });
});
