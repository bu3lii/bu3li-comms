import { resolveWsUrl } from "../lib/env";
import { parseRealtimeEvent, type OutgoingEvent, type RealtimeEvent } from "./events";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

type EventListener = (event: RealtimeEvent) => void;
type StatusListener = (status: ConnectionStatus) => void;

const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 15_000;

/**
 * One application-level WebSocket connection, reused across the whole app.
 * Components subscribe/unsubscribe rather than opening sockets themselves.
 */
export class RealtimeSocket {
  private socket: WebSocket | null = null;
  private status: ConnectionStatus = "disconnected";
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;

  private readonly eventListeners = new Set<EventListener>();
  private readonly statusListeners = new Set<StatusListener>();

  connect(): void {
    this.intentionalClose = false;

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.open();
  }

  disconnect(): void {
    this.intentionalClose = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.reconnectAttempts = 0;
    this.socket?.close();
    this.socket = null;
    this.setStatus("disconnected");
  }

  send(event: OutgoingEvent): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(event));
    }
  }

  onEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  private open(): void {
    this.setStatus(this.reconnectAttempts > 0 ? "reconnecting" : "connecting");

    const socket = new WebSocket(resolveWsUrl());
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.reconnectAttempts = 0;
      this.setStatus("connected");
    });

    socket.addEventListener("message", (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.data as string);
      } catch {
        return;
      }

      const event = parseRealtimeEvent(parsed);
      if (event) {
        for (const listener of this.eventListeners) {
          listener(event);
        }
      }
    });

    socket.addEventListener("close", () => {
      if (this.socket !== socket) {
        return;
      }
      this.socket = null;

      if (this.intentionalClose) {
        this.setStatus("disconnected");
        return;
      }

      this.scheduleReconnect();
    });

    socket.addEventListener("error", () => {
      socket.close();
    });
  }

  private scheduleReconnect(): void {
    this.setStatus("reconnecting");

    const delay = Math.min(BASE_BACKOFF_MS * 2 ** this.reconnectAttempts, MAX_BACKOFF_MS);
    this.reconnectAttempts += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) {
      return;
    }
    this.status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }
}

export const realtimeSocket = new RealtimeSocket();
