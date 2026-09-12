import { useCallback, useEffect, useRef } from "react";
import { realtimeSocket } from "../realtime/socket";

const STOP_DELAY_MS = 1500;

/** Sends typing.started/stopped over the socket, debounced per the spec's suggested cadence. */
export function useTypingIndicator(conversationId: string) {
  const isTypingRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTyping = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (isTypingRef.current) {
      isTypingRef.current = false;
      realtimeSocket.send({ type: "typing.stopped", data: { conversation_id: conversationId } });
    }
  }, [conversationId]);

  const notifyTyping = useCallback(() => {
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      realtimeSocket.send({ type: "typing.started", data: { conversation_id: conversationId } });
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(stopTyping, STOP_DELAY_MS);
  }, [conversationId, stopTyping]);

  // Stop on conversation switch or unmount, so a lingering indicator doesn't outlive the composer.
  useEffect(() => stopTyping, [stopTyping]);

  return { notifyTyping, stopTyping };
}
