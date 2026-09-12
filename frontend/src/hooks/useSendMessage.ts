import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sendMessage } from "../api/messages";
import { insertOrReconcileMessage, markFailed, markRetrying } from "../api/messageCache";
import { messagesQueryKey } from "./useMessages";
import { useMe } from "./useMe";
import type { ChatMessage } from "../types/message";

interface SendParams {
  clientMessageId: string;
  content: string;
}

export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const queryKey = messagesQueryKey(conversationId);

  const mutation = useMutation({
    mutationFn: ({ clientMessageId, content }: SendParams) =>
      sendMessage(conversationId, { client_message_id: clientMessageId, content }),
    onSuccess: (message) => {
      queryClient.setQueryData<ChatMessage[]>(queryKey, (old = []) => insertOrReconcileMessage(old, message));
    },
    onError: (_error, { clientMessageId }) => {
      queryClient.setQueryData<ChatMessage[]>(queryKey, (old = []) => markFailed(old, clientMessageId));
    },
  });

  function send(content: string): void {
    if (!me) {
      return;
    }

    const clientMessageId = crypto.randomUUID();
    const now = new Date().toISOString();
    const pending: ChatMessage = {
      id: clientMessageId,
      conversation_id: conversationId,
      sender_id: me.id,
      client_message_id: clientMessageId,
      content,
      version: 1,
      created_at: now,
      updated_at: now,
      has_attachment: false,
      attachment_duration_ms: 0,
      attachment_width_px: 0,
      attachment_height_px: 0,
      reactions: [],
      status: "pending",
    };

    queryClient.setQueryData<ChatMessage[]>(queryKey, (old = []) => [...old, pending]);
    mutation.mutate({ clientMessageId, content });
  }

  function retry(message: ChatMessage): void {
    queryClient.setQueryData<ChatMessage[]>(queryKey, (old = []) =>
      markRetrying(old, message.client_message_id),
    );
    mutation.mutate({ clientMessageId: message.client_message_id, content: message.content });
  }

  return { send, retry };
}
