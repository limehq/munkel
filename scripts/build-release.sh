#!/bin/bash
# Assembles the signed, notarization-ready Munkel.app for distribution.
#
# The munkel CLI is embedded INSIDE the app bundle (Contents/Resources/munkel)
# rather than shipped as a loose sibling binary, so one artifact serves every
# install path:
#
#   * Homebrew exposes the CLI automatically — the cask symlinks the embedded
#     binary onto PATH (see scripts/build-brew-cask.sh).
#   * Direct DMG users get the app only; they opt into the CLI from the app's
#     own "Install Command Line Tool" menu (Sources/MunkelApp/CLIInstaller.swift).
#
# The CLI is a companion to the app (it talks to the running app over a Unix
# socket and is useless on its own), so it has no standalone distribution.
#
# Layout produced:
#   dist/stage/Munkel.app                              universal app, signed
#   dist/stage/Munkel.app/Contents/Resources/munkel    universal Bun CLI
#   dist/Munkel-<ver>.zip                              app zipped for notarytool
#                                                      submission only — the
#                                                      published asset is the DMG
#                                                      (scripts/build-dmg.sh)
#
# Usage: scripts/build-release.sh <version>
#
# Env:
#   CODESIGN_IDENTITY  "Developer ID Application: ..." — when set, the embedded
#                      CLI and the app are signed inside-out with hardened
#                      runtime; unset stays ad-hoc signed (local smoke testing).
set -euo pipefail

VERSION="${1:?usage: build-release.sh <version>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
STAGE="$DIST/stage"
APP="$STAGE/Munkel.app"
IDENTITY="${CODESIGN_IDENTITY:-}"

rm -rf "$DIST"
mkdir -p "$STAGE"

cd "$ROOT"
bun install --frozen-lockfile

# Deliberately not routed through turbo: release artifacts must never come
# out of a cache, and the signing env stays out of the task graph.
(cd apps/macos && MUNKEL_VERSION="$VERSION" CODESIGN_IDENTITY="${IDENTITY:--}" bun run build:release)
(cd apps/cli && MUNKEL_VERSION="$VERSION" bun run build:release)

cp -R "$ROOT/apps/macos/.build/Munkel.app" "$APP"

# Embed the CLI as a bundle resource. It must be signed and sealed as part of
# the app, so copy it in BEFORE signing.
mkdir -p "$APP/Contents/Resources"
cp "$ROOT/apps/cli/dist/release/munkel" "$APP/Contents/Resources/munkel"
chmod +x "$APP/Contents/Resources/munkel"

# Sparkle.framework: Swift Bundler embeds it in Contents/Frameworks/ when the
# executable links it. Self-heal if a future bundler change ever drops it (copy
# from the SwiftPM artifacts and add the bundle rpath), then fail loudly rather
# than ship an app that dyld-crashes the moment it launches.
FW_DIR="$APP/Contents/Frameworks"
SPARKLE_FW="$FW_DIR/Sparkle.framework"
if [[ ! -d "$SPARKLE_FW" ]]; then
  echo "Sparkle.framework not embedded by Swift Bundler — copying from .build" >&2
  mkdir -p "$FW_DIR"
  SRC="$(/usr/bin/find "$ROOT/apps/macos/.build" -type d -name 'Sparkle.framework' 2>/dev/null | head -n1)"
  [[ -n "$SRC" ]] || { echo "could not locate Sparkle.framework under apps/macos/.build" >&2; exit 1; }
  /usr/bin/ditto "$SRC" "$SPARKLE_FW"
  # Sparkle's install name is @rpath/../Frameworks/Sparkle.framework/…, so the
  # resolving rpath is @executable_path (Swift Bundler normally adds it).
  /usr/bin/otool -l "$APP/Contents/MacOS/Munkel" | grep -q 'path @executable_path ' \
    || /usr/bin/install_name_tool -add_rpath "@executable_path" "$APP/Contents/MacOS/Munkel"
fi
[[ -d "$SPARKLE_FW" ]] || { echo "Sparkle.framework missing after embed step" >&2; exit 1; }

if [[ -n "$IDENTITY" ]]; then
  # Not sandboxed → Sparkle's XPC services are unused; drop them so there is
  # nothing extra to sign and notarize (Sparkle supports this for non-sandboxed
  # apps). Done only on the signed path so a plain ad-hoc build keeps Swift
  # Bundler's framework seal intact.
  rm -rf "$SPARKLE_FW/Versions/B/XPCServices"

  # Inside-out signing: every nested code item is signed first, then the outer
  # bundle WITHOUT --deep — so the app seal records those signatures instead of
  # clobbering them. Sparkle's helpers and the CLI's JIT entitlements both rely
  # on this; --deep would re-sign (and break) the framework's nested helpers.
  codesign --force --options runtime --timestamp \
    --sign "$IDENTITY" "$SPARKLE_FW/Versions/B/Autoupdate"
  codesign --force --options runtime --timestamp \
    --sign "$IDENTITY" "$SPARKLE_FW/Versions/B/Updater.app"
  codesign --force --options runtime --timestamp \
    --sign "$IDENTITY" "$SPARKLE_FW"
  # The embedded munkel CLI (its own JIT entitlements), then the outer bundle.
  codesign --force --options runtime --timestamp \
    --entitlements "$ROOT/apps/cli/entitlements.plist" \
    --sign "$IDENTITY" "$APP/Contents/Resources/munkel"
  codesign --force --options runtime --timestamp \
    --sign "$IDENTITY" "$APP"
  codesign --verify --deep --strict "$APP"
  codesign --verify --strict "$APP/Contents/Resources/munkel"
  codesign --verify --strict "$SPARKLE_FW"
fi

# Smoke test: broken lipo/codesign/--define combinations fail right here.
STAMPED="$("$APP/Contents/Resources/munkel" --version)"
[[ "$STAMPED" == "$VERSION" ]] \
  || { echo "version stamp mismatch: binary says '$STAMPED', expected '$VERSION'" >&2; exit 1; }

# ditto, not zip: preserves the bundle structure and symlinks the notary scan
# requires. This zip is only the notarytool submission container; the published
# artifact is the DMG (scripts/build-dmg.sh).
cd "$STAGE"
/usr/bin/ditto -c -k --keepParent "Munkel.app" "$DIST/Munkel-$VERSION.zip"

echo "built $APP and $DIST/Munkel-$VERSION.zip"
