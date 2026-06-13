#!/usr/bin/env bash
# simulate-whispers.sh — run a simulated circle member that whispers you a
# message on a fixed interval, so the Munkel notch lights up on a schedule.
#
# It acts as a second member of a circle (default blue-table-42), connects to
# the same relay as the running Munkel app, and on every tick sends one
# encrypted chat via apps/server/scripts/dev-send.ts (the protocol reference
# sender). With the app running and joined to the circle, each whisper slides
# out of the notch.
#
# Prerequisites (the script checks the first two):
#   - bun on PATH
#   - the relay running          (cd apps/server && bun run dev)
#   - the Munkel app running and joined to $CIRCLE on the same relay
#
# Usage:
#   scripts/simulate-whispers.sh [circle] [sender-name]
#
# Env overrides:
#   INTERVAL    seconds between whispers (default 30)
#   RELAY_URL   relay websocket          (default ws://127.0.0.1:8787)
#   CIRCLE      circle code              (default blue-table-42)
#   SENDER      simulated sender name    (default Sim)
#   TO          recipient memberId for a direct whisper. When unset the script
#               auto-discovers the local Munkel app's own memberId from its
#               UserDefaults and whispers you directly; if that is unavailable
#               it falls back to a circle broadcast (which you still see).
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dev_send="$repo_root/apps/server/scripts/dev-send.ts"

INTERVAL="${INTERVAL:-30}"
RELAY_URL="${RELAY_URL:-ws://127.0.0.1:8787}"
CIRCLE="${1:-${CIRCLE:-blue-table-42}}"
SENDER="${2:-${SENDER:-Sim}}"

command -v bun >/dev/null 2>&1 || { echo "simulate: bun not found on PATH" >&2; exit 1; }
[[ -f "$dev_send" ]] || { echo "simulate: missing $dev_send" >&2; exit 1; }

# Direct-whisper target: explicit TO wins, else the local app's own
# installation memberId from its UserDefaults — i.e. you, whoever is signed in
# on this machine (empty string => broadcast in dev-send).
to="${TO:-}"
if [[ -z "$to" ]]; then
  to="$(defaults read dev.uq.munkel memberId 2>/dev/null || true)"
fi
target_desc="circle broadcast"
[[ -n "$to" ]] && target_desc="direct whisper → ${to}"

# Rotating lines so the stream feels alive rather than a repeated ping.
lines=(
  "Kaffee? ☕️"
  "Bin am Tisch in der Ecke"
  "Schau mal aus dem Fenster 🌅"
  "Noch 5 Minuten ⏳"
  "Lust auf Mittag?"
  "Das Meeting ist verschoben"
  "👀 hinter dir"
  "Frohes Flüstern!"
  "Gut geschlafen?"
  "Tick vom Simulator"
)

n=0
# INT/TERM must exit (a trap that only prints would let the loop run on,
# ignoring Ctrl-C). The EXIT trap prints the summary exactly once.
trap 'exit 0' INT TERM
trap 'printf "\nsimulate: stopped after %d whisper(s).\n" "$n"' EXIT

printf 'simulate: "%s" whispers you in [%s] every %ss (%s)\n' \
  "$SENDER" "$CIRCLE" "$INTERVAL" "$target_desc"
printf 'simulate: relay %s — Ctrl-C to stop\n' "$RELAY_URL"

while true; do
  n=$((n + 1))
  msg="${lines[$(((n - 1) % ${#lines[@]}))]} (#$n)"
  printf '[%s] simulate -> whisper #%d: %s\n' "$(date +%H:%M:%S)" "$n" "$msg"
  if ! MEMBER_ID="sim-peer" TO="$to" RELAY_URL="$RELAY_URL" \
       bun "$dev_send" "$CIRCLE" "$SENDER" "$msg" >/tmp/munkel-sim-last.log 2>&1; then
    printf '[%s] simulate: send failed — relay up? app joined to %s? (see /tmp/munkel-sim-last.log)\n' \
      "$(date +%H:%M:%S)" "$CIRCLE" >&2
  fi
  sleep "$INTERVAL"
done
