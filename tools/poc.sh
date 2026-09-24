#!/usr/bin/env bash
# Host the GEMFALL POC from this laptop on the LAN.
#
#   tools/poc.sh start    build dist, then serve it on 0.0.0.0:4173
#   tools/poc.sh stop     stop the server
#   tools/poc.sh status   show whether it is up and on which URLs
#   tools/poc.sh restart  stop + start
#
# `start` always rebuilds: serving a stale dist/ silently ships pre-fix code.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${POC_PORT:-4173}"
PIDFILE="/tmp/gemfall-poc.pid"
LOG="/tmp/gemfall-poc.log"

cd "$ROOT"

lan_ip() {
  hostname -I 2>/dev/null | awk '{print $1}'
}

listener_pid() {
  ss -ltnp 2>/dev/null | grep ":${PORT} " | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2
}

is_up() {
  [ -n "$(listener_pid)" ]
}

do_stop() {
  local pid
  pid="$(listener_pid)"
  if [ -n "$pid" ]; then
    kill "$pid" 2>/dev/null
    for _ in $(seq 1 15); do
      is_up || break
      sleep 0.3
    done
    is_up && kill -9 "$pid" 2>/dev/null
    echo "stopped pid ${pid} on port ${PORT}"
  else
    echo "nothing listening on port ${PORT}"
  fi
  rm -f "$PIDFILE"
}

do_start() {
  if is_up; then
    echo "already running on port ${PORT}; run 'tools/poc.sh restart' to refresh"
    do_status
    return 0
  fi

  echo "building dist…"
  if ! npm run build >/tmp/gemfall-poc-build.log 2>&1; then
    echo "FAIL: build failed (see /tmp/gemfall-poc-build.log)" >&2
    tail -20 /tmp/gemfall-poc-build.log >&2
    return 1
  fi
  grep -E 'dist/(index|assets)' /tmp/gemfall-poc-build.log

  # BACKGROUND process_type is unavailable here, so detach explicitly: the server
  # must outlive the shell that started it.
  setsid nohup npx vite preview --host 0.0.0.0 --port "$PORT" >"$LOG" 2>&1 </dev/null &
  echo $! >"$PIDFILE"

  for _ in $(seq 1 40); do
    is_up && break
    sleep 0.5
  done

  if ! is_up; then
    echo "FAIL: server did not start (see ${LOG})" >&2
    tail -20 "$LOG" >&2
    return 1
  fi

  local asset
  asset="$(curl -fsS "http://127.0.0.1:${PORT}/" | grep -oE 'assets/[^"]+\.js' | head -1)"
  echo "serving ${asset:-<unknown asset>}"
  do_status
}

do_status() {
  if is_up; then
    echo "GEMFALL POC is UP on port ${PORT}:"
    echo "  http://localhost:${PORT}/"
    local ip; ip="$(lan_ip)"
    [ -n "$ip" ] && echo "  http://${ip}:${PORT}/   (LAN)"
  else
    echo "GEMFALL POC is DOWN (port ${PORT} not listening)"
    return 1
  fi
}

case "${1:-status}" in
  start)   do_start ;;
  stop)    do_stop ;;
  restart) do_stop; do_start ;;
  status)  do_status ;;
  *)       echo "usage: tools/poc.sh {start|stop|restart|status}" >&2; exit 2 ;;
esac
