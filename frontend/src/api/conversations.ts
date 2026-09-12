import { apiFetch, apiFetchVoid } from "./client";
import {
  conversationSchema,
  conversationSummaryListSchema,
  type Conversation,
  type ConversationSummary,
  type ConversationType,
} from "../types/conversation";

export function listConversations(): Promise<ConversationSummary[]> {
  return apiFetch("/conversations", conversationSummaryListSchema);
}

export function createConversation(type: ConversationType): Promise<Conversation> {
  return apiFetch("/conversations", conversationSchema, { method: "POST", body: { type } });
}

export function addConversationMember(conversationId: string, userId: string): Promise<void> {
  return apiFetchVoid(`/conversations/${conversationId}/members`, {
    method: "POST",
    body: { user_id: userId },
  });
}
