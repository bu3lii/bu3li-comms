import { NavLink } from "react-router-dom";
import { Avatar } from "../ui/Avatar";
import { useIsOnline } from "../../stores/presenceStore";
import { useVoiceChannelParticipants } from "../../stores/voiceChannelStore";
import { useMe } from "../../hooks/useMe";
import { conversationDisplayName, directPeer } from "../../lib/conversation";
import { VoiceIcon } from "../../calls/components/icons";
import type { ConversationSummary } from "../../types/conversation";

/** Whether an unread conversation's last message @mentions the given username, for the mention-styled badge. */
function mentionsUser(content: string, username: string): boolean {
  const pattern = new RegExp(`@${username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  return pattern.test(content);
}

function LastMessagePreview({ conversation, currentUserId }: { conversation: ConversationSummary; currentUserId: string }) {
  const last = conversation.last_message;
  if (!last) {
    return <span className="block truncate text-xs text-text-tertiary">No messages yet</span>;
  }

  const prefix = last.sender_id === currentUserId ? "You: " : "";

  if (last.has_attachment) {
    const label = last.attachment_kind === "image" ? "Photo" : last.attachment_kind === "video" ? "Video" : "Voice message";
    const icon =
      last.attachment_kind === "image" ? <ImageIcon /> : last.attachment_kind === "video" ? <VideoIcon /> : <VoiceIcon />;
    return (
      <span className="flex items-center gap-1 truncate text-xs text-text-tertiary">
        {prefix}
        {icon}
        {label}
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
  const peer = directPeer(conversation, currentUserId);
  const peerId = peer?.id;
  const isOnline = useIsOnline(peerId);
  const voiceParticipants = useVoiceChannelParticipants(conversation.id);
  const name = conversationDisplayName(conversation, currentUserId);
  const isUnread = conversation.unread_count > 0;
  const { data: me } = useMe();
  const isMentioned =
    isUnread &&
    !!me &&
    !!conversation.last_message &&
    conversation.last_message.sender_id !== currentUserId &&
    mentionsUser(conversation.last_message.content, me.username);

  return (
    <NavLink
      to={`/chat/${conversation.id}`}
      className={({ isActive }) =>
        `smooth-swap flex items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-sm transition-colors ${
          isActive ? "bg-surface-raised text-text-primary" : "text-text-secondary hover:bg-surface-raised/60"
        }`
      }
    >
      <span className="relative shrink-0">
        <Avatar seed={conversation.id} name={name} size="sm" userId={peer?.id} hasAvatar={peer?.has_avatar} />
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
          <span className={`truncate ${isUnread ? "font-semibold text-text-primary" : "font-medium"}`}>{name}</span>
          {conversation.type === "group" && (
            <span className="font-mono text-[0.65rem] uppercase text-text-tertiary">group</span>
          )}
        </span>
        <LastMessagePreview conversation={conversation} currentUserId={currentUserId} />
      </span>
      {isUnread && (
        <span
          className={`flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 font-mono text-[0.65rem] font-semibold ${
            isMentioned ? "bg-danger text-white" : "bg-accent text-accent-text"
          }`}
          aria-label={isMentioned ? `${conversation.unread_count} unread, mentioned` : `${conversation.unread_count} unread`}
        >
          {isMentioned ? "@" : conversation.unread_count > 99 ? "99+" : conversation.unread_count}
        </span>
      )}
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

function ImageIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="5.5" cy="6" r="1.2" stroke="currentColor" strokeWidth="1.1" />
      <path d="M2 11.5 6 8l2.5 2 2-1.8L14 11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="3.5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M10.5 6.5 14.5 4v8l-4-2.5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}
