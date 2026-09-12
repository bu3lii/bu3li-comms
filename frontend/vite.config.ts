/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The Go backend exposes routes at its root (no `/api` prefix), so the dev
// proxy forwards the exact path list rather than assuming a shared prefix.
const BACKEND_ORIGIN = "http://localhost:8080";
const PROXIED_PATHS = [
  "/users",
  "/login",
  "/logout",
  "/me",
  "/conversations",
  "/messages",
  "/servers",
  "/ws",
];

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Fail loudly if 5173 is taken instead of silently moving to 5174 — a
    // wrapper script printing "frontend: http://localhost:5173" should be
    // able to trust that.
    strictPort: true,
    proxy: Object.fromEntries(
      PROXIED_PATHS.map((path) => [
        path,
        {
          target: BACKEND_ORIGIN,
          changeOrigin: true,
          ws: path === "/ws",
          // The backend's websocket library rejects connections whose Origin
          // header doesn't match its Host — true cross-origin protection,
          // but `changeOrigin` only rewrites Host, not Origin. Overriding
          // Origin here keeps that check meaningful in production while
          // making the dev proxy look same-origin to the backend.
          headers: path === "/ws" ? { origin: BACKEND_ORIGIN } : undefined,
          // `/login` is both the backend's POST endpoint and the SPA's own
          // client-side route (GET, for the page itself) — only hand POST
          // requests to the backend; let Vite serve the app shell otherwise.
          bypass: (req) => (path === "/login" && req.method !== "POST" ? req.url : undefined),
        },
      ]),
    ),
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: true,
    exclude: ["node_modules/**", "e2e/**"],
  },
});
