import { apiFetch, apiFetchVoid, request } from "./client";
import {
  serverChannelSchema,
  serverRoleSchema,
  serverSummarySchema,
  serverSummaryListSchema,
  type ChannelType,
  type RoleInput,
  type ServerChannel,
  type ServerRole,
  type ServerSummary,
} from "../types/server";
import { API_URL } from "../lib/env";

export function listServers(): Promise<ServerSummary[]> {
  return apiFetch("/servers", serverSummaryListSchema);
}

export function getServer(serverId: string): Promise<ServerSummary> {
  return apiFetch(`/servers/${serverId}`, serverSummarySchema);
}

export function createServer(name: string): Promise<ServerSummary> {
  return apiFetch("/servers", serverSummarySchema, { method: "POST", body: { name } });
}

export function updateServer(serverId: string, name: string): Promise<ServerSummary> {
  return apiFetch(`/servers/${serverId}`, serverSummarySchema, { method: "PATCH", body: { name } });
}

export function deleteServer(serverId: string): Promise<void> {
  return apiFetchVoid(`/servers/${serverId}`, { method: "DELETE" });
}

export function addServerMember(serverId: string, userId: string): Promise<void> {
  return apiFetchVoid(`/servers/${serverId}/members`, { method: "POST", body: { user_id: userId } });
}

export function removeServerMember(serverId: string, userId: string): Promise<void> {
  return apiFetchVoid(`/servers/${serverId}/members/${userId}`, { method: "DELETE" });
}

export function assignServerRole(serverId: string, userId: string, roleId: string): Promise<void> {
  return apiFetchVoid(`/servers/${serverId}/members/${userId}/role`, { method: "POST", body: { role_id: roleId } });
}

export function createChannel(serverId: string, name: string, type: ChannelType): Promise<ServerChannel> {
  return apiFetch(`/servers/${serverId}/channels`, serverChannelSchema, {
    method: "POST",
    body: { name, type },
  });
}

export function deleteChannel(serverId: string, channelId: string): Promise<void> {
  return apiFetchVoid(`/servers/${serverId}/channels/${channelId}`, { method: "DELETE" });
}

export function reorderChannels(serverId: string, channelIds: string[]): Promise<void> {
  return apiFetchVoid(`/servers/${serverId}/channels/reorder`, { method: "PATCH", body: { channel_ids: channelIds } });
}

export function createRole(serverId: string, input: RoleInput): Promise<ServerRole> {
  return apiFetch(`/servers/${serverId}/roles`, serverRoleSchema, { method: "POST", body: input });
}

export function updateRole(serverId: string, roleId: string, input: RoleInput): Promise<ServerRole> {
  return apiFetch(`/servers/${serverId}/roles/${roleId}`, serverRoleSchema, { method: "PATCH", body: input });
}

export function deleteRole(serverId: string, roleId: string): Promise<void> {
  return apiFetchVoid(`/servers/${serverId}/roles/${roleId}`, { method: "DELETE" });
}

async function uploadServerImage(path: string, blob: Blob): Promise<void> {
  await request(path, { method: "POST", headers: { "Content-Type": blob.type || "image/png" }, body: blob });
}

export function uploadServerIcon(serverId: string, blob: Blob): Promise<void> {
  return uploadServerImage(`/servers/${serverId}/icon`, blob);
}

export function deleteServerIcon(serverId: string): Promise<void> {
  return apiFetchVoid(`/servers/${serverId}/icon`, { method: "DELETE" });
}

export function uploadServerBanner(serverId: string, blob: Blob): Promise<void> {
  return uploadServerImage(`/servers/${serverId}/banner`, blob);
}

export function deleteServerBanner(serverId: string): Promise<void> {
  return apiFetchVoid(`/servers/${serverId}/banner`, { method: "DELETE" });
}

/** Same-origin URLs an <img> element can use directly — the browser sends the session cookie automatically. */
export function serverIconUrl(serverId: string): string {
  return `${API_URL}/servers/${serverId}/icon`;
}

export function serverBannerUrl(serverId: string): string {
  return `${API_URL}/servers/${serverId}/banner`;
}
