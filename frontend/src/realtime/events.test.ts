import { describe, expect, it } from "vitest";
import { parseRealtimeEvent } from "./events";

describe("parseRealtimeEvent", () => {
  it("parses a message.created event", () => {
    const event = parseRealtimeEvent({
      type: "message.created",
      data: {
        id: "m1",
        conversation_id: "c1",
        sender_id: "u1",
        client_message_id: "cm1",
        content: "hi",
        version: 1,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    });

    expect(event?.type).toBe("message.created");
    if (event?.type === "message.created") {
      expect(event.data.content).toBe("hi");
    }
  });

  it("parses a typing.started event", () => {
    const event = parseRealtimeEvent({
      type: "typing.started",
      data: { user_id: "u1", conversation_id: "c1" },
    });

    expect(event).toEqual({ type: "typing.started", data: { user_id: "u1", conversation_id: "c1" } });
  });

  it("parses a message.deleted event", () => {
    const event = parseRealtimeEvent({
      type: "message.deleted",
      data: { message_id: "m1", conversation_id: "c1" },
    });

    expect(event?.type).toBe("message.deleted");
  });

  it("returns null for an unrecognized event type", () => {
    expect(parseRealtimeEvent({ type: "call.created", data: {} })).toBeNull();
  });

  it("returns null when the envelope is malformed", () => {
    expect(parseRealtimeEvent({ notAType: true })).toBeNull();
    expect(parseRealtimeEvent(null)).toBeNull();
    expect(parseRealtimeEvent("just a string")).toBeNull();
  });

  it("returns null when the event data doesn't match the expected shape", () => {
    const event = parseRealtimeEvent({ type: "typing.started", data: { user_id: "u1" } });
    expect(event).toBeNull();
  });
});
