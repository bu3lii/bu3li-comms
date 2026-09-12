import { apiFetch, apiFetchVoid } from "./client";
import { userSchema, type User } from "../types/user";

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export function register(input: RegisterInput): Promise<User> {
  return apiFetch("/users", userSchema, { method: "POST", body: input });
}

export function login(input: LoginInput): Promise<User> {
  return apiFetch("/login", userSchema, { method: "POST", body: input });
}

export function logout(): Promise<void> {
  return apiFetchVoid("/logout", { method: "POST" });
}

export function getMe(): Promise<User> {
  return apiFetch("/me", userSchema);
}

export interface UpdateProfileInput {
  username: string;
  email: string;
}

export function updateProfile(input: UpdateProfileInput): Promise<User> {
  return apiFetch("/me", userSchema, { method: "PATCH", body: input });
}

export interface UpdatePasswordInput {
  current_password: string;
  new_password: string;
}

export function updatePassword(input: UpdatePasswordInput): Promise<void> {
  return apiFetchVoid("/me/password", { method: "PATCH", body: input });
}
