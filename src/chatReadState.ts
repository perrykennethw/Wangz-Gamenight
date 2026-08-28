import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChatMessage } from "./roomTypes";

interface ChatReadCursor {
  chatKey: string;
  lastReadMessageId: string | null;
}

interface ChatReadStateOptions {
  chatKey: string;
  messages: ChatMessage[];
  viewerId: string;
  teamLabel: string;
}

export function countUnreadMessages(
  messages: ChatMessage[],
  lastReadMessageId: string | null,
  viewerId: string,
): number {
  const lastReadIndex = lastReadMessageId === null
    ? -1
    : messages.findIndex((message) => message.id === lastReadMessageId);

  if (lastReadMessageId !== null && lastReadIndex === -1) return 0;
  return messages
    .slice(lastReadIndex + 1)
    .filter((message) => message.senderId !== viewerId)
    .length;
}

export function useChatReadState({
  chatKey,
  messages,
  viewerId,
  teamLabel,
}: ChatReadStateOptions) {
  const latestMessage = messages[messages.length - 1];
  const latestMessageId = latestMessage?.id ?? null;
  const latestSenderId = latestMessage?.senderId ?? null;
  const latestSenderName = latestMessage?.senderName ?? "";
  const [cursor, setCursor] = useState<ChatReadCursor>(() => ({
    chatKey,
    lastReadMessageId: latestMessageId,
  }));
  const [announcement, setAnnouncement] = useState("");
  const lastAnnounced = useRef({ chatKey, messageId: latestMessageId });
  const effectiveLastReadMessageId = cursor.chatKey === chatKey
    ? cursor.lastReadMessageId
    : latestMessageId;

  useLayoutEffect(() => {
    setCursor((current) => {
      if (current.chatKey !== chatKey) {
        return { chatKey, lastReadMessageId: latestMessageId };
      }
      if (
        current.lastReadMessageId !== null
        && !messages.some((message) => message.id === current.lastReadMessageId)
      ) {
        return { chatKey, lastReadMessageId: latestMessageId };
      }
      return current;
    });
  }, [chatKey, latestMessageId, messages]);

  useEffect(() => {
    if (lastAnnounced.current.chatKey !== chatKey) {
      lastAnnounced.current = { chatKey, messageId: latestMessageId };
      setAnnouncement("");
      return;
    }
    if (latestMessageId === null || lastAnnounced.current.messageId === latestMessageId) return;

    lastAnnounced.current.messageId = latestMessageId;
    setAnnouncement(
      latestSenderId === viewerId
        ? ""
        : `New message in ${teamLabel} from ${latestSenderName}.`,
    );
  }, [chatKey, latestMessageId, latestSenderId, latestSenderName, teamLabel, viewerId]);

  const markLatestRead = useCallback(() => {
    setCursor((current) => {
      if (
        current.chatKey === chatKey
        && current.lastReadMessageId === latestMessageId
      ) {
        return current;
      }
      return { chatKey, lastReadMessageId: latestMessageId };
    });
  }, [chatKey, latestMessageId]);

  return {
    announcement,
    markLatestRead,
    unreadCount: countUnreadMessages(
      messages,
      effectiveLastReadMessageId,
      viewerId,
    ),
  };
}
