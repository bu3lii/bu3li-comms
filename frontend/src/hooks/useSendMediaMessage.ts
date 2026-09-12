import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sendMediaMessage } from "../api/messages";
import { insertOrReconcileMessage } from "../api/messageCache";
import { messagesQueryKey } from "./useMessages";
import { useToastStore } from "../stores/toastStore";
import { ApiError } from "../api/client";
import type { ChatMessage } from "../types/message";

interface SendMediaInput {
  blob: Blob;
  durationMs?: number;
  widthPx?: number;
  heightPx?: number;
}

export function useSendMediaMessage(conversationId: string) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const queryKey = messagesQueryKey(conversationId);

  return useMutation({
    mutationFn: (input: SendMediaInput) =>
      sendMediaMessage(conversationId, {
        client_message_id: crypto.randomUUID(),
        blob: input.blob,
        durationMs: input.durationMs,
        widthPx: input.widthPx,
        heightPx: input.heightPx,
      }),
    onSuccess: (message) => {
      queryClient.setQueryData<ChatMessage[]>(queryKey, (old = []) => insertOrReconcileMessage(old, message));
    },
    onError: (error) => {
      if (error instanceof ApiError && error.isRateLimited) {
        pushToast("Sending too fast — wait a moment and try again.", "error");
        return;
      }
      pushToast("Couldn't send that attachment. Try again.", "error");
    },
  });
}
