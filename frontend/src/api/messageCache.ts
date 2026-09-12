import type { ChatMessage, Message } from "../types/message";

function sortByCreatedAt(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/**
 * Applies a `message.created` event (or the HTTP send response): drops the
 * matching optimistic placeholder by `client_message_id`, then inserts or
 * replaces the authoritative server message by `id`.
 */
export function insertOrReconcileMessage(messages: ChatMessage[], incoming: Message): ChatMessage[] {
  const withoutOptimistic = messages.filter(
    (m) => !(m.status === "pending" && m.client_message_id === incoming.client_message_id),
  );

  const confirmed: ChatMessage = { ...incoming, status: "sent" };
  const existingIndex = withoutOptimistic.findIndex((m) => m.id === incoming.id);

  const next =
    existingIndex >= 0
      ? withoutOptimistic.map((m, i) => (i === existingIndex ? confirmed : m))
      : [...withoutOptimistic, confirmed];

  return sortByCreatedAt(next);
}

/**
 * Applies a `message.updated` event. Never accepts an incoming version
 * older than what's cached, so an out-of-order delivery can't regress state.
 */
export function replaceIfNewer(messages: ChatMessage[], incoming: Message): ChatMessage[] {
  return messages.map((m) => {
    if (m.id !== incoming.id || incoming.version < m.version) {
      return m;
    }
    return { ...incoming, status: "sent" };
  });
}

/** Applies a `message.deleted` event. */
export function removeById(messages: ChatMessage[], messageId: string): ChatMessage[] {
  return messages.filter((m) => m.id !== messageId);
}

/** Marks a pending optimistic message as failed after its send request errors. */
export function markFailed(messages: ChatMessage[], clientMessageId: string): ChatMessage[] {
  return messages.map((m) =>
    m.status === "pending" && m.client_message_id === clientMessageId ? { ...m, status: "failed" } : m,
  );
}

/** Marks a failed message as pending again for a retry attempt. */
export function markRetrying(messages: ChatMessage[], clientMessageId: string): ChatMessage[] {
  return messages.map((m) =>
    m.client_message_id === clientMessageId ? { ...m, status: "pending" } : m,
  );
}

/** Applies a `message.reaction_added` event, or an optimistic local add. */
export function addReactionLocal(messages: ChatMessage[], messageId: string, userId: string, emoji: string): ChatMessage[] {
  return messages.map((m) => {
    if (m.id !== messageId) return m;

    const reactions = m.reactions.map((r) => ({ ...r, user_ids: [...r.user_ids] }));
    const existing = reactions.find((r) => r.emoji === emoji);
    if (existing) {
      if (!existing.user_ids.includes(userId)) existing.user_ids.push(userId);
    } else {
      reactions.push({ emoji, user_ids: [userId] });
    }
    return { ...m, reactions };
  });
}

/** Applies a `message.reaction_removed` event, or an optimistic local remove. */
export function removeReactionLocal(messages: ChatMessage[], messageId: string, userId: string, emoji: string): ChatMessage[] {
  return messages.map((m) => {
    if (m.id !== messageId) return m;

    const reactions = m.reactions
      .map((r) => (r.emoji === emoji ? { ...r, user_ids: r.user_ids.filter((id) => id !== userId) } : r))
      .filter((r) => r.user_ids.length > 0);
    return { ...m, reactions };
  });
}
