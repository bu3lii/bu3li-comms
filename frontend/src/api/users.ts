import { z } from "zod";
import { apiFetch } from "./client";
import { userSchema, type User } from "../types/user";

const userListSchema = z.array(userSchema);

export function searchUsers(query: string): Promise<User[]> {
  const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
  return apiFetch(`/users${params}`, userListSchema);
}

export function getUser(userId: string): Promise<User> {
  return apiFetch(`/users/${userId}`, userSchema);
}
