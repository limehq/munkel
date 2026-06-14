#!/bin/bash
# Builds a pinned Swift Bundler and prints the path to its binary on stdout.
#
# Swift Bundler turns the SwiftPM executable into a real .app — embedding the
# SwiftPM resource bundles, the Info.plist, and any dynamic libraries — which
# the previous hand-rolled bundler silently dropped (crashing the app the moment
# its menu opened). It has no usable tagged release (the newest tag predates the
# Bundler.toml format), so we pin a reviewed commit on main and build from
# source. The build is cached under the user cache dir, so only the first run on
# a machine (and CI's first release on the self-hosted runner) pays the compile.
#
# All diagnostics go to stderr; stdout is exactly the binary path, so callers do:
#   SWIFT_BUNDLER="$(scripts/ensure-swift-bundler.sh)"
set -euo pipefail

PIN="59a150488e92beb049d775736047e62d5be23323"
REPO="https://github.com/moreSwift/swift-bundler"

CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/munkel/swift-bundler/$PIN"
BIN="$CACHE_DIR/swift-bundler"

if [[ -x "$BIN" ]]; then
  echo "$BIN"
  exit 0
fi

echo "ensure-swift-bundler: building pinned Swift Bundler ${PIN:0:12} (first run on this machine)…" >&2
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
git -C "$work" init -q
git -C "$work" remote add origin "$REPO"
# Fetch only the pinned commit (GitHub allows fetching a SHA directly).
git -C "$work" fetch -q --depth 1 origin "$PIN"
git -C "$work" checkout -q FETCH_HEAD
swift build --package-path "$work" -c release >&2
mkdir -p "$CACHE_DIR"
cp "$work/.build/release/swift-bundler" "$BIN"
echo "$BIN"
