import { describe, expect, it } from "vitest";
import { insertOrReconcileMessage, markFailed, removeById, replaceIfNewer } from "./messageCache";
import type { ChatMessage, Message } from "../types/message";

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "server-1",
    conversation_id: "conv-1",
    sender_id: "user-1",
    client_message_id: "client-1",
    content: "hello",
    version: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    has_attachment: false,
    attachment_duration_ms: 0,
    attachment_width_px: 0,
    attachment_height_px: 0,
    reactions: [],
    ...overrides,
  };
}

function makePending(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return { ...makeMessage(), status: "pending", ...overrides };
}

describe("insertOrReconcileMessage", () => {
  it("inserts a brand new server message", () => {
    const result = insertOrReconcileMessage([], makeMessage());
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "server-1", status: "sent" });
  });

  it("reconciles an optimistic message by client_message_id, replacing it with the server copy", () => {
    const pending = makePending({ id: "client-1" });
    const incoming = makeMessage({ id: "server-1", client_message_id: "client-1" });

    const result = insertOrReconcileMessage([pending], incoming);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "server-1", status: "sent" });
  });

  it("does not duplicate a server message that already exists (e.g. HTTP response racing the WS event)", () => {
    const existing: ChatMessage = { ...makeMessage(), status: "sent" };
    const result = insertOrReconcileMessage([existing], makeMessage());

    expect(result).toHaveLength(1);
  });

  it("keeps chronological order after insertion", () => {
    const earlier = { ...makeMessage({ id: "a", created_at: "2026-01-01T00:00:00.000Z" }), status: "sent" as const };
    const later = makeMessage({ id: "b", client_message_id: "client-2", created_at: "2026-01-01T00:05:00.000Z" });

    const result = insertOrReconcileMessage([earlier], later);

    expect(result.map((m) => m.id)).toEqual(["a", "b"]);
  });
});

describe("replaceIfNewer", () => {
  it("replaces the cached message when the incoming version is newer", () => {
    const cached: ChatMessage = { ...makeMessage({ version: 1, content: "old" }), status: "sent" };
    const incoming = makeMessage({ version: 2, content: "new" });

    const result = replaceIfNewer([cached], incoming);

    expect(result[0]).toMatchObject({ content: "new", version: 2 });
  });

  it("never accepts a stale version over what's already cached", () => {
    const cached: ChatMessage = { ...makeMessage({ version: 3, content: "current" }), status: "sent" };
    const staleIncoming = makeMessage({ version: 2, content: "stale" });

    const result = replaceIfNewer([cached], staleIncoming);

    expect(result[0]).toMatchObject({ content: "current", version: 3 });
  });
});

describe("removeById", () => {
  it("removes the matching message", () => {
    const cached: ChatMessage = { ...makeMessage(), status: "sent" };
    const result = removeById([cached], "server-1");
    expect(result).toHaveLength(0);
  });

  it("leaves other messages untouched", () => {
    const a: ChatMessage = { ...makeMessage({ id: "a" }), status: "sent" };
    const b: ChatMessage = { ...makeMessage({ id: "b" }), status: "sent" };
    const result = removeById([a, b], "a");
    expect(result.map((m) => m.id)).toEqual(["b"]);
  });
});

describe("markFailed", () => {
  it("marks the matching pending message as failed", () => {
    const pending = makePending({ client_message_id: "client-1" });
    const result = markFailed([pending], "client-1");
    expect(result[0]?.status).toBe("failed");
  });

  it("ignores messages that are already sent", () => {
    const sent: ChatMessage = { ...makeMessage({ client_message_id: "client-1" }), status: "sent" };
    const result = markFailed([sent], "client-1");
    expect(result[0]?.status).toBe("sent");
  });
});
