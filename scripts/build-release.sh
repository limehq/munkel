#!/bin/bash
# Assembles the universal release artifact for Homebrew distribution.
# Each app builds itself (`build:release` workspace scripts); this script
# only orchestrates: stage layout, Developer ID signing, ditto zip.
#
#   dist/stage/Munkel.app    universal menu-bar app   (apps/macos)
#   dist/stage/bin/munkel    universal Bun CLI        (apps/cli)
#   dist/Munkel-<ver>.zip    cask layout: `app "Munkel.app"` + `binary "bin/munkel"`
#
# Usage: scripts/build-release.sh <version>
#
# Env:
#   CODESIGN_IDENTITY  "Developer ID Application: ..." — when set, both
#                      binaries are signed with hardened runtime; unset
#                      builds stay ad-hoc signed (local smoke testing).
set -euo pipefail

VERSION="${1:?usage: build-release.sh <version>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
STAGE="$DIST/stage"
IDENTITY="${CODESIGN_IDENTITY:-}"

rm -rf "$DIST"
mkdir -p "$STAGE/bin"

cd "$ROOT"
bun install --frozen-lockfile

# Deliberately not routed through turbo: release artifacts must never come
# out of a cache, and the signing env stays out of the task graph.
(cd apps/macos && MUNKEL_VERSION="$VERSION" CODESIGN_IDENTITY="${IDENTITY:--}" bun run build:release)
(cd apps/cli && MUNKEL_VERSION="$VERSION" bun run build:release)

cp -R "$ROOT/apps/macos/.build/Munkel.app" "$STAGE/Munkel.app"
cp "$ROOT/apps/cli/dist/release/munkel" "$STAGE/bin/munkel"

if [[ -n "$IDENTITY" ]]; then
  codesign --force --options runtime --timestamp \
    --entitlements "$ROOT/apps/cli/entitlements.plist" \
    --sign "$IDENTITY" "$STAGE/bin/munkel"
  codesign --verify --deep --strict "$STAGE/Munkel.app"
  codesign --verify --strict "$STAGE/bin/munkel"
fi

# Smoke test: broken lipo/codesign/--define combinations fail right here.
STAMPED="$("$STAGE/bin/munkel" --version)"
[[ "$STAMPED" == "$VERSION" ]] \
  || { echo "version stamp mismatch: binary says '$STAMPED', expected '$VERSION'" >&2; exit 1; }

# ditto, not zip: preserves bundle structure and symlinks, which the
# notary scan requires. Zip root = Munkel.app + bin/ (the cask layout).
cd "$STAGE"
/usr/bin/ditto -c -k . "$DIST/Munkel-$VERSION.zip"

echo "built $DIST/Munkel-$VERSION.zip"
