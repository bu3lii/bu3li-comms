import { useMutation, useQueryClient } from "@tanstack/react-query";
import { editMessage } from "../api/messages";
import { replaceIfNewer } from "../api/messageCache";
import { messagesQueryKey } from "./useMessages";
import { useToastStore } from "../stores/toastStore";
import { ApiError } from "../api/client";
import type { ChatMessage } from "../types/message";

export function useEditMessage(conversationId: string) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const queryKey = messagesQueryKey(conversationId);

  return useMutation({
    mutationFn: ({ messageId, content, version }: { messageId: string; content: string; version: number }) =>
      editMessage(messageId, { content, version }),
    onSuccess: (message) => {
      queryClient.setQueryData<ChatMessage[]>(queryKey, (old = []) => replaceIfNewer(old, message));
    },
    onError: (error) => {
      if (error instanceof ApiError && error.isConflict) {
        pushToast("This message changed elsewhere. Latest version loaded.", "info");
        void queryClient.invalidateQueries({ queryKey });
        return;
      }
      pushToast("Couldn't save that edit. Try again.", "error");
    },
  });
}
