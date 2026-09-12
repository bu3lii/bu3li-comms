import { NavLink } from "react-router-dom";
import { Avatar } from "../ui/Avatar";
import { useIsOnline } from "../../stores/presenceStore";
import { useVoiceChannelParticipants } from "../../stores/voiceChannelStore";
import { conversationDisplayName, directPeerId } from "../../lib/conversation";
import { VoiceIcon } from "../../calls/components/icons";
import type { ConversationSummary } from "../../types/conversation";

function LastMessagePreview({ conversation, currentUserId }: { conversation: ConversationSummary; currentUserId: string }) {
  const last = conversation.last_message;
  if (!last) {
    return <span className="block truncate text-xs text-text-tertiary">No messages yet</span>;
  }

  const prefix = last.sender_id === currentUserId ? "You: " : "";

  if (last.has_attachment) {
    return (
      <span className="flex items-center gap-1 truncate text-xs text-text-tertiary">
        {prefix}
        <VoiceIcon />
        Voice message
      </span>
    );
  }

  return <span className="block truncate text-xs text-text-tertiary">{prefix}{last.content}</span>;
}

export function ConversationListItem({
  conversation,
  currentUserId,
}: {
  conversation: ConversationSummary;
  currentUserId: string;
}) {
  const peerId = directPeerId(conversation, currentUserId);
  const isOnline = useIsOnline(peerId);
  const voiceParticipants = useVoiceChannelParticipants(conversation.id);
  const name = conversationDisplayName(conversation, currentUserId);

  return (
    <NavLink
      to={`/chat/${conversation.id}`}
      className={({ isActive }) =>
        `flex items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-sm transition-colors ${
          isActive ? "bg-surface-raised text-text-primary" : "text-text-secondary hover:bg-surface-raised/60"
        }`
      }
    >
      <span className="relative shrink-0">
        <Avatar seed={conversation.id} name={name} size="sm" />
        {peerId && (
          <>
            <span
              className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface"
              style={
                isOnline
                  ? { backgroundColor: "var(--color-online)" }
                  : { backgroundColor: "var(--color-surface)", boxShadow: "inset 0 0 0 1.5px var(--color-text-tertiary)" }
              }
              aria-hidden="true"
            />
            <span className="sr-only">{isOnline ? "online" : "offline"}</span>
          </>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-medium">{name}</span>
          {conversation.type === "group" && (
            <span className="font-mono text-[0.65rem] uppercase text-text-tertiary">group</span>
          )}
        </span>
        <LastMessagePreview conversation={conversation} currentUserId={currentUserId} />
      </span>
      {voiceParticipants.length > 0 && (
        <span
          className="flex shrink-0 items-center gap-1 rounded-full bg-online/15 px-1.5 py-0.5 font-mono text-[0.65rem] text-online"
          title={`${voiceParticipants.length} in voice`}
        >
          <VoiceIcon />
          {voiceParticipants.length}
        </span>
      )}
    </NavLink>
  );
}
