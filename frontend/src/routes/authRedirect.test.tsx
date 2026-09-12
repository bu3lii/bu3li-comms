import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { App } from "../App";

vi.mock("../realtime/socket", () => ({
  realtimeSocket: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    onEvent: vi.fn(() => () => {}),
    onStatusChange: vi.fn((cb: (status: string) => void) => {
      cb("disconnected");
      return () => {};
    }),
    send: vi.fn(),
    getStatus: vi.fn(() => "disconnected"),
  },
}));

vi.mock("../api/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/auth")>();
  return { ...actual, getMe: vi.fn() };
});

const { getMe } = await import("../api/auth");

function renderApp(path: string) {
  window.history.pushState({}, "", path);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>,
  );
}

describe("auth redirect behavior", () => {
  beforeEach(() => {
    vi.mocked(getMe).mockReset();
  });

  it("redirects an unauthenticated visitor from /chat to /login", async () => {
    vi.mocked(getMe).mockRejectedValue(new Error("unauthorized"));

    renderApp("/chat");

    expect(await screen.findByRole("heading", { name: /log in/i })).toBeInTheDocument();
  });

  it("redirects an already-authenticated visitor away from /login into chat", async () => {
    vi.mocked(getMe).mockResolvedValue({ id: "u1", username: "alice", email: "alice@example.com", has_avatar: false });

    renderApp("/login");

    expect(await screen.findByText("alice")).toBeInTheDocument();
  });

  it("keeps an authenticated visitor on /chat", async () => {
    vi.mocked(getMe).mockResolvedValue({ id: "u1", username: "alice", email: "alice@example.com", has_avatar: false });

    renderApp("/chat");

    expect(await screen.findByText(/pick a conversation/i)).toBeInTheDocument();
  });
});
