# Roadmap

Ideas for where `bu3li-comms` could go next, roughly ordered by how naturally they build on what's already here. Nothing in this file is scheduled or committed — it's a menu, not a plan. See `frontend/BACKEND_GAPS.md` for the detailed, up-to-date list of what's built vs. known gaps in it.

**Baseline today:** text/voice/picture/video messages, message reactions, @mentions and markdown-lite formatting, direct/group conversations *and* Discord-style servers (multiple text/voice channels, localized per-server roles and permissions, icons/banners, an online/offline member list, reorderable channels) with real user search, presence, typing indicators, read receipts, unread badges, profile pictures, mesh WebRTC (1:1 calls + ambient group/server voice channels, deafen, optional local TURN), rate limiting, a "smooth mode" animation toggle, PWA installability, a settings page (profile, password, theme, motion, mic), one-command local dev.

## Shipped since this file was first written

Everything below was on this menu and has since been built — kept here briefly so it's clear what moved, not silently dropped. Full detail (including known simplifications) lives in `frontend/BACKEND_GAPS.md`.

- Picture and video attachments, with client-side resize and a lightbox/inline player.
- Profile pictures, with the generated-initials `Avatar` fallback.
- Unread badges / per-conversation last-read tracking, plus an `@`-styled badge for mentions.
- A local TURN server (opt-in via a Compose profile) and env-configurable ICE servers.
- Message reactions (a fixed emoji palette, realtime).
- @mentions + highlighting, and markdown-lite formatting (bold/italic/code/links).
- **Servers, not just groups** — including the roles/permissions half of that item, as a localized (per-server) RBAC system with a blanket admin toggle, not just a binary owner/member split.
- Deafen, distinct from mute.
- Rate limiting on login, registration, and message/attachment sends.
- PWA installability (manifest + service worker).
- Server icons and banners, an online/offline member list with clickable profiles (role, join dates), a server settings page, and reorderable channels — none of these were explicitly on the original menu, but fell directly out of building servers.
- A "smooth mode" setting animating modals, page/conversation/server swaps, and list items — also not originally listed.

## Near-term — builds directly on what exists

Nothing left here for now — this section emptied out as the items above shipped. Worth revisiting once the bigger structural/infrastructure items below get picked up.

## Bigger structural features

- **Room-based (SFU) voice instead of P2P mesh.** The current mesh (`internal/realtime/calls.go` + `src/calls/callManager.ts`) opens a direct `RTCPeerConnection` between every pair of participants — cost grows O(n²), so it's fine for a direct call or a handful of people in a voice channel and falls over past that. This matters more now that server voice channels exist too. A real "voice channel" wants a media server (LiveKit, mediasoup, or Janus) that each client connects to *once*; the server forwards/mixes streams. This also unlocks: recording, server-side noise suppression, adaptive bitrate per listener, and not needing every client to upload N-1 copies of its own audio.
- **Video calls + screen share.** Extend the existing signaling (`webrtc.offer`/`answer`/`ice_candidate` already carry arbitrary SDP) to negotiate a video track alongside audio, plus a "share this tab/screen" `getDisplayMedia()` track. The full-screen call view (`FullScreenCallView.tsx`) already has the layout bones for a video grid instead of avatar tiles.
- **End-to-end encryption for direct messages.** A genuinely hard, genuinely cool feature — Signal-protocol-style double ratchet, keys generated client-side, server stores only ciphertext. Worth calling out that this is a different trust model than everything else here (the server currently can read message content by design, e.g. for search).
- **Role hierarchy for server RBAC.** The current permission system (`internal/servers`) has no notion of rank — anyone with `manage_roles` (or admin) can grant any permission, including admin, to any role, including their own. A real hierarchy (a role can only manage roles/members below its own rank, mirroring Discord) closes that privilege-escalation gap.

## Moonshots — genuinely ambitious

The rest of this file is stuff that clearly extends the current architecture. This section isn't that — it's the "if this app really took off, what would make people's jaws drop" list.

