#!/usr/bin/env bash
# Relaunch the user's browser with a Chrome DevTools Protocol port, so an agent can drive it
# with the user's real Google sessions. macOS only. ASK THE USER FIRST: quitting closes their tabs.
#
#   browser-debug.sh status            # is a CDP port already open? which browsers are installed?
#   browser-debug.sh start [Browser]   # quit + relaunch with --remote-debugging-port (default: first found)
#   browser-debug.sh stop  [Browser]   # quit + relaunch normally (closes the debug port)
#
# Env: CDP_PORT (default 9222)
set -euo pipefail
PORT="${CDP_PORT:-9222}"
CANDIDATES=("Brave Browser" "Google Chrome" "Microsoft Edge" "Arc" "Chromium")

installed() { [ -d "/Applications/$1.app" ] || [ -d "$HOME/Applications/$1.app" ]; }
cdp_up() { curl -s --max-time 1 "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; }

pick() {
  if [ -n "${1:-}" ]; then echo "$1"; return; fi
  for b in "${CANDIDATES[@]}"; do installed "$b" && { echo "$b"; return; }; done
  echo "No Chromium-based browser found" >&2; exit 1
}

quit_browser() {
  osascript -e "tell application \"$1\" to quit" >/dev/null 2>&1 || true
  for _ in $(seq 1 20); do pgrep -xq "$1" || return 0; sleep 1; done
  echo "Could not quit $1. Ask the user to quit it (Cmd+Q)." >&2; exit 1
}

case "${1:-status}" in
  status)
    if cdp_up; then echo "CDP_UP port=$PORT"; curl -s "http://127.0.0.1:$PORT/json/version" | grep '"Browser"'; else echo "CDP_DOWN port=$PORT"; fi
    for b in "${CANDIDATES[@]}"; do installed "$b" && echo "installed: $b"; done
    ;;
  start)
    B="$(pick "${2:-}")"
    if cdp_up; then echo "CDP_UP port=$PORT (already)"; exit 0; fi
    quit_browser "$B"
    open -a "$B" --args --remote-debugging-port="$PORT"
    for _ in $(seq 1 15); do cdp_up && { echo "CDP_UP port=$PORT browser=$B profile=default"; exit 0; }; sleep 1; done
    # Recent Google Chrome refuses remote debugging on the default profile. Fall back to a separate
    # profile; the user must sign in to Google there once.
    PROFILE="$HOME/.config/google-health/browser-profile"
    mkdir -p "$PROFILE"
    quit_browser "$B"
    open -na "$B" --args --remote-debugging-port="$PORT" --user-data-dir="$PROFILE"
    for _ in $(seq 1 15); do cdp_up && { echo "CDP_UP port=$PORT browser=$B profile=separate (user must sign in to Google in this window)"; exit 0; }; sleep 1; done
    echo "CDP_FAILED: could not open a debug port on $B" >&2; exit 1
    ;;
  stop)
    B="$(pick "${2:-}")"
    quit_browser "$B"
    open -a "$B"
    echo "Relaunched $B without a debug port."
    ;;
  *) sed -n '2,9p' "$0"; exit 1 ;;
esac
