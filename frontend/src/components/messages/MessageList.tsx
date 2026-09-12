import { Fragment } from "react";
import { MessageBubble } from "./MessageBubble";
import { DateDivider } from "./DateDivider";
import { EmptyState } from "../ui/EmptyState";
import { Spinner } from "../ui/Spinner";
import { useAutoScroll } from "../../hooks/useAutoScroll";
import { isSameDay, shouldGroupWithPrevious } from "../../lib/format";
import { useReadReceiptsStore } from "../../stores/readReceiptsStore";
import type { ChatMessage } from "../../types/message";

interface MessageListProps {
  conversationId: string;
  messages: ChatMessage[];
  currentUserId: string;
  isLoading: boolean;
  onEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string) => void;
  onRetry: (message: ChatMessage) => void;
}

export function MessageList({ conversationId, messages, currentUserId, isLoading, onEdit, onDelete, onRetry }: MessageListProps) {
  const { containerRef, handleScroll } = useAutoScroll(messages.length > 0 ? messages[messages.length - 1] : null);
  const lastReadByPeer = useReadReceiptsStore((s) => s.lastReadByConversation[conversationId]);

  const highestReadIndex = findHighestReadIndex(messages, lastReadByPeer, currentUserId);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1">
        <EmptyState title="No messages yet" description="Send the first message to get things started." />
      </div>
    );
  }

  return (
    <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-3">
      {messages.map((message, index) => {
        const previous = messages[index - 1];
        const isOwn = message.sender_id === currentUserId;
        const showDivider = !previous || !isSameDay(previous.created_at, message.created_at);
        const showMeta = !shouldGroupWithPrevious(message, previous);

        return (
          <Fragment key={message.id}>
            {showDivider && <DateDivider iso={message.created_at} />}
            <MessageBubble
              message={message}
              isOwn={isOwn}
              showMeta={showMeta}
              isReadByPeer={isOwn && index <= highestReadIndex}
              onEdit={(content) => onEdit(message.id, content)}
              onDelete={() => onDelete(message.id)}
              onRetry={() => onRetry(message)}
            />
          </Fragment>
        );
      })}
    </div>
  );
}

function findHighestReadIndex(
  messages: ChatMessage[],
  lastReadByPeer: Record<string, string> | undefined,
  currentUserId: string,
): number {
  if (!lastReadByPeer) {
    return -1;
  }

  let highest = -1;
  for (const [userId, messageId] of Object.entries(lastReadByPeer)) {
    if (userId === currentUserId) {
      continue;
    }
    const index = messages.findIndex((m) => m.id === messageId);
    if (index > highest) {
      highest = index;
    }
  }
  return highest;
}
