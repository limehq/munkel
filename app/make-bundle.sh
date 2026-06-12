#!/bin/zsh
# Wraps the SPM-built binary into a minimal .app bundle so macOS treats it
# as a real menu-bar app (status item, stable UserDefaults domain, TCC).
set -euo pipefail

cd "$(dirname "$0")"

CONFIG="${1:-debug}"
BUNDLE=".build/Munkel.app"

swift build -c "$CONFIG"

rm -rf "$BUNDLE"
mkdir -p "$BUNDLE/Contents/MacOS"

cp ".build/$CONFIG/munkel" "$BUNDLE/Contents/MacOS/Munkel"

cat > "$BUNDLE/Contents/Info.plist" <<'PLIST'
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
	<string>0.1.0</string>
	<key>LSMinimumSystemVersion</key>
	<string>14.0</string>
	<key>LSUIElement</key>
	<true/>
	<key>NSHighResolutionCapable</key>
	<true/>
</dict>
</plist>
PLIST

codesign --force --sign - "$BUNDLE" >/dev/null 2>&1 || true

echo "built $BUNDLE"
