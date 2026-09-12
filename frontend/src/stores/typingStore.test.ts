import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TYPING_EXPIRY_MS, useTypingStore } from "./typingStore";

function typingUsers(conversationId: string): string[] {
  return [...(useTypingStore.getState().typingByConversation[conversationId] ?? [])];
}

describe("typingStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useTypingStore.setState({ typingByConversation: {} });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("adds a user to the typing set", () => {
    useTypingStore.getState().setTyping("c1", "u1", true);
    expect(typingUsers("c1")).toEqual(["u1"]);
  });

  it("removes a user immediately on an explicit stop", () => {
    useTypingStore.getState().setTyping("c1", "u1", true);
    useTypingStore.getState().setTyping("c1", "u1", false);
    expect(typingUsers("c1")).toEqual([]);
  });

  it("expires a typing user automatically if stopped never arrives", () => {
    useTypingStore.getState().setTyping("c1", "u1", true);
    expect(typingUsers("c1")).toEqual(["u1"]);

    vi.advanceTimersByTime(TYPING_EXPIRY_MS - 1);
    expect(typingUsers("c1")).toEqual(["u1"]);

    vi.advanceTimersByTime(1);
    expect(typingUsers("c1")).toEqual([]);
  });

  it("restarts the expiry timer on repeated typing signals", () => {
    useTypingStore.getState().setTyping("c1", "u1", true);
    vi.advanceTimersByTime(TYPING_EXPIRY_MS - 1);

    useTypingStore.getState().setTyping("c1", "u1", true);
    vi.advanceTimersByTime(TYPING_EXPIRY_MS - 1);
    expect(typingUsers("c1")).toEqual(["u1"]);

    vi.advanceTimersByTime(1);
    expect(typingUsers("c1")).toEqual([]);
  });

  it("keeps conversations independent", () => {
    useTypingStore.getState().setTyping("c1", "u1", true);
    useTypingStore.getState().setTyping("c2", "u2", true);

    expect(typingUsers("c1")).toEqual(["u1"]);
    expect(typingUsers("c2")).toEqual(["u2"]);
  });
});