- **Live call captions + transcription.** Real-time speech-to-text overlaid in `FullScreenCallView` while a call is happening, plus a searchable transcript saved afterward. Whisper (or a hosted STT API) on each participant's outbound audio track; captions relayed as just another realtime event type, the same channel `webrtc.*` already uses.
- **Real-time call translation.** The natural next step past captions: transcribe, machine-translate, and either subtitle or synthesize speech back in the listener's language, per-listener. Two people who don't share a language having an actual voice conversation is the single coolest thing this app could do.
- **Spatial voice channels.** A 2D space (Gather.town-style) where your avatar's position determines who you can hear and how loud — walk up to a cluster of people and you're in their conversation, walk away and you're not. Web Audio's `PannerNode` already does positional audio; the hard part is the shared 2D presence layer, not the audio.
- **Watch parties.** Pick a video/audio source and play it in sync for everyone in a voice channel, with drift correction and chat alongside — the call infrastructure already exists, this is a synchronized-playback layer on top.
- **Live collaborative whiteboard.** A shared canvas per channel or call — cursors, shapes, sketches, screen annotations — using the same WebSocket connection every other realtime feature already rides on.
- **Bot platform + slash commands.** A public API and webhook/event subscription system so third parties can build bots that join servers, react to messages, and post back. This is arguably *the* feature that made Discord's ecosystem — servers now exist, so this is buildable on top of the same `server_roles` permission model.
- **Stages: one-to-many live audio.** A broadcast mode built on the SFU room work (speakers vs. silent listeners, raise-hand-to-speak) for AMAs, talks, or announcements to an entire server at once.
- **In-call voice effects + soundboard.** Pitch-shift/robot-voice filters and a shared soundboard that injects a sound into your outgoing track mid-call — pure Web Audio processing on the local stream before it hits the `RTCPeerConnection`.
- **Semantic search across your whole message history.** Vector embeddings instead of substring match — "find that message about the deploy issue" actually works even if you don't remember the words used.
- **End-to-end encrypted group calls.** The DM encryption idea above is hard enough for two parties; encrypting a mesh or SFU call so even the media server can't see plaintext audio (WebRTC's Insertable Streams API) is a step further and would be a genuinely rare feature for an app this size to have.
- **Federation.** ActivityPub- or Matrix-style interop so independently-hosted `bu3li-comms` instances can talk to each other — DM someone on a different server the way email works across providers, rather than everyone needing an account on the same instance.
- **AI catch-up summaries.** "Here's what happened in this channel since you were last here" — a generated digest of a busy conversation, not a transcript dump.

## Polish and delight

- **Picture-in-picture call window.** Browser PiP API for the compact call bar so a call survives switching tabs/apps — a natural extension of the expand/collapse full-screen work already done.
- **Voice message waveform.** Replace the plain scrubber in `VoiceMessagePlayer` with an actual waveform (computed once at record time via the same `AnalyserNode` machinery `speakingDetector.ts` already uses, stored as a small array alongside the attachment).
- **"Recording…" indicator for peers**, the same way typing indicators work today, so the other side sees you're composing a voice note before it arrives.
- **Join/leave call sound effects**, gated behind a settings toggle.
- **Custom emoji per server.** Servers exist now, so this is just an upload path (mirroring the icon/banner/avatar attachment pattern) plus letting the reaction picker and message composer reference `server_id`-scoped emoji instead of only the fixed six-emoji palette.
- **Stacked read-receipt avatars** (iMessage-style) instead of a plain "read" label, once group conversations have more than 2 people worth showing.
- **Animate the mobile sidebar↔conversation pane switch.** "Smooth mode" covers modals, page swaps, and list items, but the narrow-viewport pane toggle in `AppShell` still snaps instantly between `hidden`/`flex` — would need the same discrete-property-transition trick already used for `<dialog>` in `index.css`.

## Infrastructure / operability

- **Object storage for attachments.** Voice/picture/video messages, avatars, and server icons/banners are all `bytea` in Postgres today — fine for a demo, not for real volume. Move to S3/R2/etc. with presigned URLs; store a reference instead of streaming bytes through the app server on every playback.
- **Horizontal scaling for the realtime Hub.** `internal/realtime/hub.go` keeps WebSocket connections in an in-memory map — fine for one API instance, not for several behind a load balancer. Needs a pub/sub layer (Redis pub/sub, since Redis is already a dependency) so `SendToUser` can reach a connection held by a *different* instance.
- **Moderation tooling.** Kicking a server member now exists (gated behind the `kick_members` permission), but there's still no blocking a user, reporting a message, or actually *banning* someone (as opposed to kicking — a kicked user can just be re-invited by any member).
- **Go test suite.** The backend has no unit/integration tests yet (`tests/suite.sh` aside) — worth adding before the schema grows much further, especially around the optimistic-concurrency, call-registry, and server-permission logic.
- **Observability.** Structured logging, basic metrics (active connections, calls in progress, message throughput) — useful once this runs anywhere other than a laptop.

## Cross-platform

- **Native mobile app.** The API layer (`src/api/`) and realtime event schemas are already framework-agnostic; a React Native client could reuse the contract even if not the components.
