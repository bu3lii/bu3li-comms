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

export interface SendMediaMessageInput {
  client_message_id: string;
  blob: Blob;
  durationMs?: number;
  widthPx?: number;
  heightPx?: number;
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

/** Same-origin URL an <audio>/<img>/<video> element can use directly — the browser sends the session cookie automatically. */
export function attachmentUrl(messageId: string): string {
  return `${API_URL}/messages/${messageId}/attachment`;
}

export function sendMediaMessage(conversationId: string, input: SendMediaMessageInput): Promise<Message> {
  const params = new URLSearchParams({ client_message_id: input.client_message_id });
  if (input.durationMs) params.set("duration_ms", String(Math.round(input.durationMs)));
  if (input.widthPx) params.set("width_px", String(Math.round(input.widthPx)));
  if (input.heightPx) params.set("height_px", String(Math.round(input.heightPx)));

  const mimeType = input.blob.type || "application/octet-stream";

  return apiUpload(
    `/conversations/${conversationId}/messages/media?${params.toString()}`,
    messageSchema,
    input.blob,
    mimeType,
  );
}

export function addReaction(messageId: string, emoji: string): Promise<void> {
  return apiFetchVoid(`/messages/${messageId}/reactions`, { method: "POST", body: { emoji } });
}

export function removeReaction(messageId: string, emoji: string): Promise<void> {
  return apiFetchVoid(`/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, { method: "DELETE" });
}
