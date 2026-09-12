import { z } from "zod";

export const channelTypeSchema = z.enum(["text", "voice"]);

export const serverChannelSchema = z.object({
  id: z.string(),
  server_id: z.string(),
  conversation_id: z.string(),
  name: z.string(),
  type: channelTypeSchema,
  position: z.number(),
});

export const serverRoleSchema = z.object({
  id: z.string(),
  server_id: z.string(),
  name: z.string(),
  color: z.string(),
  is_default: z.boolean(),
  position: z.number(),
  is_admin: z.boolean(),
  can_manage_server: z.boolean(),
  can_manage_roles: z.boolean(),
  can_manage_channels: z.boolean(),
  can_kick_members: z.boolean(),
});

export const serverPermissionsSchema = z.object({
  is_owner: z.boolean(),
  is_admin: z.boolean(),
  manage_server: z.boolean(),
  manage_roles: z.boolean(),
  manage_channels: z.boolean(),
  kick_members: z.boolean(),
});

export const serverMemberSchema = z.object({
  user_id: z.string(),
  username: z.string(),
  has_avatar: z.boolean().default(false),
  is_owner: z.boolean(),
  role_id: z.string().optional(),
  role_name: z.string(),
  role_color: z.string(),
  joined_at: z.string(),
  user_created_at: z.string(),
});

export const serverSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  owner_id: z.string(),
  has_icon: z.boolean().default(false),
  has_banner: z.boolean().default(false),
  permissions: serverPermissionsSchema,
  channels: z.array(serverChannelSchema).default([]),
  members: z.array(serverMemberSchema).default([]),
  roles: z.array(serverRoleSchema).default([]),
});

export const serverSummaryListSchema = z.array(serverSummarySchema);

export type ChannelType = z.infer<typeof channelTypeSchema>;
export type ServerChannel = z.infer<typeof serverChannelSchema>;
export type ServerRole = z.infer<typeof serverRoleSchema>;
export type ServerPermissions = z.infer<typeof serverPermissionsSchema>;
export type ServerMember = z.infer<typeof serverMemberSchema>;
export type ServerSummary = z.infer<typeof serverSummarySchema>;

/** The fields a caller may set when creating or editing a role. */
export interface RoleInput {
  name: string;
  color: string;
  is_admin: boolean;
  can_manage_server: boolean;
  can_manage_roles: boolean;
  can_manage_channels: boolean;
  can_kick_members: boolean;
}
