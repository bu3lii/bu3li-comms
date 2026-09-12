import { z } from "zod";

export const conversationTypeSchema = z.enum(["direct", "group"]);

export const conversationSchema = z.object({
  id: z.string(),
  type: conversationTypeSchema,
});

export const memberSchema = z.object({
  id: z.string(),
  username: z.string(),
});

export const lastMessageSchema = z.object({
  id: z.string(),
  sender_id: z.string(),
  content: z.string(),
  has_attachment: z.boolean(),
  created_at: z.string(),
});

export const conversationSummarySchema = z.object({
  id: z.string(),
  type: conversationTypeSchema,
  members: z.array(memberSchema),
  last_message: lastMessageSchema.optional(),
});

export const conversationSummaryListSchema = z.array(conversationSummarySchema);

export type ConversationType = z.infer<typeof conversationTypeSchema>;
export type Conversation = z.infer<typeof conversationSchema>;
export type Member = z.infer<typeof memberSchema>;
export type LastMessage = z.infer<typeof lastMessageSchema>;
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;
