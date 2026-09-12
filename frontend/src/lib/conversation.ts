import type { ConversationSummary, Member } from "../types/conversation";

/** The backend stores no conversation title, so the display name is always derived from membership. */
export function conversationDisplayName(conversation: ConversationSummary, currentUserId: string): string {
  const others = otherMembers(conversation, currentUserId);
  if (others.length === 0) return "Just you";
  return others.map((m) => m.username).join(", ");
}

export function otherMembers(conversation: ConversationSummary, currentUserId: string): Member[] {
  return conversation.members.filter((m) => m.id !== currentUserId);
}

/** For a direct conversation, the other member's id — used for presence and 1:1 calling. */
export function directPeerId(conversation: ConversationSummary, currentUserId: string): string | undefined {
  if (conversation.type !== "direct") return undefined;
  return otherMembers(conversation, currentUserId)[0]?.id;
}
