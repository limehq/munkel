#!/bin/bash
# Packages the staged, signed + stapled Munkel.app into the drag-to-Applications
# DMG that the website links to and the Homebrew cask installs from.
#
# Uses hdiutil (not create-dmg) so it runs headless on CI with no extra
# dependency and no window-server/AppleScript step: the image is a plain folder
# holding Munkel.app beside an /Applications symlink — the classic "drag the app
# onto Applications" window.
#
# Run AFTER scripts/build-release.sh and stapling, so the .app inside carries
# its notarization ticket and launches offline once dragged out.
#
# Usage: scripts/build-dmg.sh <version>
set -euo pipefail

VERSION="${1:?usage: build-dmg.sh <version>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
APP="$DIST/stage/Munkel.app"
DMG="$DIST/Munkel-$VERSION.dmg"

[[ -d "$APP" ]] || { echo "missing $APP — run build-release.sh first" >&2; exit 1; }

# Lay out the image contents in a scratch dir: the app plus an Applications
# alias so the open DMG shows the drag target.
CONTENTS="$(mktemp -d)"
trap 'rm -rf "$CONTENTS"' EXIT
/usr/bin/ditto "$APP" "$CONTENTS/Munkel.app"
ln -s /Applications "$CONTENTS/Applications"

rm -f "$DMG"
hdiutil create \
  -volname "Munkel" \
  -srcfolder "$CONTENTS" \
  -fs HFS+ \
  -format UDZO \
  -ov \
  "$DMG"

echo "built $DMG"
