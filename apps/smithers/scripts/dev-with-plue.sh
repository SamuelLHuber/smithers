#!/usr/bin/env bash
#
# dev-with-plue.sh — apps/smithers' one-command dev backend bridge, exposed
# as `pnpm dev:full`. Boots every backend the web app talks to and starts
# vite with all four same-origin proxies wired and end-to-end probed.
#
# The legs:
#   • Plue api (docker compose at PLUE_DIR) feeds /api/auth/* /api/user
#     (SMITHERS_AUTH_PROXY_TARGET) and /api/repos /api/orgs etc.
#     (SMITHERS_PLATFORM_PROXY_TARGET).
#   • Smithers gateway (`bun .smithers/gateway.ts` on 127.0.0.1:7331) feeds
#     /v1/rpc (ws) /health /workflows (SMITHERS_GATEWAY_PROXY_TARGET).
#   • Cloudflare Worker (alchemy dev) feeds /api/chat
#     (SMITHERS_CHAT_PROXY_TARGET). Best-effort: warn and continue when
#     CEREBRAS_API_KEY is absent, ask a human for the Worker URL when the
#     key is present but the target is not. Never mock it.
#
# Default Plue origin: http://127.0.0.1:4000 (Plue's api service).
# Default gateway origin: http://127.0.0.1:7331.
# Override with PLUE_API_BASE_URL=… / SMITHERS_GATEWAY_HOST=… / SMITHERS_GATEWAY_PORT=….
#
# Usage:
#   pnpm -C apps/smithers dev:full
#   PLUE_DIR=/Users/williamcory/plue ./scripts/dev-with-plue.sh
#
# Prereqs:
#   • A Plue checkout (PLUE_DIR or /Users/williamcory/plue).
#   • Docker running, with `docker compose` (v2).
#   • bun on PATH (for the gateway boot path).
#
# Readiness — "ready" means every leg is actually reachable:
#   1. Plue answers /api/health on PLUE_API_BASE_URL (not just any open port).
#      Plue exposes /api/health, /health, and /healthz; /api/healthz is NOT
#      a route and returns 404. The probe path is pinned here and asserted in
#      tests/assumptions/dev-backend-bridge.assumptions.test.ts.
#   2. The gateway answers /health on $GATEWAY_BASE_URL with {ok:true}.
#      If the port is already bound but unhealthy, the script REFUSES to
#      kill the listener and exits — that protects another workspace's
#      gateway from being clobbered.
#   3. The vite dev server is up on SMITHERS_DEV_PORT.
#   4. Vite's Plue proxy actually proxies — vite → /api/health → Plue
#      returns 2xx. Vite's gateway proxy actually proxies — vite → /health
#      → gateway returns {ok:true}.
#
# Idempotency: running a second time while Plue or the gateway are already
# up is a no-op; docker compose re-observes the running services, the
# gateway is reused after a /health pre-probe, and vite uses --strictPort
# so it fails fast on port collision instead of double-binding. The
# cleanup trap only kills processes this script itself spawned.
#
# Exits nonzero if any leg fails, with a distinct code per leg so a CI
# wrapper can diagnose what broke. See docs/dev-full.md for the table.

set -euo pipefail

PLUE_DIR="${PLUE_DIR:-/Users/williamcory/plue}"
PLUE_API_BASE_URL="${PLUE_API_BASE_URL:-http://127.0.0.1:4000}"
SMITHERS_DEV_PORT="${SMITHERS_DEV_PORT:-5175}"
SMITHERS_DEV_HOST="${SMITHERS_DEV_HOST:-127.0.0.1}"
SMITHERS_GATEWAY_HOST="${SMITHERS_GATEWAY_HOST:-127.0.0.1}"
SMITHERS_GATEWAY_PORT="${SMITHERS_GATEWAY_PORT:-7331}"
GATEWAY_BASE_URL="http://${SMITHERS_GATEWAY_HOST}:${SMITHERS_GATEWAY_PORT}"
GATEWAY_LOG="${SMITHERS_GATEWAY_LOG:-/tmp/smithers-dev-full-gateway.log}"

