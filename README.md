# bu3li-comms

A realtime messaging app: Go backend (Postgres + Redis + WebSockets), React/TypeScript frontend. Direct/group conversations plus Discord-style servers with multiple text/voice channels, text/voice/picture/video messages, message reactions, @mentions, markdown-lite formatting, unread badges, profile pictures, typing indicators, read receipts, presence, rate limiting, and WebRTC voice calls (1:1, group voice channels, and server voice channels, with an optional local TURN server).

## Run everything with one command

```bash
./dev.sh
```

This starts Postgres + Redis in Docker, waits for them to be ready, applies database migrations automatically (the API does this itself on boot — no separate migrate step), then starts the Go API on `:8080` and the Vite frontend on `:5173`. Ctrl+C stops the API and frontend; Postgres/Redis keep running in Docker (`docker compose down` when you actually want them stopped).

Requires Docker, Go, and Node.js on `PATH`. First run installs frontend dependencies automatically.

Open **http://localhost:5173**.

## Manual setup

If you'd rather run pieces yourself:

```bash
docker compose up -d          # Postgres :5433, Redis :6379
go run ./cmd/api              # applies migrations, listens on :8080
cd frontend && npm install && npm run dev   # http://localhost:5173
```

## Layout

```
cmd/api/          Go entrypoint
internal/         Go domain packages (auth, users, conversations, messages, realtime, session, presence, platform)
migrations/       SQL migrations, embedded into the binary and applied automatically on boot
frontend/         React + TypeScript SPA — see frontend/README.md for its architecture notes
```

## Testing

```bash
go build ./... && go vet ./...   # backend
cd frontend
npm test                          # unit/component tests (Vitest)
npm run test:e2e                  # Playwright, against a running backend + frontend
npm run lint                      # oxlint
```

## Notable design decisions and known gaps

See `frontend/BACKEND_GAPS.md` for what's been filled in since the initial pass (conversation listing, user search, register-then-login, presence snapshot) and what remains by design (no SFU for voice channels, no TURN server, calls aren't persisted, voice messages are stored as `bytea` rather than object storage).

## What's next

See `ROADMAP.md` for where this could go — picture/video attachments, profile pictures, servers-not-just-groups, room-based (SFU) voice, and more.
