import { Link } from "react-router-dom";
import { Avatar } from "../ui/Avatar";
import { useIsOnline } from "../../stores/presenceStore";
import { conversationDisplayName, directPeer } from "../../lib/conversation";
import { CallButton } from "../../calls/components/CallButton";
import type { ConversationSummary } from "../../types/conversation";

export function ConversationHeader({
  conversation,
  currentUserId,
}: {
  conversation: ConversationSummary;
  currentUserId: string;
}) {
  const peer = directPeer(conversation, currentUserId);
  const peerId = peer?.id;
  const isOnline = useIsOnline(peerId);
  const name = conversationDisplayName(conversation, currentUserId);

  return (
    <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
      <Link
        to="/chat"
        className="-ml-1 flex h-8 w-8 items-center justify-center rounded-[8px] text-text-secondary hover:bg-surface-raised md:hidden"
        aria-label="Back to conversations"
      >
        <BackIcon />
      </Link>
      <Avatar seed={conversation.id} name={name} userId={peer?.id} hasAvatar={peer?.has_avatar} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text-primary">{name}</p>
        {peerId ? (
          <p className="text-xs text-text-tertiary">{isOnline ? "Online" : "Offline"}</p>
        ) : (
          <p className="text-xs text-text-tertiary">{conversation.members.length} members</p>
        )}
      </div>
      {conversation.type === "direct" && <CallButton conversationId={conversation.id} />}
    </header>
  );
}

function BackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M11 4 6 9l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
