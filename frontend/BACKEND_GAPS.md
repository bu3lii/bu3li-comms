# Backend gaps

Original gaps from the first pass are resolved. This file now tracks what's left.

## Resolved

- **`GET /conversations`** — now returns each conversation with its member list (id + username) and last message. `useConversations` (`src/hooks/useConversations.ts`) replaced the old `localStorage`-backed `knownConversationsStore`.
- **User lookup/search** — `GET /users?q=` (search) and `GET /users/{id}` (lookup) now exist. `NewConversationDialog` searches real users instead of asking for a raw UUID; `directoryStore` and the old dev-tools UUID entry are gone.
- **Registration didn't establish a session** — `POST /users` now logs the new account in immediately (same session-cookie flow as `POST /login`), backed by a shared `internal/session` package.
- **Presence for a newly-added peer** — connecting now also receives a `presence.snapshot` event listing which of your peers are already online, in addition to the live `user.online`/`user.offline` push. This alone only helped once someone reconnected, though: two users already connected when they became conversation members (the common case — start a new chat, both already logged in) would never learn about each other at all, since nothing re-evaluates presence on membership change. Fixed properly: `POST /conversations/{id}/members` now calls `conversations.MembershipNotifier.NotifyMembershipAdded` (implemented by `realtime.Handler`), which sends the new member a presence snapshot of the conversation's other members and tells those members the new member is online, if they are — both directions, immediately, no reconnect required.

## Remaining, by design

- **Voice call mesh doesn't scale past a handful of people.** Calls are peer-to-peer (each participant opens a direct `RTCPeerConnection` to every other participant) — fine for a direct call or a small voice channel, but bandwidth/CPU cost grows O(n²). A real "voice channel" product would need an SFU (e.g. mediasoup, LiveKit, Janus) mixing/forwarding media server-side. Out of scope here.
- **No TURN server.** ICE uses a public STUN server only (`stun:stun.l.google.com:19302`), which resolves most local/LAN NATs but not symmetric NATs or restrictive corporate networks. Production would need a TURN server (coturn, or a hosted one) in the ICE server list in `src/calls/peerConnection.ts`.
- **Calls aren't persisted.** `internal/realtime/calls.go`'s `CallRegistry` is in-memory only — a server restart drops active calls, and there's no call history/log. Reasonable for a demo; a real product would want at least a `call_sessions` table for history and reconnection support.
- **Voice messages are stored as `bytea` in Postgres**, not object storage. Fine for a demo; a production system would put them in S3/R2/etc. and store a reference instead of streaming bytes through the app server on every playback.
- **No group-conversation membership UI beyond creation.** You can create a group and add members via the dialog, but there's no "manage members" screen after the fact.
