# FRONTEND_AGENT.md

## Mission

Build the frontend for `bu3li-comms`, a realtime communications app with a Go backend.

The frontend should be production-minded, clean, fast, and easy to extend later with WebRTC voice calling. Do not over-engineer it, but do not build throwaway demo code either.

## Preferred stack

Use:

- React
- TypeScript
- Vite
- Tailwind CSS
- TanStack Query for HTTP/server state
- Zustand for small client-only state where needed
- React Router for routing
- Native WebSocket API behind a small typed wrapper
- Zod for runtime validation of API / WebSocket payloads
- Vitest + React Testing Library for unit/component tests
- Playwright for a few end-to-end tests

Use latest stable package versions unless the repository already pins something else.

Do not use Next.js. This backend is already a separate Go API, so a Vite SPA is the simplest fit.

## High-level product

The app is a Discord/WhatsApp-style realtime communication client.

Current backend capabilities:

- user registration
- login/logout with HttpOnly session cookies
- authenticated `/me`
- direct/group conversations
- add conversation members
- send messages
- list message history
- edit messages
- optimistic concurrency using message versions
- delete messages
- WebSocket realtime connection
- presence
- typing indicators
- message read receipts
- realtime message created/updated/deleted events

WebRTC voice will be added after the frontend messaging experience is working.

## Repository layout

Keep the Go backend where it is.

Create the frontend under:

```text
frontend/
```

Suggested structure:

```text
frontend/
├── src/
│   ├── api/
│   │   ├── client.ts
│   │   ├── auth.ts
│   │   ├── conversations.ts
│   │   └── messages.ts
│   ├── realtime/
│   │   ├── socket.ts
│   │   ├── events.ts
│   │   └── useRealtime.ts
│   ├── components/
│   │   ├── layout/
│   │   ├── conversations/
│   │   ├── messages/
│   │   └── ui/
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── RegisterPage.tsx
│   │   └── ChatPage.tsx
│   ├── hooks/
│   ├── stores/
│   ├── types/
│   ├── App.tsx
│   └── main.tsx
├── public/
├── package.json
├── vite.config.ts
└── tsconfig.json
```

This is guidance, not a rigid requirement.

## Backend origin

Development backend:

```text
http://localhost:8080
```

WebSocket:

```text
ws://localhost:8080/ws
```

Use environment variables:

```text
VITE_API_URL=http://localhost:8080
VITE_WS_URL=ws://localhost:8080/ws
```

Do not hard-code production URLs throughout components.

## Authentication

Authentication is cookie/session based.

The backend sets an HttpOnly cookie named:

```text
session_id
```

All authenticated HTTP requests must include credentials.

Example:

```ts
fetch(`${API_URL}/me`, {
  credentials: "include",
})
```

The browser will send the session cookie automatically to the WebSocket endpoint when same-origin / appropriately configured.

Do not store auth tokens in `localStorage`.

### Endpoints

#### Register

```http
POST /users
Content-Type: application/json
```

Body:

```json
{
  "username": "alice",
  "email": "alice@example.com",
  "password": "supersecret"
}
```

#### Login

```http
POST /login
Content-Type: application/json
```

Body:

```json
{
  "email": "alice@example.com",
  "password": "supersecret"
}
```

#### Logout

```http
POST /logout
```

Authenticated.

#### Current user

```http
GET /me
```

Response example:

```json
{
  "id": "6b03f0dc-9d20-490e-9fae-3a6f87f30333",
  "username": "alice",
  "email": "alice@example.com"
}
```

## Conversations

### Create

```http
POST /conversations
```

Body:

```json
{
  "type": "direct"
}
```

or:

```json
{
  "type": "group"
}
```

Response example:

```json
{
  "id": "85ad755e-8070-47e9-83cf-d191da9e9f10",
  "type": "direct"
}
```

### Add member

```http
POST /conversations/{conversationID}/members
```

Body:

```json
{
  "user_id": "a6e6be3d-bca7-41d9-85c3-c042a730bdc2"
}
```

Successful response:

```text
204 No Content
```

## Messages

Message shape:

```ts
export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  client_message_id: string
  content: string
  version: number
  created_at: string
  updated_at: string
}
```

### Send message

```http
POST /conversations/{conversationID}/messages
```

Body:

```json
{
  "client_message_id": "client-generated-uuid",
  "content": "hello"
}
```

The frontend MUST generate a UUID before sending each new logical message.

Use `crypto.randomUUID()`.

