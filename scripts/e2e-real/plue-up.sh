#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PLUE_DIR="${PLUE_DIR:-$REPO_ROOT/../plue}"
PLUE_API_BASE_URL="${PLUE_API_BASE_URL:-http://127.0.0.1:4000}"
HEALTH_URL="$PLUE_API_BASE_URL/api/health"

usage() {
  echo "usage: $0 [down|status]" >&2
}

require_plue_dir() {
  if [[ ! -d "$PLUE_DIR" ]]; then
    echo "error: PLUE_DIR=$PLUE_DIR does not exist." >&2
    exit 10
  fi
  if [[ ! -f "$PLUE_DIR/docker-compose.yml" && ! -f "$PLUE_DIR/compose.yml" && ! -f "$PLUE_DIR/compose.yaml" ]]; then
    echo "error: no compose file found in PLUE_DIR=$PLUE_DIR." >&2
    exit 11
  fi
}

compose() {
  (cd "$PLUE_DIR" && docker compose "$@")
}

wait_for_health() {
  echo "[plue-up] Waiting for Plue health at $HEALTH_URL ..."
  for attempt in $(seq 1 180); do
    if curl -fsS --max-time 2 "$HEALTH_URL" >/dev/null 2>&1; then
      echo "[plue-up] Plue is healthy."
      return 0
    fi
    sleep 1
    if [[ "$attempt" -eq 180 ]]; then
      echo "error: Plue /api/health did not respond at $HEALTH_URL within 180s." >&2
      return 1
    fi
  done
}

ACTION="${1:-up}"

case "$ACTION" in
  up)
    require_plue_dir
    echo "[plue-up] Bringing up Plue stack from $PLUE_DIR ..."
    compose up -d postgres migrate seed repo-host api || exit 20
    wait_for_health || exit 30
    exec sleep 2147483647
    ;;
  down)
    require_plue_dir
    compose down || exit 40
    ;;
  status)
    require_plue_dir
    compose ps || exit 50
    ;;
  *)
    usage
    exit 12
    ;;
esac
