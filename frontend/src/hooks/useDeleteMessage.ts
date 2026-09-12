import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteMessage } from "../api/messages";
import { removeById } from "../api/messageCache";
import { messagesQueryKey } from "./useMessages";
import { useToastStore } from "../stores/toastStore";
import type { ChatMessage } from "../types/message";

export function useDeleteMessage(conversationId: string) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const queryKey = messagesQueryKey(conversationId);

  return useMutation({
    mutationFn: (messageId: string) => deleteMessage(messageId),
    onSuccess: (_void, messageId) => {
      queryClient.setQueryData<ChatMessage[]>(queryKey, (old = []) => removeById(old, messageId));
    },
    onError: () => {
      pushToast("Couldn't delete that message. Try again.", "error");
    },
  });
}
