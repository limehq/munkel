#!/bin/bash
# Renders the Homebrew cask for a published release (AeroSpace pattern).
# The output file is committed to the tap repo (limehq/homebrew-tap) as
# Casks/munkel.rb by the release workflow.
#
# Usage: scripts/build-brew-cask.sh <version> <sha256> [outfile]
set -euo pipefail

VERSION="${1:?usage: build-brew-cask.sh <version> <sha256> [outfile]}"
SHA256="${2:?usage: build-brew-cask.sh <version> <sha256> [outfile]}"
OUT="${3:-/dev/stdout}"

cat > "$OUT" <<CASK
cask "munkel" do
  version "$VERSION"
  sha256 "$SHA256"

  url "https://github.com/limehq/munkel/releases/download/v#{version}/Munkel-#{version}.dmg",
      verified: "github.com/limehq/munkel/"
  name "Munkel"
  desc "Ephemeral whispers that slide out of the MacBook notch"
  homepage "https://munkel.app/"

  livecheck do
    url :url
    strategy :github_latest
  end

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
