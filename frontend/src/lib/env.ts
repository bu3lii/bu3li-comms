/**
 * API_URL is empty by default so requests go through Vite's dev proxy
 * (see vite.config.ts) and land same-origin — no CORS, cookies just work.
 * Set VITE_API_URL to an absolute origin to bypass the proxy; the backend
 * would then need CORS + credentialed-cookie config for that origin.
 */
export const API_URL: string = import.meta.env.VITE_API_URL ?? "";

export function resolveWsUrl(): string {
  const configured = import.meta.env.VITE_WS_URL;
  if (configured) {
    return configured;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}
