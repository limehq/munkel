#!/usr/bin/env bash
# e2e-local.sh — stand up a local end-to-end Munkel rig on ONE Mac to exercise
# the CLI ↔ app ↔ relay ↔ notch path (Schicht 2/3 of the test plan).
#
# The release app and the dev app have distinct bundle ids, identities, and
# control sockets, so they run side by side as TWO peers. Point both at a local
# relay and join them to the same circle and you can watch `munkel dm <name>`
# light up the other app's notch — no second machine needed.
#
# Usage:
#   scripts/e2e-local.sh check      # verify prerequisites (safe, no side effects)
#   scripts/e2e-local.sh up         # relay + both apps, pointed at the local relay
#   scripts/e2e-local.sh down       # tear it all down
#
# After `up`: join both apps to the same circle (e.g. blue-table-42) in their
# menus, then:
#   munkel circles                         # release app sees the dev app as a member
#   munkel dm <dev-app-name> "hi"          # dev app's notch lights up
#   MUNKEL_DEV=1 bun apps/cli/src/munkel.ts dm <release-app-name> "yo"
#   scripts/simulate-whispers.sh blue-table-42 Sim   # a third, simulated member
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELAY_URL="${RELAY_URL:-ws://127.0.0.1:8787}"
RELAY_PORT="${RELAY_PORT:-8787}"
MACOS="$REPO_ROOT/apps/macos"
REL_APP="$MACOS/.build/Munkel.app"
DEV_APP="$MACOS/.build/MunkelDev.app"
RELAY_PID="/tmp/munkel-e2e-relay.pid"

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; }
info() { printf '\033[1m%s\033[0m\n' "$1"; }

cmd_check() {
  local fail=0
  info "Prerequisites"
  command -v bun >/dev/null 2>&1 && ok "bun on PATH" || { bad "bun missing"; fail=1; }
  command -v open >/dev/null 2>&1 && ok "open (macOS)" || { bad "not macOS?"; fail=1; }
  command -v launchctl >/dev/null 2>&1 && ok "launchctl" || { bad "launchctl missing"; fail=1; }

  info "Build artifacts (run: cd apps/macos && ./make-bundle.sh release && ./make-bundle.sh debug)"
  [ -d "$REL_APP" ] && ok "release app  $REL_APP" || { bad "missing $REL_APP"; fail=1; }
  [ -d "$DEV_APP" ] && ok "dev app      $DEV_APP" || { bad "missing $DEV_APP"; fail=1; }

  info "Relay (apps/server, wrangler dev on :$RELAY_PORT)"
  [ -f "$REPO_ROOT/apps/server/package.json" ] && ok "apps/server present" || { bad "no apps/server"; fail=1; }
  if lsof -i ":$RELAY_PORT" >/dev/null 2>&1; then ok "something already listening on :$RELAY_PORT"; else info "  (relay not running yet — 'up' will start it)"; fi

  info "Helpers"
  [ -x "$REPO_ROOT/scripts/simulate-whispers.sh" ] && ok "simulate-whispers.sh" || bad "simulate-whispers.sh not executable"
  [ -f "$REPO_ROOT/apps/cli/src/munkel.ts" ] && ok "CLI source" || { bad "CLI source missing"; fail=1; }

  [ "$fail" -eq 0 ] && info "READY — run: scripts/e2e-local.sh up" || { info "NOT READY — fix the ✗ above"; return 1; }
}

cmd_up() {
  info "Pointing GUI apps at the local relay ($RELAY_URL)"
  launchctl setenv MUNKEL_RELAY_URL "$RELAY_URL"; ok "launchctl setenv MUNKEL_RELAY_URL"

  if ! lsof -i ":$RELAY_PORT" >/dev/null 2>&1; then
    info "Starting relay (wrangler dev)…"
    ( cd "$REPO_ROOT/apps/server" && nohup bun run dev >/tmp/munkel-e2e-relay.log 2>&1 & echo $! >"$RELAY_PID" )
    for _ in $(seq 1 60); do lsof -i ":$RELAY_PORT" >/dev/null 2>&1 && break; sleep 0.5; done
    lsof -i ":$RELAY_PORT" >/dev/null 2>&1 && ok "relay up on :$RELAY_PORT" || { bad "relay didn't come up — see /tmp/munkel-e2e-relay.log"; return 1; }
  else
    ok "relay already on :$RELAY_PORT"
  fi

  info "Launching both apps (two peers)…"
  open "$REL_APP"; ok "release app"
  open "$DEV_APP"; ok "dev app"

  cat <<EOF

Next:
  1. In BOTH menu-bar apps, join the same circle (e.g. blue-table-42).
  2. munkel circles                          # should list the other app as a member
  3. munkel dm <other-display-name> "hi"     # the other app's notch slides out
  4. scripts/simulate-whispers.sh blue-table-42 Sim   # optional simulated member
Tear down with: scripts/e2e-local.sh down
EOF
}

cmd_down() {
  info "Tearing down"
  launchctl unsetenv MUNKEL_RELAY_URL && ok "unset MUNKEL_RELAY_URL" || true
  osascript -e 'quit app "Munkel"'    2>/dev/null && ok "quit Munkel"    || true
  osascript -e 'quit app "MunkelDev"' 2>/dev/null && ok "quit MunkelDev" || true
  if [ -f "$RELAY_PID" ]; then kill "$(cat "$RELAY_PID")" 2>/dev/null && ok "stopped relay" || true; rm -f "$RELAY_PID"; fi
  pkill -f 'wrangler dev' 2>/dev/null || true
}

case "${1:-check}" in
  check) cmd_check ;;
  up)    cmd_up ;;
  down)  cmd_down ;;
  *) echo "usage: $0 {check|up|down}" >&2; exit 64 ;;
esac
