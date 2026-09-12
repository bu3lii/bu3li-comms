import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RealtimeSocket } from "./socket";

type Listener = (event?: unknown) => void;

class FakeWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  url: string;
  private listeners: Record<string, Listener[]> = {};

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, cb: Listener) {
    (this.listeners[type] ??= []).push(cb);
  }

  removeEventListener() {}

  send() {}

  close() {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatch("close");
  }

  triggerOpen() {
    this.readyState = FakeWebSocket.OPEN;
    this.dispatch("open");
  }

  triggerUnexpectedClose() {
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatch("close");
  }

  triggerMessage(data: string) {
    for (const cb of this.listeners["message"] ?? []) cb({ data });
  }

  private dispatch(type: string) {
    for (const cb of this.listeners[type] ?? []) cb();
  }
}

describe("RealtimeSocket", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    // @ts-expect-error -- test double for the browser WebSocket global
    globalThis.WebSocket = FakeWebSocket;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("goes connecting -> connected on open", () => {
    const socket = new RealtimeSocket();
    const statuses: string[] = [];
    socket.onStatusChange((s) => statuses.push(s));

    socket.connect();
    expect(statuses.at(-1)).toBe("connecting");

    FakeWebSocket.instances[0]!.triggerOpen();
    expect(statuses.at(-1)).toBe("connected");
  });

  it("reconnects with backoff after an unexpected close, and not after an intentional disconnect", () => {
    const socket = new RealtimeSocket();
    const statuses: string[] = [];
    socket.onStatusChange((s) => statuses.push(s));

    socket.connect();
    FakeWebSocket.instances[0]!.triggerOpen();
    expect(FakeWebSocket.instances).toHaveLength(1);

    FakeWebSocket.instances[0]!.triggerUnexpectedClose();
    expect(statuses.at(-1)).toBe("reconnecting");

    vi.advanceTimersByTime(500);
    expect(FakeWebSocket.instances).toHaveLength(2);

    socket.disconnect();
    expect(statuses.at(-1)).toBe("disconnected");

    vi.advanceTimersByTime(20_000);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("does not open a second socket if connect() is called while already connecting", () => {
    const socket = new RealtimeSocket();
    socket.connect();
    socket.connect();
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("ignores malformed incoming payloads instead of throwing, but delivers valid ones", () => {
    const socket = new RealtimeSocket();
    const received: unknown[] = [];
    socket.onEvent((e) => received.push(e));

    socket.connect();
    const ws = FakeWebSocket.instances[0]!;
    ws.triggerOpen();

    expect(() => ws.triggerMessage("not json")).not.toThrow();
    expect(() => ws.triggerMessage(JSON.stringify({ type: "unknown.event", data: {} }))).not.toThrow();
    expect(received).toHaveLength(0);

    ws.triggerMessage(JSON.stringify({ type: "user.online", data: { user_id: "u1" } }));
    expect(received).toEqual([{ type: "user.online", data: { user_id: "u1" } }]);
  });
});
