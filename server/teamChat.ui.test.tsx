import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TeamChat } from "../src/App";
import type { ChatMessage } from "../src/roomTypes";

const roomClientMock = vi.hoisted(() => ({
  subscribeTyping: vi.fn(() => () => undefined),
  setTyping: vi.fn(),
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
});
