import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addReaction, removeReaction } from "../api/messages";
import { addReactionLocal, removeReactionLocal } from "../api/messageCache";
import { messagesQueryKey } from "./useMessages";
import { useMe } from "./useMe";
import { useToastStore } from "../stores/toastStore";
import type { ChatMessage } from "../types/message";

/**
 * Toggles the current user's reaction on a message: adds it if they haven't
 * reacted with that emoji yet, removes it if they have. Applies the change
 * optimistically since the realtime event that would otherwise confirm it
 * is only broadcast to *other* members (see internal/messages/handler.go),
 * not echoed back to the sender.
 */
export function useToggleReaction(conversationId: string) {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const pushToast = useToastStore((s) => s.push);
  const queryKey = messagesQueryKey(conversationId);

  return useMutation({
    mutationFn: async ({ messageId, emoji, isActive }: { messageId: string; emoji: string; isActive: boolean }) => {
      if (isActive) {
        await removeReaction(messageId, emoji);
      } else {
        await addReaction(messageId, emoji);
      }
    },
    onMutate: async ({ messageId, emoji, isActive }) => {
      if (!me) return;
      queryClient.setQueryData<ChatMessage[]>(queryKey, (old = []) =>
        isActive ? removeReactionLocal(old, messageId, me.id, emoji) : addReactionLocal(old, messageId, me.id, emoji),
      );
    },
    onError: () => {
      pushToast("Couldn't update that reaction. Try again.", "error");
      void queryClient.invalidateQueries({ queryKey });
    },
  });
}
