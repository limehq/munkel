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
# Release notes are embedded inline as the item <description> (release-please's
# changelog, rendered to HTML), so Sparkle's update dialog shows just the
# changelog instead of loading the whole GitHub release page. Needs `gh` +
# GH_TOKEN; falls back to a <sparkle:releaseNotesLink> if unavailable.
#
# Usage: scripts/build-appcast.sh <version> <dmg-path> [outfile]
# Env:
#   SPARKLE_ED_PRIVATE_KEY  base64 EdDSA private key (required)
#   GH_TOKEN                token for `gh` (release body + markdown render) — set
#                           to ${{ github.token }} in CI; optional locally
#   SPARKLE_VERSION         Sparkle tools version (default below) — keep in sync
#                           with the Sparkle SPM version in apps/macos/Package.swift
set -euo pipefail

VERSION="${1:?usage: build-appcast.sh <version> <dmg-path> [outfile]}"
DMG="${2:?usage: build-appcast.sh <version> <dmg-path> [outfile]}"
OUT="${3:-/dev/stdout}"
: "${SPARKLE_ED_PRIVATE_KEY:?SPARKLE_ED_PRIVATE_KEY not set}"
[[ -f "$DMG" ]] || { echo "dmg not found: $DMG" >&2; exit 1; }

REPO="limehq/munkel"
SPARKLE_VERSION="${SPARKLE_VERSION:-2.9.3}"
MIN_OS="14.0"
DMG_URL="https://github.com/${REPO}/releases/download/v${VERSION}/Munkel-${VERSION}.dmg"
NOTES_URL="https://github.com/${REPO}/releases/tag/v${VERSION}"

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

# Release notes → inline <description>. Render the GitHub release body (the
# release-please changelog) through GitHub's markdown API, wrap it in a small
# dark-mode-aware HTML document, and embed it as CDATA. Anything missing (no
# token, release object not created yet for a manual-tag build) degrades to the
# release-page link rather than failing the build.
notes_element="<sparkle:releaseNotesLink>${NOTES_URL}</sparkle:releaseNotesLink>"
notes_md="$(gh release view "v${VERSION}" --repo "$REPO" --json body -q .body 2>/dev/null || true)"
if [[ -n "$notes_md" ]]; then
  notes_rendered="$(printf '%s' "$notes_md" \
    | gh api --method POST /markdown -F text=@- -f mode=gfm -f context="$REPO" 2>/dev/null || true)"
  if [[ -n "$notes_rendered" ]]; then
    style='body{font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif;font-size:13px;line-height:1.55;margin:0;padding:12px 16px}h1,h2,h3{font-weight:600;line-height:1.3;margin:.9em 0 .35em}h2{font-size:1.15em}h3{font-size:1em;opacity:.85}h2:first-child,h3:first-child{margin-top:0}ul{padding-left:1.25em;margin:.3em 0}li{margin:.2em 0}a{color:#2f81f7;text-decoration:none}code{font-family:ui-monospace,SFMono-Regular,monospace;font-size:.9em}'
    notes_html="<!DOCTYPE html><html><head><meta charset=\"utf-8\"><meta name=\"color-scheme\" content=\"light dark\"><style>${style}</style></head><body>${notes_rendered}</body></html>"
    notes_element="<description><![CDATA[${notes_html}]]></description>"
  fi
fi

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
      ${notes_element}
      <enclosure url="${DMG_URL}" type="application/octet-stream" ${SIG_ATTRS} />
    </item>
  </channel>
</rss>
XML

echo "build-appcast: wrote appcast for $VERSION" >&2