Keep the same `client_message_id` if retrying the same logical send. This is part of backend idempotency.

### List messages

```http
GET /conversations/{conversationID}/messages
```

Returns:

```json
[
  {
    "id": "...",
    "conversation_id": "...",
    "sender_id": "...",
    "client_message_id": "...",
    "content": "hello",
    "version": 1,
    "created_at": "...",
    "updated_at": "..."
  }
]
```

The backend currently orders messages newest-first. The UI should render chat chronology naturally, oldest at top and newest at bottom.

### Edit message

```http
PATCH /messages/{messageID}
```

Body:

```json
{
  "content": "edited text",
  "version": 1
}
```

The `version` is mandatory.

On successful edit, the server increments it:

```json
{
  "version": 2
}
```

If another client already changed the message, the backend returns:

```text
409 Conflict
```

When receiving 409:

- do not silently overwrite server state
- refetch / reconcile the affected conversation
- show a small non-destructive message such as "This message changed elsewhere. Latest version loaded."

This optimistic-concurrency behavior is intentional and should remain visible in the frontend architecture.

### Delete

```http
DELETE /messages/{messageID}
```

Success:

```text
204 No Content
```

Only the sender may edit/delete their message.

## WebSocket

Connect after authenticated user state has been established.

Endpoint:

```text
ws://localhost:8080/ws
```

Build one reusable socket manager rather than opening sockets inside random components.

It should:

- establish one application-level WebSocket connection
- parse typed events
- expose subscribe/unsubscribe APIs or integrate with React cleanly
- reconnect after accidental disconnects with bounded exponential backoff
- not reconnect after an intentional logout
- avoid duplicate listeners
- clean up timers/listeners
- expose connection state:
  - connecting
  - connected
  - reconnecting
  - disconnected

Do not make every React component own a WebSocket.

## Realtime event envelope

Server events use:

```ts
interface RealtimeEvent<T = unknown> {
  type: string
  data: T
}
```

## Server -> client events

### `message.created`

```json
{
  "type": "message.created",
  "data": {
    "id": "...",
    "conversation_id": "...",
    "sender_id": "...",
    "client_message_id": "...",
    "content": "...",
    "version": 1,
    "created_at": "...",
    "updated_at": "..."
  }
}
```

Update TanStack Query's cache for that conversation directly.

Avoid automatically refetching all messages on every event unless reconciliation is needed.

Deduplicate by server message ID.

Also use `client_message_id` to reconcile optimistic client messages with their authoritative server counterpart.

### `message.updated`

```json
{
  "type": "message.updated",
  "data": {
    "...": "...",
    "version": 2
  }
}
```

Replace the matching message in cache.

Never accept an older version over a newer cached version.

### `message.deleted`

```json
{
  "type": "message.deleted",
  "data": {
    "message_id": "...",
    "conversation_id": "..."
  }
}
```

Remove the matching message from cache.

### `message.read`

```json
{
  "type": "message.read",
  "data": {
    "message_id": "...",
    "user_id": "...",
    "conversation_id": "...",
    "read_at": "..."
  }
}
```

Use this to display read state.

Do not initially build elaborate multi-user receipt UI. A subtle indicator is enough.

### `typing.started`

```json
{
  "type": "typing.started",
  "data": {
    "user_id": "...",
    "conversation_id": "..."
  }
}
```

### `typing.stopped`

Same shape.

Typing state is ephemeral.

Expire a user's typing indicator locally after several seconds in case `typing.stopped` is lost.

Do not persist typing state.

### `user.online`

```json
{
  "type": "user.online",
  "data": {
    "user_id": "..."
  }
}
```

### `user.offline`

Same shape.

Maintain a small presence store keyed by user ID.

## Client -> server WebSocket events

### Typing started

```json
{
  "type": "typing.started",
  "data": {
    "conversation_id": "..."
  }
}
```

### Typing stopped

```json
{
  "type": "typing.stopped",
  "data": {
    "conversation_id": "..."
  }
}
```

Debounce/throttle typing events.

Suggested behavior:

- send `typing.started` when the user begins typing
- don't spam it for every keystroke
- send `typing.stopped` after roughly 1-2 seconds of inactivity
- also send stopped when switching conversations where practical

### Message read

```json
{
  "type": "message.read",
  "data": {
    "message_id": "..."
  }
}
```

Do not send read events for every render.

Send when a received message meaningfully becomes read, such as active conversation + document visible + message visible/current.

