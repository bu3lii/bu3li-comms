import { useQuery } from "@tanstack/react-query";
import { listMessages } from "../api/messages";
import { toSentMessage, type ChatMessage } from "../types/message";

export function messagesQueryKey(conversationId: string) {
  return ["messages", conversationId] as const;
}

export function useMessages(conversationId: string | undefined) {
  return useQuery({
    queryKey: messagesQueryKey(conversationId ?? ""),
    queryFn: async (): Promise<ChatMessage[]> => {
      const messages = await listMessages(conversationId!);
      return messages.map(toSentMessage);
    },
    enabled: Boolean(conversationId),
  });
}
