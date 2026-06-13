#!/bin/zsh
# Wraps the SPM-built binary into a minimal .app bundle so macOS treats it
# as a real menu-bar app (status item, stable UserDefaults domain, TCC).
#
# Env overrides (all optional, defaults preserve local dev behavior):
#   MUNKEL_VERSION     CFBundleShortVersionString (default 0.1.0)
#   MUNKEL_ARCHS       space-separated archs for a universal build,
#                      e.g. "arm64 x86_64" (default: host arch only)
#   CODESIGN_IDENTITY  signing identity (default "-" = ad-hoc; release
#                      builds pass "Developer ID Application: ...")
set -euo pipefail

cd "$(dirname "$0")"

CONFIG="${1:-debug}"
BUNDLE=".build/Munkel.app"
VERSION="${MUNKEL_VERSION:-0.1.0}"
IDENTITY="${CODESIGN_IDENTITY:--}"

ARCH_FLAGS=()
for arch in ${=MUNKEL_ARCHS:-}; do
  ARCH_FLAGS+=(--arch "$arch")
done

swift build -c "$CONFIG" "${ARCH_FLAGS[@]}"
# With --arch flags SPM routes through XCBuild and the product lands in
# .build/apple/Products/ instead of .build/<config>/ — resolve either way.
BIN_PATH="$(swift build -c "$CONFIG" "${ARCH_FLAGS[@]}" --show-bin-path)"

rm -rf "$BUNDLE"
mkdir -p "$BUNDLE/Contents/MacOS"

cp "$BIN_PATH/munkel" "$BUNDLE/Contents/MacOS/Munkel"

cat > "$BUNDLE/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleExecutable</key>
	<string>Munkel</string>
	<key>CFBundleIdentifier</key>
	<string>dev.uq.munkel</string>
	<key>CFBundleName</key>
	<string>Munkel</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>CFBundleShortVersionString</key>
	<string>${VERSION}</string>
	<key>LSMinimumSystemVersion</key>
	<string>14.0</string>
	<key>LSUIElement</key>
	<true/>
	<key>NSHighResolutionCapable</key>
	<true/>
</dict>
</plist>
PLIST

if [[ "$IDENTITY" == "-" ]]; then
  codesign --force --sign - "$BUNDLE" >/dev/null 2>&1 || true
else
  # Hardened runtime + secure timestamp are notarization prerequisites.
  codesign --force --options runtime --timestamp --sign "$IDENTITY" "$BUNDLE"
fi

echo "built $BUNDLE ($VERSION)"
