import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addConversationMember, createConversation } from "../api/conversations";
import { useToastStore } from "../stores/toastStore";
import { conversationsQueryKey } from "./useConversations";
import type { ConversationType } from "../types/conversation";

interface StartConversationInput {
  type: ConversationType;
  memberIds: string[];
}

export function useStartConversation() {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  return useMutation({
    mutationFn: async ({ type, memberIds }: StartConversationInput) => {
      const conversation = await createConversation(type);
      await Promise.all(memberIds.map((userId) => addConversationMember(conversation.id, userId)));
      return conversation;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: conversationsQueryKey() });
    },
    onError: () => {
      pushToast("Couldn't start that conversation. Try again.", "error");
    },
  });
}
