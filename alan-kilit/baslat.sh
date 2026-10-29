#!/usr/bin/env bash
# Alan Kilit — Linux / macOS başlatma
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js bulunamadı. Node 18+ kur: https://nodejs.org/" >&2
  exit 1
fi

PORT="${PORT:-8090}"
export PORT

SCHEME="http"
if [ -f certs/server.pfx ] || { [ -f certs/server.key ] && [ -f certs/server.crt ]; }; then
  SCHEME="https"
fi
URL="${SCHEME}://localhost:${PORT}"

if [ "$(uname -s)" = "Darwin" ] && command -v open >/dev/null 2>&1; then
  ( sleep 2; open "$URL" >/dev/null 2>&1 || true ) &
elif command -v xdg-open >/dev/null 2>&1; then
  ( sleep 2; xdg-open "$URL" >/dev/null 2>&1 || true ) &
fi

exec node server.js
