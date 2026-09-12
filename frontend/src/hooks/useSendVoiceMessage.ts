import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sendVoiceMessage } from "../api/messages";
import { insertOrReconcileMessage } from "../api/messageCache";
import { messagesQueryKey } from "./useMessages";
import { useToastStore } from "../stores/toastStore";
import { ApiError } from "../api/client";
import type { ChatMessage } from "../types/message";

export function useSendVoiceMessage(conversationId: string) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const queryKey = messagesQueryKey(conversationId);

  return useMutation({
    mutationFn: (input: { blob: Blob; durationMs: number }) =>
      sendVoiceMessage(conversationId, {
        client_message_id: crypto.randomUUID(),
        durationMs: input.durationMs,
        blob: input.blob,
      }),
    onSuccess: (message) => {
      queryClient.setQueryData<ChatMessage[]>(queryKey, (old = []) => insertOrReconcileMessage(old, message));
    },
    onError: (error) => {
      if (error instanceof ApiError && error.isRateLimited) {
        pushToast("Sending too fast — wait a moment and try again.", "error");
        return;
      }
      pushToast("Couldn't send that voice message. Try again.", "error");
    },
  });
}