A simpler v1 implementation is acceptable: mark the latest incoming message read when the conversation is open and focused.

## UI requirements

Build a polished desktop-first responsive messaging interface.

General layout:

```text
┌───────────────────────────────────────────────────────────────┐
│ Sidebar                 │ Active conversation                 │
│                         │                                     │
│ current user            │ conversation header                 │
│ connection status       │ presence                            │
│                         │                                     │
│ conversations           │ message history                     │
│                         │                                     │
│                         │ typing indicator                    │
│                         │                                     │
│                         │ composer                            │
└───────────────────────────────────────────────────────────────┘
```

### Authentication screens

Build:

- login
- registration

Requirements:

- basic client validation
- server error display
- loading states
- keyboard accessible
- redirect authenticated users into chat

On application startup:

1. call `/me`
2. if authenticated, enter app and connect WebSocket
3. if unauthorized, display login

### Chat shell

Include:

- sidebar
- logged-in username
- logout
- WebSocket connection status
- conversation list area
- active conversation area

The backend may not yet expose a "list all my conversations" endpoint. If it does not exist, do not invent fake production data or change backend code unless necessary.

For development, isolate any temporary conversation-ID entry/debug selector behind a clearly named dev-only component. Document which missing backend endpoint blocks proper conversation discovery.

### Message list

Requirements:

- message bubbles / rows
- distinguish current user's messages
- timestamps
- edited indicator when `updated_at != created_at`
- edit own messages
- delete own messages
- sensible empty state
- auto-scroll on initial load and new messages when user is already near bottom
- do not yank the user to bottom if they scrolled upward

### Composer

Requirements:

- textarea or autosizing input
- Enter sends
- Shift+Enter inserts newline
- disabled while empty
- optimistic message display encouraged
- generates `client_message_id`
- failure state with retry
- typing.start/stopped WebSocket events

### Presence

Show a simple presence indicator when enough user data is available.

Do not fabricate usernames for unknown IDs.

Presence should degrade gracefully if the backend lacks a user lookup endpoint needed for rendering peer identities.

### Read receipts

Keep v1 visually simple.

Do not turn this into a complicated social-product feature.

## State architecture

Use TanStack Query for backend/server state:

- `/me`
- messages
- conversation data when endpoints exist

Use Zustand only for lightweight client/realtime state such as:

- WebSocket connection status
- presence map
- typing map
- UI selection if router state is not sufficient

Do NOT copy all TanStack Query server data into Zustand.

Avoid a giant global store.

## Message cache behavior

Realtime updates should mutate the relevant query cache.

Example conceptual keys:

```ts
["me"]
["messages", conversationId]
["conversation", conversationId]
["conversations"]
```

For `message.created`:

1. locate conversation cache
2. check whether message already exists
3. reconcile optimistic item by `client_message_id`
4. insert server message
5. preserve chronological ordering

For `message.updated`:

1. locate by `id`
2. replace only if incoming version >= cached version

For `message.deleted`:

1. remove by ID

## Optimistic send behavior

Preferred implementation:

1. generate `client_message_id`
2. immediately add pending UI message
3. POST to backend
4. when HTTP response or `message.created` arrives, reconcile using `client_message_id`
5. if request fails, mark pending item failed
6. allow retry with SAME `client_message_id`

This demonstrates why the backend's idempotency design exists.

## Error handling

Do not use `alert()` for normal errors.

Provide:

- inline form errors
- non-blocking toasts where suitable
- failed-message state
- reconnect state
- conflict feedback

Differentiate:

- 401 -> session expired / go to login
- 403 -> forbidden
- 409 -> version conflict
- 5xx -> server problem
- network failure -> connectivity problem

## Accessibility

Minimum expectations:

- proper buttons, labels and forms
- keyboard navigation
- visible focus states
- meaningful `aria-label`s for icon-only controls
- no important information conveyed by color alone
- reduced-motion friendly where animations exist

## Styling

Target a professional communications-app aesthetic.

Good references conceptually:

- Discord's information density
- Slack's structure
- Linear's restraint
- modern dark/light SaaS interfaces

Do not clone any product exactly.

Avoid:

- giant marketing-style gradients inside the app
- excessive glassmorphism
- oversized rounded cards everywhere
- emoji as primary icons
- toy/demo appearance

Use a coherent spacing and typography system.

Dark mode is desirable if straightforward, but core functionality comes first.

## CORS / local development

