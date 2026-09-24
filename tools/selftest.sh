#!/usr/bin/env bash
# Run the Phaser-free engine self-test (src/core/selftest.ts) in headless Chromium.
#
# The suite imports from /src, so it needs the Vite dev server, not a build.
# It reports its verdict in document.title as selftest-PASS-<n> / selftest-FAIL-<n>.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${SELFTEST_PORT:-5173}"
URL="http://127.0.0.1:${PORT}/selftest.html"
CHROME="${CHROME:-/usr/bin/chromium}"

cd "$ROOT"

started_server=""
cleanup() {
  if [ -n "$started_server" ]; then
    kill "$started_server" 2>/dev/null
  fi
}
trap cleanup EXIT

if ! ss -ltn | grep -q ":${PORT} "; then
  echo "starting vite dev on ${PORT}…"
  npx vite dev --host 127.0.0.1 --port "$PORT" >/tmp/gemfall-selftest-dev.log 2>&1 &
  started_server=$!
  for _ in $(seq 1 30); do
    ss -ltn | grep -q ":${PORT} " && break
    sleep 1
  done
fi

if ! ss -ltn | grep -q ":${PORT} "; then
  echo "FAIL: dev server never came up on ${PORT}" >&2
  exit 2
fi

html="$("$CHROME" --headless --no-sandbox --disable-gpu --disable-dev-shm-usage \
  --virtual-time-budget=20000 --dump-dom "$URL" 2>/dev/null)"

title="$(printf '%s' "$html" | grep -oE 'selftest-(PASS|FAIL)-[0-9]+' | head -1)"
if [ -z "$title" ]; then
  echo "FAIL: self-test page produced no verdict (is chromium at ${CHROME}?)" >&2
  exit 2
fi

printf '%s' "$html" \
  | sed -e 's/<[^>]*>//g' \
  | grep -E '^(ALL PASS|FAILURES|FAIL |#)' | tail -20

case "$title" in
  selftest-PASS-*) echo "SELFTEST $title"; exit 0 ;;
  *)               echo "SELFTEST $title"; exit 1 ;;
esac