if [[ ! -d "$PLUE_DIR" ]]; then
  echo "error: PLUE_DIR=$PLUE_DIR does not exist." >&2
  echo "       Either clone Plue there, or set PLUE_DIR=/path/to/plue and retry." >&2
  exit 2
fi

if [[ ! -f "$PLUE_DIR/docker-compose.yml" ]]; then
  echo "error: $PLUE_DIR/docker-compose.yml not found." >&2
  exit 2
fi

echo "[dev-with-plue] Bringing up Plue stack from $PLUE_DIR …"
(
  cd "$PLUE_DIR"
  docker compose up -d postgres migrate seed repo-host api
)

# Probe Plue directly. /api/health must respond — the previous "or anything on
# the port" fallback would accept any tcp listener on 4000 and was the cause of
# false-positive readiness when a stale container squatted the port. Plue
# does NOT serve /api/healthz; it 404s there.
echo "[dev-with-plue] Waiting for Plue /api/health at $PLUE_API_BASE_URL …"
for attempt in $(seq 1 60); do
  if curl -fsS --max-time 1 "$PLUE_API_BASE_URL/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
  if [[ $attempt -eq 60 ]]; then
    echo "error: Plue /api/health did not respond at $PLUE_API_BASE_URL within 60s." >&2
    exit 3
  fi
done

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# The gateway entrypoint lives in the repo-root `.smithers/`, not under the app.
# In this monorepo the app is at apps/smithers while `.smithers/` is at the
# repo root, so resolve the toplevel rather than assuming `.smithers/` is here.
REPO_ROOT="$(git -C "$APP_DIR" rev-parse --show-toplevel 2>/dev/null || (cd "$APP_DIR/../.." && pwd))"
GATEWAY_ENTRY="$REPO_ROOT/.smithers/gateway.ts"
cd "$APP_DIR"

# Gateway boot — idempotent. Probe /health first; if the gateway is already
# answering ok, reuse it. If the port is bound but /health is bad, refuse to
# kill whatever is on the port (might be another workspace's gateway) and
# fail fast. Only spawn a fresh gateway when nothing is listening.
GATEWAY_PID=""
if curl -fsS --max-time 1 "$GATEWAY_BASE_URL/health" >/dev/null 2>&1; then
  echo "[dev-with-plue] Gateway already up at $GATEWAY_BASE_URL, reusing."
elif curl -sS --max-time 1 -o /dev/null "$GATEWAY_BASE_URL/health" 2>/dev/null; then
  # Connect succeeded but /health is non-2xx — something is on the port but
  # is not a healthy gateway. Refuse to clobber it.
  echo "error: $GATEWAY_BASE_URL is bound but /health did not return ok." >&2
  echo "       Refusing to kill the foreign listener. Stop it manually or" >&2
  echo "       override SMITHERS_GATEWAY_PORT/HOST and retry." >&2
  exit 7
else
  if [[ ! -f "$GATEWAY_ENTRY" ]]; then
    echo "error: $GATEWAY_ENTRY not found." >&2
    echo "       Run \`smithers init\` to install the workflow pack." >&2
    exit 6
  fi
  echo "[dev-with-plue] Starting gateway on $GATEWAY_BASE_URL (log: $GATEWAY_LOG) …"
  PORT="$SMITHERS_GATEWAY_PORT" HOST="$SMITHERS_GATEWAY_HOST" \
    bun "$GATEWAY_ENTRY" >"$GATEWAY_LOG" 2>&1 &
  GATEWAY_PID=$!
fi

