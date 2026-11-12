#!/usr/bin/env bash
set -euo pipefail
export BUN="${BUN:-/home/ubuntu/.npm/_npx/5c4f1b4a21be27f7/node_modules/@oven/bun-linux-x64-baseline/bin/bun}"
export PATH="$(dirname "$BUN"):${HOME}/.bun/bin:${PATH}"
export DISPLAY="${DISPLAY:-:1}"
# Prefer a concrete session-bus address so Electron Tray (StatusNotifierItem)
# can register with the XFCE panel. `autolaunch:` is rejected by Chromium.
if [[ -z "${DBUS_SESSION_BUS_ADDRESS:-}" || "${DBUS_SESSION_BUS_ADDRESS}" == "autolaunch:" ]]; then
  for f in "${HOME}/.dbus/session-bus/"*; do
    [[ -f "$f" ]] || continue
    # shellcheck disable=SC1090
    source "$f"
    break
  done
fi
if [[ -z "${DBUS_SESSION_BUS_ADDRESS:-}" || "${DBUS_SESSION_BUS_ADDRESS}" == "autolaunch:" ]]; then
  sock="$(find /tmp -maxdepth 1 -type s -name 'dbus-*' 2>/dev/null | head -1 || true)"
  if [[ -n "${sock}" ]]; then
    export DBUS_SESSION_BUS_ADDRESS="unix:path=${sock}"
  fi
fi
cd "$(dirname "$0")/.."
exec bun run dev
