#!/bin/zsh
# Bundles the SwiftPM executable into a signed Munkel.app via Swift Bundler.
#
# Swift Bundler (pinned, built on demand by scripts/ensure-swift-bundler.sh)
# assembles the .app from Bundler.toml: it embeds the SwiftPM resource bundles
# (KeyboardShortcuts'), the Info.plist, and any dynamic libraries. The previous
# hand-rolled version copied only the executable and silently dropped the
# resource bundle, which crashed the app the moment its menu opened.
#
# Contract is unchanged, so build-release.sh / package.json / docs keep working:
#   $1                 build configuration: debug (default) | release
#   MUNKEL_VERSION     CFBundleShortVersionString (default 0.1.0)
#   MUNKEL_ARCHS       space-separated archs, e.g. "arm64 x86_64" (default: host)
#   CODESIGN_IDENTITY  signing identity ("-" = ad-hoc, the default)
# Output: .build/Munkel.app
set -euo pipefail

cd "$(dirname "$0")"
REPO_ROOT="$(cd ../.. && pwd)"

CONFIG="${1:-debug}"
BUNDLE=".build/Munkel.app"
VERSION="${MUNKEL_VERSION:-0.1.0}"
IDENTITY="${CODESIGN_IDENTITY:--}"

SWIFT_BUNDLER="$("$REPO_ROOT/scripts/ensure-swift-bundler.sh")"

# Inject the version through a throwaway config so the tracked Bundler.toml never
# carries a release-specific number (Swift Bundler has no --version override).
CONFIG_DIR="$(mktemp -d)"
trap 'rm -rf "$CONFIG_DIR"' EXIT
sed "s/^version = .*/version = \"$VERSION\"/" Bundler.toml > "$CONFIG_DIR/Bundler.toml"

# One --arch per requested architecture (none = host arch). The release passes
# "arm64 x86_64" for a universal build.
arch_flags=()
for arch in ${=MUNKEL_ARCHS:-}; do
  arch_flags+=(--arch "$arch")
done

"$SWIFT_BUNDLER" bundle \
  --config-file "$CONFIG_DIR/Bundler.toml" \
  --configuration "$CONFIG" \
  --scratch-path .build \
  "${arch_flags[@]}"

# Swift Bundler writes to .build/bundler/apps/Munkel/Munkel.app; move it to the
# path the rest of the pipeline (build-release.sh, README) expects.
rm -rf "$BUNDLE"
/usr/bin/ditto ".build/bundler/apps/Munkel/Munkel.app" "$BUNDLE"

# Swift Bundler ad-hoc signs; re-sign with our identity (hardened runtime +
# secure timestamp are notarization prerequisites) or a clean ad-hoc signature.
if [[ "$IDENTITY" == "-" ]]; then
  codesign --force --sign - "$BUNDLE" >/dev/null 2>&1 || true
else
  codesign --force --options runtime --timestamp --sign "$IDENTITY" "$BUNDLE"
fi

echo "built $BUNDLE ($VERSION)"
