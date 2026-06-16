#!/bin/bash
# Renders a single-entry Sparkle appcast for a published release. The file is
# uploaded as the `appcast.xml` GitHub release asset; the app's SUFeedURL points
# at munkel.app/appcast.xml, which 302-redirects to the latest release's asset
# (apps/landing/src/routes/appcast[.]xml.ts). Sparkle follows the redirect.
#
# EdDSA-signs the DMG with $SPARKLE_ED_PRIVATE_KEY — the private half of the
# SUPublicEDKey baked into the app (apps/macos/Bundler.toml). sign_update is the
# prebuilt tool from a pinned Sparkle release tarball, so there is no `swift run`
# and no Keychain dependency in CI.
#
# Usage: scripts/build-appcast.sh <version> <dmg-path> [outfile]
# Env:
#   SPARKLE_ED_PRIVATE_KEY  base64 EdDSA private key (required)
#   SPARKLE_VERSION         Sparkle tools version (default below) — keep in sync
#                           with the Sparkle SPM version in apps/macos/Package.swift
set -euo pipefail

VERSION="${1:?usage: build-appcast.sh <version> <dmg-path> [outfile]}"
DMG="${2:?usage: build-appcast.sh <version> <dmg-path> [outfile]}"
OUT="${3:-/dev/stdout}"
: "${SPARKLE_ED_PRIVATE_KEY:?SPARKLE_ED_PRIVATE_KEY not set}"
[[ -f "$DMG" ]] || { echo "dmg not found: $DMG" >&2; exit 1; }

SPARKLE_VERSION="${SPARKLE_VERSION:-2.9.3}"
MIN_OS="14.0"
DMG_URL="https://github.com/limehq/munkel/releases/download/v${VERSION}/Munkel-${VERSION}.dmg"
NOTES_URL="https://github.com/limehq/munkel/releases/tag/v${VERSION}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Prebuilt sign_update from the pinned Sparkle release (not the SPM artifact,
# which carries only the framework). Pin matches the linked Sparkle version.
curl -fsSL -o "$WORK/sparkle.tar.xz" \
  "https://github.com/sparkle-project/Sparkle/releases/download/${SPARKLE_VERSION}/Sparkle-${SPARKLE_VERSION}.tar.xz"
tar -xf "$WORK/sparkle.tar.xz" -C "$WORK"

# Private key to a 0600 file (read via --ed-key-file; never placed on argv where
# `ps` could read it). Removed right after signing.
KEYFILE="$WORK/ed_private_key"
( umask 077; printf '%s' "$SPARKLE_ED_PRIVATE_KEY" > "$KEYFILE" )

# Default output is the enclosure attributes verbatim: sparkle:edSignature="…"
# length="…" (length is the DMG's byte size). -p would print only the signature.
SIG_ATTRS="$("$WORK/bin/sign_update" --ed-key-file "$KEYFILE" "$DMG")"
rm -f "$KEYFILE"

PUBDATE="$(LC_ALL=C date -u '+%a, %d %b %Y %H:%M:%S +0000')"

# sparkle:version and sparkle:shortVersionString are both the SemVer: the build
# stamps CFBundleVersion == CFBundleShortVersionString == <version>, so Sparkle's
# default comparator compares clean SemVers. Keep them aligned if that ever
# changes (e.g. a separate monotonic build number).
cat > "$OUT" <<XML
<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>Munkel</title>
    <link>https://munkel.app/appcast.xml</link>
    <description>Munkel updates</description>
    <language>en</language>
    <item>
      <title>${VERSION}</title>
      <pubDate>${PUBDATE}</pubDate>
      <sparkle:version>${VERSION}</sparkle:version>
      <sparkle:shortVersionString>${VERSION}</sparkle:shortVersionString>
      <sparkle:minimumSystemVersion>${MIN_OS}</sparkle:minimumSystemVersion>
      <sparkle:releaseNotesLink>${NOTES_URL}</sparkle:releaseNotesLink>
      <enclosure url="${DMG_URL}" type="application/octet-stream" ${SIG_ATTRS} />
    </item>
  </channel>
</rss>
XML

echo "build-appcast: wrote appcast for $VERSION" >&2
