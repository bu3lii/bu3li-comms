import { z } from "zod";

export const userSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string(),
  has_avatar: z.boolean().default(false),
});

export type User = z.infer<typeof userSchema>;
