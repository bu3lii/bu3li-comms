import { z } from "zod";

export const conversationTypeSchema = z.enum(["direct", "group"]);

export const conversationSchema = z.object({
  id: z.string(),
  type: conversationTypeSchema,
});

export const memberSchema = z.object({
  id: z.string(),
  username: z.string(),
  has_avatar: z.boolean().default(false),
});

export const lastMessageSchema = z.object({
  id: z.string(),
  sender_id: z.string(),
  content: z.string(),
  has_attachment: z.boolean(),
  attachment_kind: z.enum(["audio", "image", "video"]).optional(),
  created_at: z.string(),
});

export const conversationSummarySchema = z.object({
  id: z.string(),
  type: conversationTypeSchema,
  members: z.array(memberSchema),
  last_message: lastMessageSchema.optional(),
  unread_count: z.number().default(0),
});

export const conversationSummaryListSchema = z.array(conversationSummarySchema);

export type ConversationType = z.infer<typeof conversationTypeSchema>;
export type Conversation = z.infer<typeof conversationSchema>;
export type Member = z.infer<typeof memberSchema>;
export type LastMessage = z.infer<typeof lastMessageSchema>;
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;
