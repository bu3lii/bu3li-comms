import { useEffect, useRef } from "react";
import { realtimeSocket } from "../realtime/socket";
import type { ChatMessage } from "../types/message";

/**
 * v1 read receipts: whenever the conversation is open and the document is
 * visible, mark the latest incoming (non-own, server-confirmed) message as
 * read. Simpler than tracking per-message viewport visibility, per spec.
 */
export function useReadReceipts(conversationId: string, messages: ChatMessage[], currentUserId: string | undefined): void {
  const lastMarkedRef = useRef<string | null>(null);

  useEffect(() => {
    lastMarkedRef.current = null;
  }, [conversationId]);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    function markLatestIncomingRead(): void {
      if (document.visibilityState !== "visible") {
        return;
      }

      let lastIncoming: ChatMessage | undefined;
      for (const message of messages) {
        if (message.sender_id !== currentUserId && message.status === "sent") {
          lastIncoming = message;
        }
      }

      if (!lastIncoming || lastMarkedRef.current === lastIncoming.id) {
        return;
      }

      lastMarkedRef.current = lastIncoming.id;
      realtimeSocket.send({ type: "message.read", data: { message_id: lastIncoming.id } });
    }

    markLatestIncomingRead();
    document.addEventListener("visibilitychange", markLatestIncomingRead);
    return () => document.removeEventListener("visibilitychange", markLatestIncomingRead);
  }, [conversationId, messages, currentUserId]);
}
