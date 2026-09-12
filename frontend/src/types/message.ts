import { z } from "zod";

export const messageSchema = z.object({
  id: z.string(),
  conversation_id: z.string(),
  sender_id: z.string(),
  client_message_id: z.string(),
  content: z.string(),
  version: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  has_attachment: z.boolean().default(false),
  attachment_duration_ms: z.number().default(0),
});

export type Message = z.infer<typeof messageSchema>;

export const messageListSchema = z.array(messageSchema);

/** Local send lifecycle layered on top of a server message for optimistic UI. */
export type MessageStatus = "sent" | "pending" | "failed";

export interface ChatMessage extends Message {
  status: MessageStatus;
}

export function toSentMessage(message: Message): ChatMessage {
  return { ...message, status: "sent" };
}
