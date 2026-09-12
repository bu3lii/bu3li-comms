import { apiFetch, apiFetchVoid, apiUpload } from "./client";
import { messageSchema, messageListSchema, type Message } from "../types/message";
import { API_URL } from "../lib/env";

export interface SendMessageInput {
  client_message_id: string;
  content: string;
}

export interface SendVoiceMessageInput {
  client_message_id: string;
  durationMs: number;
  blob: Blob;
}

export interface EditMessageInput {
  content: string;
  version: number;
}

export async function listMessages(conversationId: string): Promise<Message[]> {
  const messages = await apiFetch(`/conversations/${conversationId}/messages`, messageListSchema);
  // The backend returns newest-first; the UI renders oldest-at-top chronology.
  return [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function sendMessage(conversationId: string, input: SendMessageInput): Promise<Message> {
  return apiFetch(`/conversations/${conversationId}/messages`, messageSchema, {
    method: "POST",
    body: input,
  });
}

export function editMessage(messageId: string, input: EditMessageInput): Promise<Message> {
  return apiFetch(`/messages/${messageId}`, messageSchema, { method: "PATCH", body: input });
}

export function deleteMessage(messageId: string): Promise<void> {
  return apiFetchVoid(`/messages/${messageId}`, { method: "DELETE" });
}

export function sendVoiceMessage(conversationId: string, input: SendVoiceMessageInput): Promise<Message> {
  const params = new URLSearchParams({
    client_message_id: input.client_message_id,
    duration_ms: String(Math.round(input.durationMs)),
  });
  const mimeType = input.blob.type || "audio/webm";

  return apiUpload(
    `/conversations/${conversationId}/messages/voice?${params.toString()}`,
    messageSchema,
    input.blob,
    mimeType,
  );
}

/** Same-origin URL an <audio> element can use directly — the browser sends the session cookie automatically. */
export function attachmentUrl(messageId: string): string {
  return `${API_URL}/messages/${messageId}/attachment`;
}
