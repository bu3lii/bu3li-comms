import { useConversations } from "../../hooks/useConversations";
import { ConversationListItem } from "./ConversationListItem";
import { Spinner } from "../ui/Spinner";

export function ConversationList({ currentUserId }: { currentUserId: string }) {
  const { data: conversations, isLoading } = useConversations();

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Spinner size="sm" />
      </div>
    );
  }

  if (!conversations || conversations.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-text-tertiary">
        No conversations yet. Start one above.
      </p>
    );
  }

  return (
    <nav aria-label="Conversations" className="flex flex-col gap-0.5 overflow-y-auto px-2 py-2">
      {conversations.map((conversation) => (
        <ConversationListItem key={conversation.id} conversation={conversation} currentUserId={currentUserId} />
      ))}
    </nav>
  );
}
