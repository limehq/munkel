#!/usr/bin/env bash
# Renders public/og.png (1200x630 social card) from og.html via headless Chrome.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
chrome="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

"$chrome" --headless --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=1 --window-size=1200,630 \
  --screenshot="$here/../public/og.png" \
  --allow-file-access-from-files \
  "file://$here/og.html" >/dev/null 2>&1

echo "wrote apps/landing/public/og.png"
