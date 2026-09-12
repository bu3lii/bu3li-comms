# Roadmap

Ideas for where `bu3li-comms` could go next, roughly ordered by how naturally they build on what's already here. Nothing in this file is scheduled or committed — it's a menu, not a plan. See `frontend/BACKEND_GAPS.md` for known gaps/limitations in what's *already* built, as distinct from what's proposed here.

**Baseline today:** text + voice messages, direct/group conversations with real user search, presence, typing indicators, read receipts, mesh WebRTC (1:1 calls + ambient group voice channels), a settings page (profile, password, theme, mic), one-command local dev.

## Near-term — builds directly on what exists

- **Picture attachments.** Not implemented yet — only voice messages have an attachment path today. The plumbing already exists (`message_attachments` table, upload/download endpoints, MIME allowlist) and generalizes cleanly: allow `image/png|jpeg|webp|gif` alongside the audio types, add a thumbnail/lightbox in the message bubble. Client-side resize before upload (canvas) keeps payloads sane.
- **Video attachments / short clips.** Same attachment path again, `video/webm|mp4`, capped duration. A natural sibling to voice messages, not a new subsystem.
- **Profile pictures.** Same upload path a third time (`avatar` as its own attachment type, or a dedicated `user_avatars` table), with the generated-initials `Avatar` component as the fallback when a user has no picture — that fallback is exactly why it was built as its own component instead of inline markup.
- **Unread badges / per-conversation last-read tracking.** Documented as absent in `BACKEND_GAPS.md`. The `message_receipts` table already tracks per-message read state; a conversation summary could expose "your last read message" vs. "the actual last message" and the frontend renders a count.
- **TURN server.** Calls only work over STUN today (`src/calls/peerConnection.ts`), which fails on symmetric NATs and locked-down corporate networks. Dropping a coturn instance into the ICE server list closes this for anyone it currently fails for.
- **Message reactions.** An emoji react on a message is a small table (`message_id, user_id, emoji`) and a realtime event, reusing the exact broadcast pattern `message.created`/`message.updated` already use.
- **@mentions + highlighting.** Parse `@username` on send, store resolved user ids alongside the message, highlight in the bubble, badge the conversation.
- **Markdown-lite formatting.** Bold/italic/code/links in message content — a rendering concern only, no schema change.

## Bigger structural features

- **Servers, not just groups.** A Discord-style container above conversations: a "server" owns multiple named channels (text + voice), has its own membership separate from any one channel's, and needs roles/permissions (who can create channels, moderate, invite). This is the single biggest schema and UI change on this list — conversations stop being the top-level unit.
- **Room-based (SFU) voice instead of P2P mesh.** The current mesh (`internal/realtime/calls.go` + `src/calls/callManager.ts`) opens a direct `RTCPeerConnection` between every pair of participants — cost grows O(n²), so it's fine for a direct call or a handful of people in a voice channel and falls over past that. A real "server voice channel" wants a media server (LiveKit, mediasoup, or Janus) that each client connects to *once*; the server forwards/mixes streams. This also unlocks: recording, server-side noise suppression, adaptive bitrate per listener, and not needing every client to upload N-1 copies of its own audio.
- **Video calls + screen share.** Extend the existing signaling (`webrtc.offer`/`answer`/`ice_candidate` already carry arbitrary SDP) to negotiate a video track alongside audio, plus a "share this tab/screen" `getDisplayMedia()` track. The full-screen call view (`FullScreenCallView.tsx`) already has the layout bones for a video grid instead of avatar tiles.
- **End-to-end encryption for direct messages.** A genuinely hard, genuinely cool feature — Signal-protocol-style double ratchet, keys generated client-side, server stores only ciphertext. Worth calling out that this is a different trust model than everything else here (the server currently can read message content by design, e.g. for search).

## Moonshots — genuinely ambitious

The rest of this file is stuff that clearly extends the current architecture. This section isn't that — it's the "if this app really took off, what would make people's jaws drop" list.

- **Live call captions + transcription.** Real-time speech-to-text overlaid in `FullScreenCallView` while a call is happening, plus a searchable transcript saved afterward. Whisper (or a hosted STT API) on each participant's outbound audio track; captions relayed as just another realtime event type, the same channel `webrtc.*` already uses.
- **Real-time call translation.** The natural next step past captions: transcribe, machine-translate, and either subtitle or synthesize speech back in the listener's language, per-listener. Two people who don't share a language having an actual voice conversation is the single coolest thing this app could do.
- **Spatial voice channels.** A 2D space (Gather.town-style) where your avatar's position determines who you can hear and how loud — walk up to a cluster of people and you're in their conversation, walk away and you're not. Web Audio's `PannerNode` already does positional audio; the hard part is the shared 2D presence layer, not the audio.
- **Watch parties.** Pick a video/audio source and play it in sync for everyone in a voice channel, with drift correction and chat alongside — the call infrastructure already exists, this is a synchronized-playback layer on top.
- **Live collaborative whiteboard.** A shared canvas per channel or call — cursors, shapes, sketches, screen annotations — using the same WebSocket connection every other realtime feature already rides on.
- **Bot platform + slash commands.** A public API and webhook/event subscription system so third parties can build bots that join servers, react to messages, and post back. This is arguably *the* feature that made Discord's ecosystem — worth taking seriously once servers exist.
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
- **Deafen**, distinct from mute — stop hearing the call, not just stop being heard.
- **Join/leave call sound effects**, gated behind a settings toggle.
- **Custom emoji per server**, once servers exist.
- **Stacked read-receipt avatars** (iMessage-style) instead of a plain "read" label, once group conversations have more than 2 people worth showing.

## Infrastructure / operability

- **Object storage for attachments.** Voice messages (and future pictures/video) are `bytea` in Postgres today — fine for a demo, not for real volume. Move to S3/R2/etc. with presigned URLs; store a reference instead of streaming bytes through the app server on every playback.
- **Horizontal scaling for the realtime Hub.** `internal/realtime/hub.go` keeps WebSocket connections in an in-memory map — fine for one API instance, not for several behind a load balancer. Needs a pub/sub layer (Redis pub/sub, since Redis is already a dependency) so `SendToUser` can reach a connection held by a *different* instance.
- **Rate limiting.** Login attempts, message sends, and voice uploads have no throttling right now.
- **Moderation tooling.** Blocking a user, reporting a message, and (once servers exist) kicking/banning.
- **Go test suite.** The backend has no unit/integration tests yet (`tests/suite.sh` aside) — worth adding before the schema grows much further, especially around the optimistic-concurrency and call-registry logic.
- **Observability.** Structured logging, basic metrics (active connections, calls in progress, message throughput) — useful once this runs anywhere other than a laptop.

## Cross-platform

- **PWA installability.** Manifest + service worker for an installable app shell; most of the groundwork (icons, theme-color) is cheap given the design system already exists.
- **Native mobile app.** The API layer (`src/api/`) and realtime event schemas are already framework-agnostic; a React Native client could reuse the contract even if not the components.
