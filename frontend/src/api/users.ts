import { z } from "zod";
import { apiFetch, apiFetchVoid, request } from "./client";
import { userSchema, type User } from "../types/user";
import { API_URL } from "../lib/env";

const userListSchema = z.array(userSchema);

export function searchUsers(query: string): Promise<User[]> {
  const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
  return apiFetch(`/users${params}`, userListSchema);
}

export function getUser(userId: string): Promise<User> {
  return apiFetch(`/users/${userId}`, userSchema);
}

/** Same-origin URL an <img> element can use directly — the browser sends the session cookie automatically. */
export function avatarUrl(userId: string): string {
  return `${API_URL}/users/${userId}/avatar`;
}

export async function uploadAvatar(blob: Blob): Promise<void> {
  await request("/me/avatar", {
    method: "POST",
    headers: { "Content-Type": blob.type || "image/png" },
    body: blob,
  });
}

export function deleteAvatar(): Promise<void> {
  return apiFetchVoid("/me/avatar", { method: "DELETE" });
}
