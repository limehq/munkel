#!/bin/bash
# Renders the Homebrew cask for a published release (AeroSpace pattern).
# The output file is committed to the tap repo (limehq/homebrew-tap) as
# Casks/munkel.rb by the release workflow.
#
# The template is a QUOTED heredoc (`<<'CASK'`), so NO shell expansion happens
# inside it — backticks or $(…) in comments can never execute. (An earlier
# unquoted heredoc let a `brew upgrade` backtick in a comment run on the CI
# runner and inject its output into the cask, breaking `brew install`.) Only the
# explicit __VERSION__ / __SHA256__ placeholders are substituted afterwards.
#
# Usage: scripts/build-brew-cask.sh <version> <sha256> [outfile]
set -euo pipefail

VERSION="${1:?usage: build-brew-cask.sh <version> <sha256> [outfile]}"
SHA256="${2:?usage: build-brew-cask.sh <version> <sha256> [outfile]}"
OUT="${3:-/dev/stdout}"

cat <<'CASK' | sed -e "s|__VERSION__|${VERSION}|g" -e "s|__SHA256__|${SHA256}|g" > "$OUT"
cask "munkel" do
  version "__VERSION__"
  sha256 "__SHA256__"

  url "https://github.com/limehq/munkel/releases/download/v#{version}/Munkel-#{version}.dmg",
      verified: "github.com/limehq/munkel/"
  name "Munkel"
  desc "Ephemeral whispers that slide out of the MacBook notch"
  homepage "https://munkel.app/"

  livecheck do
    url :url
    strategy :github_latest
  end

  # Munkel self-updates via Sparkle; tell Homebrew not to fight the in-place
  # update (or flag the app as outdated after Sparkle has already updated it).
  auto_updates true

  depends_on macos: :sonoma

  app "Munkel.app"
  # The munkel CLI ships inside the app bundle; expose it on PATH for Homebrew
  # users. DMG users opt in from the app's "Install Command Line Tool" menu.
  binary "#{appdir}/Munkel.app/Contents/Resources/munkel"

  uninstall quit: "dev.uq.munkel"

  zap trash: [
    "~/Library/Application Support/Munkel",
    "~/Library/Preferences/dev.uq.munkel.plist",
    "~/Library/Saved Application State/dev.uq.munkel.savedState",
  ]
end
CASK
