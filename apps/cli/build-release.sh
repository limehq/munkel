#!/bin/bash
# Builds the universal release CLI: two single-arch `bun build --compile`
# passes (Bun cannot emit fat binaries) merged with lipo, the version
# stamped in via --define. Output: dist/release/munkel
#
# Env:
#   MUNKEL_VERSION  version reported by `munkel --version` (default 0.0.0-dev)
set -euo pipefail

cd "$(dirname "$0")"

VERSION="${MUNKEL_VERSION:-0.0.0-dev}"

mkdir -p dist/release
for target in arm64 x64; do
  bun build src/munkel.ts --compile --target="bun-darwin-$target" \
    --define "MUNKEL_BUILD_VERSION=\"$VERSION\"" \
    --outfile "dist/release/munkel-$target"
done

lipo -create -output dist/release/munkel dist/release/munkel-arm64 dist/release/munkel-x64
lipo -archs dist/release/munkel | grep -q "x86_64 arm64\|arm64 x86_64" \
  || { echo "lipo did not produce a universal binary" >&2; exit 1; }

echo "built dist/release/munkel ($VERSION)"
