import { ChannelHeader } from "./ChannelHeader";
import { MessageList } from "./MessageList";
import { TypingIndicator } from "./TypingIndicator";
import { MessageComposer } from "./MessageComposer";
import { VoiceChannelBar } from "../../calls/components/VoiceChannelBar";
import { useMessages } from "../../hooks/useMessages";
import { useSendMessage } from "../../hooks/useSendMessage";
import { useSendVoiceMessage } from "../../hooks/useSendVoiceMessage";
import { useSendMediaMessage } from "../../hooks/useSendMediaMessage";
import { useEditMessage } from "../../hooks/useEditMessage";
import { useDeleteMessage } from "../../hooks/useDeleteMessage";
import { useReadReceipts } from "../../hooks/useReadReceipts";
import { useToggleReaction } from "../../hooks/useToggleReaction";
import type { ServerChannel, ServerSummary } from "../../types/server";
import type { User } from "../../types/user";

/**
 * The main pane for a server channel — the counterpart to ConversationView
 * for DMs/groups. Every channel is backed by an ordinary group
 * conversation (channel.conversation_id), so this reuses the exact same
 * message list/composer/voice building blocks; only the header and the
 * ambient voice bar's visibility (voice channels only, not text) differ.
 */
export function ChannelConversationView({
  server,
  channel,
  currentUser,
}: {
  server: ServerSummary;
  channel: ServerChannel;
  currentUser: User;
}) {
  const conversationId = channel.conversation_id;

  const { data: messages = [], isLoading } = useMessages(conversationId);
  const { send, retry } = useSendMessage(conversationId);
  const sendVoice = useSendVoiceMessage(conversationId);
  const sendMedia = useSendMediaMessage(conversationId);
  const editMessage = useEditMessage(conversationId);
  const deleteMessage = useDeleteMessage(conversationId);
  const toggleReaction = useToggleReaction(conversationId);

  useReadReceipts(conversationId, messages, currentUser.id);

  return (
    <>
      <ChannelHeader server={server} channel={channel} />
      {channel.type === "voice" && <VoiceChannelBar conversationId={conversationId} />}
      <MessageList
        conversationId={conversationId}
        messages={messages}
        currentUserId={currentUser.id}
        isLoading={isLoading}
        onEdit={(messageId, content) => {
          const message = messages.find((m) => m.id === messageId);
          if (message) {
            editMessage.mutate({ messageId, content, version: message.version });
          }
        }}
        onDelete={(messageId) => deleteMessage.mutate(messageId)}
        onRetry={(message) => retry(message)}
        onToggleReaction={(messageId, emoji, isActive) => toggleReaction.mutate({ messageId, emoji, isActive })}
      />
      <TypingIndicator conversationId={conversationId} />
      <MessageComposer
        conversationId={conversationId}
        onSend={send}
        onSendVoice={(blob, durationMs) => sendVoice.mutate({ blob, durationMs })}
        onSendMedia={(blob, meta) => sendMedia.mutate({ blob, ...meta })}
      />
    </>
  );
}
