import { ConversationHeader } from "./ConversationHeader";
import { MessageList } from "./MessageList";
import { TypingIndicator } from "./TypingIndicator";
import { MessageComposer } from "./MessageComposer";
import { VoiceChannelBar } from "../../calls/components/VoiceChannelBar";
import { useMessages } from "../../hooks/useMessages";
import { useSendMessage } from "../../hooks/useSendMessage";
import { useSendVoiceMessage } from "../../hooks/useSendVoiceMessage";
import { useEditMessage } from "../../hooks/useEditMessage";
import { useDeleteMessage } from "../../hooks/useDeleteMessage";
import { useReadReceipts } from "../../hooks/useReadReceipts";
import { useConversations } from "../../hooks/useConversations";
import { EmptyState } from "../ui/EmptyState";
import { Spinner } from "../ui/Spinner";
import type { User } from "../../types/user";

export function ConversationView({ conversationId, currentUser }: { conversationId: string; currentUser: User }) {
  const { data: conversations, isLoading: isLoadingConversations } = useConversations();
  const conversation = conversations?.find((c) => c.id === conversationId);

  const { data: messages = [], isLoading: isLoadingMessages } = useMessages(conversationId);
  const { send, retry } = useSendMessage(conversationId);
  const sendVoice = useSendVoiceMessage(conversationId);
  const editMessage = useEditMessage(conversationId);
  const deleteMessage = useDeleteMessage(conversationId);

  useReadReceipts(conversationId, messages, currentUser.id);

  if (isLoadingConversations) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex-1">
        <EmptyState
          title="Conversation not found"
          description="You may not be a member of this conversation, or it doesn't exist."
        />
      </div>
    );
  }

  return (
    <>
      <ConversationHeader conversation={conversation} currentUserId={currentUser.id} />
      {conversation.type === "group" && <VoiceChannelBar conversationId={conversationId} />}
      <MessageList
        conversationId={conversationId}
        messages={messages}
        currentUserId={currentUser.id}
        isLoading={isLoadingMessages}
        onEdit={(messageId, content) => {
          const message = messages.find((m) => m.id === messageId);
          if (message) {
            editMessage.mutate({ messageId, content, version: message.version });
          }
        }}
        onDelete={(messageId) => deleteMessage.mutate(messageId)}
        onRetry={(message) => retry(message)}
      />
      <TypingIndicator conversationId={conversationId} />
      <MessageComposer
        conversationId={conversationId}
        onSend={send}
        onSendVoice={(blob, durationMs) => sendVoice.mutate({ blob, durationMs })}
      />
    </>
  );
}
