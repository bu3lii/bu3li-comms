import type { ZodType } from "zod";
import { API_URL } from "../lib/env";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }

  get isServerError(): boolean {
    return this.status >= 500;
  }
}

export class NetworkError extends Error {
  constructor() {
    super("Could not reach the server. Check your connection.");
    this.name = "NetworkError";
  }
}

export async function request(path: string, init: RequestInit): Promise<Response> {
  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, { ...init, credentials: "include" });
  } catch {
    throw new NetworkError();
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new ApiError(response.status, text || response.statusText);
  }

  return response;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
}

function jsonInit({ method = "GET", body }: RequestOptions): RequestInit {
  return {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
}

/** For endpoints that return a JSON body, validated against `schema`. */
export async function apiFetch<T>(path: string, schema: ZodType<T>, options: RequestOptions = {}): Promise<T> {
  const response = await request(path, jsonInit(options));
  const json = await response.json();
  return schema.parse(json);
}

/** For endpoints that reply 204 No Content. */
export async function apiFetchVoid(path: string, options: RequestOptions = {}): Promise<void> {
  await request(path, jsonInit(options));
}

/** For uploading a raw binary body (e.g. a recorded audio blob), not JSON. */
export async function apiUpload<T>(path: string, schema: ZodType<T>, body: Blob, contentType: string): Promise<T> {
  const response = await request(path, { method: "POST", headers: { "Content-Type": contentType }, body });
  const json = await response.json();
  return schema.parse(json);
}
