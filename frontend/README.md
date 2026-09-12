# bu3li comms — frontend

A realtime messaging client for the `bu3li-comms` Go backend: React + TypeScript + Vite, Tailwind CSS, TanStack Query for server state, Zustand for realtime/client state, a small typed WebSocket manager, and mesh WebRTC for voice calls and voice channels.

## Setup

From the repo root, `./dev.sh` starts everything (Postgres, Redis, the Go API, and this frontend) in one command — see the root `README.md`. That's the easiest path.

To run just the frontend against an already-running backend:

```bash
cd frontend
npm install
cp .env.example .env   # defaults are fine — see "Dev proxy" below
npm run dev            # http://localhost:5173
```

Open two browsers (or a normal + incognito window) and register two accounts to try realtime messaging, voice messages, and calls between them.

## Dev proxy

The Go backend has no `/api` prefix — its routes live at the root (`/login`, `/conversations`, `/ws`, …). Rather than pointing the frontend at `http://localhost:8080` directly (which would need CORS and cross-origin cookie configuration), `vite.config.ts` proxies the exact backend paths to `localhost:8080` so requests from the browser's point of view are same-origin. This is why `.env.example` ships with `VITE_API_URL` and `VITE_WS_URL` empty by default; set them only if you want to bypass the proxy and talk to a differently-hosted backend.

Two things the proxy has to handle specially, both commented in `vite.config.ts`:

- `GET /login` is the SPA's own client-side route (the login **page**), while `POST /login` is the backend's auth endpoint at the same path. The proxy only forwards `POST`.
- The backend's WebSocket library rejects connections whose `Origin` doesn't match its `Host`. `changeOrigin` only rewrites `Host`, so the proxy also overrides the outgoing `Origin` header for `/ws` to match the backend — real cross-origin protection stays intact in production, where there's no proxy in between.

## Starting a conversation

Open **"+ New conversation"** in the sidebar, search for someone by username, and pick "Direct message" or "Group". Conversation names aren't stored server-side, so a conversation's display name is always derived from its other members' usernames (see `src/lib/conversation.ts`).

## Voice messages

Click the mic icon in the composer (shown whenever the text field is empty) to record; click it again to stop and send, or the × to cancel. Playback is a normal `<audio>` element pointed at `GET /messages/{id}/attachment`.

## Calls

- **Direct conversations** get a phone icon in the header. Starting a call rings the other member with a ring overlay (`src/calls/components/IncomingCallModal.tsx`) they can accept or decline.
- **Group conversations** get a "Voice channel" bar instead — ambient and opt-in, like Discord: anyone can see who's in it and join or leave freely, with no ring.
- Both are the same mesh WebRTC call underneath (`src/calls/callManager.ts`): each participant opens a direct `RTCPeerConnection` to every other participant, negotiated over the existing WebSocket (`call.join`/`call.leave`/`webrtc.offer`/`webrtc.answer`/`webrtc.ice_candidate`). Glare is avoided deterministically — of any two participants, the one with the lexicographically smaller user id sends the offer. See `frontend/BACKEND_GAPS.md` for the mesh's scaling limit and the STUN-only ICE setup.
- The compact call bar (bottom of the screen) can expand to a full-page view (`src/calls/components/FullScreenCallView.tsx`) and back, without interrupting the call — `useCallStore.isExpanded` is purely presentational.
- Every participant's avatar — including your own — glows while their stream is carrying speech (`src/calls/speakingDetector.ts`, Web Audio `AnalyserNode` polled via `requestAnimationFrame`, with a 300ms hold to avoid flicker between words). Reduced-motion users get a static ring instead of the pulse.

## Settings

`/settings` (gear icon next to your name in the sidebar): edit your username/email and change your password (both hit real backend endpoints — `PATCH /me` and `PATCH /me/password`), switch between light/dark/system appearance, and pick a microphone for calls and voice messages.

## Scripts

```bash
npm run dev        # start the dev server
npm run build      # typecheck + production build
npm run lint       # oxlint
npm test           # vitest, once
npm run test:watch # vitest, watch mode
npm run test:e2e   # playwright — needs the backend AND `npm run dev` reachable (playwright starts the dev server itself; point it at a running backend)
```

## Architecture notes

- **API layer** (`src/api/`): thin fetch wrappers, each response validated with Zod (`src/types/`) before it touches the rest of the app. `ApiError`/`NetworkError` carry enough information to distinguish 401/403/409/5xx/offline everywhere they're caught.
- **Realtime** (`src/realtime/`): one `RealtimeSocket` instance for the whole app (`socket.ts`), with typed event parsing (`events.ts`) and bounded exponential-backoff reconnection. `useRealtime` (in `src/hooks/`) is the only place that subscribes to it, mounted once at the authenticated route boundary (`RequireAuth`), and fans events out into TanStack Query's cache and a handful of small Zustand stores.
- **Message cache** (`src/api/messageCache.ts`): pure functions for insert/reconcile/replace/remove, shared by the HTTP send path and the WebSocket event path, and unit-tested directly (no React or network involved).
- **Calls** (`src/calls/`): `callManager.ts` is a module-level singleton (same pattern as `RealtimeSocket`) holding the local media stream and per-participant `RTCPeerConnection`s — not serializable, so it isn't store state. `useCallStore` holds only what the UI needs to render: status, participant ids, remote/local streams, mute state, expanded/collapsed.
- **Theme**: `useThemeStore` (persisted) tracks `system | light | dark`; `useApplyTheme` (mounted once in `App.tsx`) just sets/clears `data-theme` on `<html>` — all the actual light/dark values live in `src/index.css` as CSS custom properties, so switching is instant with no re-render of anything else.
- **State**: server data lives in TanStack Query; `src/stores/` holds only things that don't belong there — connection status, presence, typing, read receipts, toasts, ambient voice-channel participants, call state, theme, and audio input device preference.
- **Optimistic sends**: composing a message immediately inserts a `pending` `ChatMessage` keyed by a client-generated `client_message_id`; the HTTP response and/or the `message.created` WS event reconcile it into a `sent` message by that same id, and a failed send is marked `failed` with a retry that reuses the id (the backend's idempotency key). Voice messages skip optimistic insertion (upload is fast enough) but follow the same reconciliation path on success.

## Known limitations

See `frontend/BACKEND_GAPS.md` for the full list — the two worth knowing up front:

- Voice calls are mesh (every participant connects to every other one directly), so cost grows with the square of participant count. Fine for a direct call or a small voice channel; a real product would need a media server (SFU) for anything bigger.
- ICE uses a public STUN server only, no TURN — most home/LAN networks work, restrictive corporate NATs won't.