cleanup() {
  if [[ -n "${VITE_PID:-}" ]] && kill -0 "$VITE_PID" 2>/dev/null; then
    kill "$VITE_PID" 2>/dev/null || true
    wait "$VITE_PID" 2>/dev/null || true
  fi
  # Only kill the gateway if THIS script spawned it. A reused gateway might
  # be owned by another workspace and must not be touched.
  if [[ -n "$GATEWAY_PID" ]] && kill -0 "$GATEWAY_PID" 2>/dev/null; then
    kill "$GATEWAY_PID" 2>/dev/null || true
    wait "$GATEWAY_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# If we spawned the gateway, wait for /health to come up before continuing.
if [[ -n "$GATEWAY_PID" ]]; then
  echo "[dev-with-plue] Waiting for gateway /health at $GATEWAY_BASE_URL …"
  for attempt in $(seq 1 60); do
    if curl -fsS --max-time 1 "$GATEWAY_BASE_URL/health" >/dev/null 2>&1; then
      break
    fi
    if ! kill -0 "$GATEWAY_PID" 2>/dev/null; then
      echo "error: gateway exited before /health went green. See $GATEWAY_LOG." >&2
      exit 6
    fi
    sleep 1
    if [[ $attempt -eq 60 ]]; then
      echo "error: gateway /health did not respond at $GATEWAY_BASE_URL within 60s." >&2
      echo "       See $GATEWAY_LOG." >&2
      exit 6
    fi
  done
fi

# Chat proxy — best-effort, human-gated. The /api/chat path in prod is owned
# by the Cloudflare Worker (src/worker.ts), which composes TanStack AI
# server-side with CEREBRAS_API_KEY. It is NOT a thin reverse proxy, so we
# either point at a running Worker or leave the leg disabled. Never mock it.
CHAT_PROXY_TARGET="${SMITHERS_CHAT_PROXY_TARGET:-}"
if [[ -n "$CHAT_PROXY_TARGET" ]]; then
  echo "[dev-with-plue] /api/chat proxy: $CHAT_PROXY_TARGET"
elif [[ -n "${CEREBRAS_API_KEY:-}" ]]; then
  if [[ -t 0 ]]; then
    echo "[dev-with-plue] CEREBRAS_API_KEY is set but SMITHERS_CHAT_PROXY_TARGET is not."
    echo "[dev-with-plue] /api/chat needs a running Worker (e.g. \`pnpm cf:dev\`)."
    read -r -p "Enter the Worker URL for /api/chat (blank to skip chat): " CHAT_PROXY_TARGET || CHAT_PROXY_TARGET=""
    if [[ -n "$CHAT_PROXY_TARGET" ]]; then
      echo "[dev-with-plue] /api/chat proxy: $CHAT_PROXY_TARGET"
    else
      echo "[dev-with-plue] /api/chat will 404 in dev (chat tab disabled)."
    fi
  else
    echo "[dev-with-plue] CEREBRAS_API_KEY is set but SMITHERS_CHAT_PROXY_TARGET is not, and the shell is non-interactive." >&2
    echo "[dev-with-plue] /api/chat will 404 in dev. Export SMITHERS_CHAT_PROXY_TARGET to a running Worker URL to enable chat." >&2
  fi
else
  echo "[dev-with-plue] CEREBRAS_API_KEY unset — /api/chat will 404 in dev (chat tab disabled)."
  echo "[dev-with-plue] To enable chat: run \`pnpm cf:dev\` in another terminal and export SMITHERS_CHAT_PROXY_TARGET=<its URL>."
fi

# Boot vite in the background so we can probe the proxies before backgrounding
# control to the user. The cleanup trap kills vite (and any gateway we spawned)
# when the script exits or is signalled, so a failed proxy probe still tears
# everything down.
echo "[dev-with-plue] Starting vite on http://${SMITHERS_DEV_HOST}:${SMITHERS_DEV_PORT} …"
SMITHERS_AUTH_PROXY_TARGET="$PLUE_API_BASE_URL" \
SMITHERS_PLATFORM_PROXY_TARGET="$PLUE_API_BASE_URL" \
SMITHERS_GATEWAY_PROXY_TARGET="$GATEWAY_BASE_URL" \
SMITHERS_CHAT_PROXY_TARGET="$CHAT_PROXY_TARGET" \
  pnpm vite --host "$SMITHERS_DEV_HOST" --port "$SMITHERS_DEV_PORT" --strictPort &
VITE_PID=$!

# End-to-end probes — vite → proxy → backend, for each leg the user actually
# depends on at sign-in. A proxied request reaches a real backend and comes back
# as application/json; an unproxied path (wrong env var, dev-server with no
# proxy, stale `pnpm dev` squatting the port) falls through to the SPA and
# returns 200 text/html. Asserting the content-type is JSON — not merely a 2xx —
# is what defeats that "looks-running" false positive.
proxy_reaches_backend() {
  local ct
  ct="$(curl -s -o /dev/null --max-time 2 -w '%{content_type}' "$1" 2>/dev/null || true)"
  [[ "$ct" == application/json* ]]
}

# Plue leg: /api/user is proxied to Plue and answers JSON (401 without a token).
# /api/health is deliberately NOT probed through vite — vite does not proxy it,
# so it would fall through to the SPA and pass a naive 2xx check.
VITE_PLUE_PROBE_URL="http://${SMITHERS_DEV_HOST}:${SMITHERS_DEV_PORT}/api/user"
VITE_GATEWAY_PROBE_URL="http://${SMITHERS_DEV_HOST}:${SMITHERS_DEV_PORT}/health"

echo "[dev-with-plue] Waiting for vite + Plue proxy at $VITE_PLUE_PROBE_URL …"
plue_proxy_ready=false
for attempt in $(seq 1 60); do
  if proxy_reaches_backend "$VITE_PLUE_PROBE_URL"; then
    plue_proxy_ready=true
    break
  fi
  if ! kill -0 "$VITE_PID" 2>/dev/null; then
    echo "error: vite exited before the Plue proxy went green." >&2
    exit 4
  fi
  sleep 1
done
if [[ "$plue_proxy_ready" != "true" ]]; then
  echo "error: vite → Plue proxy did not reach Plue (got SPA/HTML, not JSON) at $VITE_PLUE_PROBE_URL within 60s." >&2
  echo "       Another process may be squatting port $SMITHERS_DEV_PORT (e.g. a bare \`pnpm dev\`)." >&2
  exit 5
fi

echo "[dev-with-plue] Waiting for vite + gateway proxy at $VITE_GATEWAY_PROBE_URL …"
gateway_proxy_ready=false
for attempt in $(seq 1 60); do
  if proxy_reaches_backend "$VITE_GATEWAY_PROBE_URL"; then
    gateway_proxy_ready=true
    break
  fi
  if ! kill -0 "$VITE_PID" 2>/dev/null; then
    echo "error: vite exited before the gateway proxy went green." >&2
    exit 4
  fi
  sleep 1
done
if [[ "$gateway_proxy_ready" != "true" ]]; then
  echo "error: vite → gateway proxy did not reach the gateway (got SPA/HTML, not JSON) at $VITE_GATEWAY_PROBE_URL within 60s." >&2
  exit 8
fi

echo "[dev-with-plue] Ready."
echo "[dev-with-plue]   Plue:    $PLUE_API_BASE_URL (proxied via vite /api/*)"
echo "[dev-with-plue]   Gateway: $GATEWAY_BASE_URL (proxied via vite /v1/rpc /health /workflows)"
if [[ -n "$CHAT_PROXY_TARGET" ]]; then
  echo "[dev-with-plue]   Chat:    $CHAT_PROXY_TARGET (proxied via vite /api/chat)"
else
  echo "[dev-with-plue]   Chat:    disabled (no Worker URL)"
fi
wait "$VITE_PID"
exit $?
