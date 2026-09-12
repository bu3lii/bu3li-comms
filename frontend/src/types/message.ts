import { z } from "zod";

export const attachmentKindSchema = z.enum(["audio", "image", "video"]);

export const reactionSummarySchema = z.object({
  emoji: z.string(),
  user_ids: z.array(z.string()),
});

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
  attachment_kind: attachmentKindSchema.optional(),
  attachment_duration_ms: z.number().default(0),
  attachment_width_px: z.number().default(0),
  attachment_height_px: z.number().default(0),
  reactions: z.array(reactionSummarySchema).default([]),
});

export type AttachmentKind = z.infer<typeof attachmentKindSchema>;
export type ReactionSummary = z.infer<typeof reactionSummarySchema>;

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
