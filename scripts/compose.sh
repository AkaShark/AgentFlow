#!/usr/bin/env bash
# AgentFlow container engine wrapper.
# Detects docker / podman in this order, then forwards all args to its compose subcommand.
#
# Usage:
#   scripts/compose.sh up -d
#   scripts/compose.sh down
#   scripts/compose.sh logs -f server
#
# Override detection with AGENTFLOW_ENGINE=docker|podman|podman-compose
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/../docker/docker-compose.yml"

ENGINE="${AGENTFLOW_ENGINE:-}"

if [[ -z "$ENGINE" ]]; then
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    ENGINE="docker"
  elif command -v podman >/dev/null 2>&1 && podman compose version >/dev/null 2>&1; then
    ENGINE="podman"
  elif command -v podman-compose >/dev/null 2>&1; then
    ENGINE="podman-compose"
  else
    echo "[agentflow] No container engine found." >&2
    echo "  Install one of: docker (with compose plugin), podman 4+, or podman-compose." >&2
    exit 1
  fi
fi

case "$ENGINE" in
  docker)
    echo "[agentflow] using: docker compose"
    exec docker compose -f "$COMPOSE_FILE" "$@"
    ;;
  podman)
    echo "[agentflow] using: podman compose"
    exec podman compose -f "$COMPOSE_FILE" "$@"
    ;;
  podman-compose)
    echo "[agentflow] using: podman-compose"
    exec podman-compose -f "$COMPOSE_FILE" "$@"
    ;;
  *)
    echo "[agentflow] Unknown AGENTFLOW_ENGINE='$ENGINE' (expected: docker | podman | podman-compose)" >&2
    exit 1
    ;;
esac
