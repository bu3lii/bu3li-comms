#!/usr/bin/env bash
# One-command local dev environment for bu3li-comms: Postgres + Redis (Docker),
# the Go API (migrations apply automatically on boot), and the Vite frontend.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if ! command -v go >/dev/null 2>&1; then
  echo "error: 'go' is not on PATH. Install Go (https://go.dev/dl/) and try again." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "error: 'npm' is not on PATH. Install Node.js (https://nodejs.org/) and try again." >&2
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "error: need 'docker compose' (or standalone 'docker-compose'). Install Docker and try again." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "error: Docker isn't running. Start Docker Desktop (or your Docker daemon) and try again." >&2
  exit 1
fi

# A leftover process from a previous crashed/killed run (or anything else)
# holding one of our ports produces a confusing failure later — fail fast
# here instead, and say exactly what's in the way rather than guessing by
# killing it ourselves.
check_port_free() {
  local port="$1"
  local holder
  holder="$(lsof -ti ":$port" 2>/dev/null || true)"
  if [ -n "$holder" ]; then
    echo "error: port $port is already in use (pid $holder: $(ps -o comm= -p "$holder" 2>/dev/null || echo unknown))." >&2
    echo "       Stop it first, e.g.: kill $holder" >&2
    exit 1
  fi
}
check_port_free 8080
check_port_free 5173

echo "==> Starting Postgres + Redis..."
"${COMPOSE[@]}" up -d

echo -n "==> Waiting for Postgres"
until "${COMPOSE[@]}" exec -T postgres pg_isready -U app -d realtime >/dev/null 2>&1; do
  echo -n "."
  sleep 1
done
echo " ready."

echo -n "==> Waiting for Redis"
until "${COMPOSE[@]}" exec -T redis redis-cli ping >/dev/null 2>&1; do
  echo -n "."
  sleep 1
done
echo " ready."

if [ ! -d "frontend/node_modules" ]; then
  echo "==> Installing frontend dependencies (first run only)..."
  (cd frontend && npm install)
fi

# Build the API to a real binary and run *that* directly, rather than
# `go run &`, which launches a wrapper process and execs the actual server
# as its child. Killing the wrapper's PID leaves that child running and
# still bound to :8080 — exactly what broke `kill`-and-restart before.
API_BIN="$(mktemp -d)/bu3li-api"
echo "==> Building the API..."
go build -o "$API_BIN" ./cmd/api

PIDS=()

cleanup() {
  echo
  echo "==> Stopping the API and frontend..."
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" >/dev/null 2>&1 || true
  done
  wait >/dev/null 2>&1 || true
  rm -f "$API_BIN"
  echo "    Postgres and Redis are still running in Docker. Stop them with: ${COMPOSE[*]} down"
}
trap cleanup EXIT INT TERM

echo "==> Starting the API on :8080 (migrations apply automatically)..."
"$API_BIN" &
PIDS+=("$!")

# Same reasoning as the API: run Vite's own binary, not the `npm run dev`
# wrapper, so the PID we track is the process actually holding :5173.
echo "==> Starting the frontend dev server on :5173..."
(cd frontend && exec node_modules/.bin/vite) &
PIDS+=("$!")

cat <<EOF

bu3li comms is starting up:
  frontend  http://localhost:5173
  backend   http://localhost:8080

Press Ctrl+C to stop both (Postgres/Redis keep running in Docker).
EOF

wait