Because the Vite dev server will likely run on another port, cookie authentication may require backend CORS configuration.

Prefer configuring Vite's dev proxy so frontend requests can use relative paths where possible.

Example concept:

```ts
server: {
  proxy: {
    "/api": {
      target: "http://localhost:8080",
      changeOrigin: true,
    },
    "/ws": {
      target: "ws://localhost:8080",
      ws: true,
    },
  },
}
```

However, the actual Go routes currently do NOT have an `/api` prefix.

Choose a proxy configuration that preserves the existing backend routes. Do not silently assume `/api/*` endpoints exist.

A clean option is to proxy the specific backend paths or use a local backend origin with credentials/CORS if already configured.

Document whichever approach you implement.

## Do not change backend contracts casually

The frontend agent should primarily build the frontend.

If an essential frontend requirement cannot be implemented because the backend lacks an endpoint:

1. document the missing endpoint in `frontend/BACKEND_GAPS.md`
2. keep the frontend architecture ready for it
3. only add backend code when the missing API is small, obvious and necessary

Do not refactor the Go backend for stylistic reasons.

## Known likely backend gap

There may currently be no endpoint for:

```text
GET /conversations
```

that lists the authenticated user's conversations with member/user metadata.

If missing, add it to `frontend/BACKEND_GAPS.md` and proceed with the rest of the frontend.

A production chat UI will eventually want a response roughly capable of representing:

```ts
interface ConversationSummary {
  id: string
  type: "direct" | "group"
  members: UserSummary[]
  last_message?: Message
}
```

Do not assume that exact backend response already exists.

## WebRTC preparation

Do NOT implement WebRTC yet unless explicitly instructed after the messaging frontend works.

But structure the frontend so later voice support can cleanly add:

```text
src/calls/
├── signaling.ts
├── peerConnection.ts
├── useCall.ts
└── components/
```

Expected future WebSocket event names include:

```text
call.created
call.joined
call.left
webrtc.offer
webrtc.answer
webrtc.ice_candidate
```

Do not prematurely create fake implementations of these.

## Testing expectations

At minimum add tests for:

- auth redirect behavior
- message cache insertion from `message.created`
- message cache replacement from `message.updated`
- message removal from `message.deleted`
- stale message version must not replace a newer version
- optimistic message reconciliation by `client_message_id`
- typing indicator expiry
- WebSocket event parsing
- reconnect behavior at a reasonable abstraction level

Add at least one Playwright happy-path test if backend/local test setup makes it practical.

Do not spend more time on test infrastructure than on the actual app.

## Quality constraints

- TypeScript strict mode
- no `any` unless genuinely unavoidable
- no huge 500-line components
- reusable API client
- typed errors where practical
- typed realtime events
- loading/empty/error states
- no secrets committed
- no auth token storage in localStorage
- no mock data shipped as if real data
- no backend-breaking changes for convenience
- run formatter/linter/tests before completion

## Definition of done for frontend v1

The frontend v1 is done when:

- registration works
- login works
- cookie session persists across refresh
- logout works
- `/me` initializes auth
- WebSocket connects after login
- reconnection works
- a known conversation can load message history
- messages can be sent
- new messages appear via realtime events
- own messages can be edited
- 409 conflict is handled gracefully
- own messages can be deleted
- typing indicators work
- online/offline events are reflected in UI where identity data permits
- read receipts are sent and consumed
- refresh does not corrupt state
- app does not create duplicate WebSocket connections
- UI looks credible enough for a portfolio demo
- code is structured so WebRTC can be added next

## Deliverables

When finished, provide:

1. completed `frontend/` application
2. `frontend/README.md` with local setup
3. `.env.example`
4. `frontend/BACKEND_GAPS.md` for missing API support
5. automated frontend tests
6. concise summary of architectural choices
7. concise list of remaining work before WebRTC

## Commands

The finished frontend should have conventional scripts equivalent to:

```bash
npm install
npm run dev
npm run build
npm run lint
npm test
```

If Playwright is included:

```bash
npm run test:e2e
```

## Final instruction to the agent

Implement the frontend rather than only proposing it.

Make sensible decisions autonomously.

Do not repeatedly ask for aesthetic preferences. Choose a polished, restrained communications-app design.

Preserve the existing Go backend behavior.

When encountering a backend gap, document it clearly and keep moving wherever possible.

Prioritize a working realtime messaging UI over decorative polish.

The next major engineering phase after this frontend is complete is WebRTC voice calling.
