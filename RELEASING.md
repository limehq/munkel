# Releasing Munkel

Two install paths, **one artifact**: the `munkel` CLI is embedded inside the
app bundle (`Munkel.app/Contents/Resources/munkel`), so there is nothing
separate to download or version:

```sh
brew install limehq/tap/munkel      # taps automatically, installs app + CLI
```

The cask puts `Munkel.app` into `/Applications` and symlinks the embedded
`munkel` CLI into `$(brew --prefix)/bin` (the `binary` stanza points at the
binary inside the bundle).

Direct download: the `Munkel-<version>.dmg` release asset is a classic
drag-to-Applications image. It carries the CLI too, but inert: DMG users put
`munkel` on their PATH from the app's **Install Command Line Tool…** menu
(`Sources/MunkelApp/CLIInstaller.swift`), which symlinks the embedded binary
into `/usr/local/bin` after one admin prompt. The CLI talks to the running app
over a Unix socket, so it is useless without the app either way, hence no
standalone CLI distribution.

## Versioning

One **SemVer product version** for the whole artifact: app and embedded CLI
ship together in one bundle and are version-locked by design (the CLI talks to
the app's control socket), so they never get separate numbers. The
**git tag is the single source of truth**; nothing is hardcoded:

| Where the number lands | How it gets there |
|---|---|
| `Munkel-<version>.dmg` | release workflow, from the tag |
| `Munkel.app` → `CFBundleShortVersionString` | `make-bundle.sh` via `MUNKEL_VERSION` |
| `munkel --version` | `bun build --define MUNKEL_BUILD_VERSION` |
| cask `version "<version>"` | `scripts/build-brew-cask.sh` |

**Releases are cut by release-please** (`.github/workflows/release-please.yml`):
Conventional Commits on `main` (`feat:` → minor, `fix:` → patch, `feat!:`
→ breaking) feed a rolling release PR that maintains `CHANGELOG.md` and
computes the next version. **Merging that PR is the release**: it creates
tag + GitHub release and dispatches the desktop build. Note the scope:
release-please watches the whole repo, so server/landing commits also land
in the product changelog, which is intentional (one product, one version).

Escape hatch: a manually pushed `v*` tag still triggers `release.yml`
directly, bypassing release-please.

Forcing a specific version: add a `Release-As: <x.y.z>` footer to any commit on
`main` (e.g. a quick patch to exercise the in-app Sparkle updater). release-please
then opens a release PR for exactly that version, updating the manifest and
changelog, regardless of the commit's conventional type.

The `version` fields in the workspace `package.json`s are irrelevant
(`private: true`, never published to npm) and stay untouched.

## Release flow

Pushing a tag `v<version>` runs `.github/workflows/release.yml`:

1. `scripts/build-release.sh <version>`: orchestration only. Each app
   builds itself via its `build:release` workspace script:
   `@munkel/macos` (universal build via [Swift Bundler](https://github.com/moreSwift/swift-bundler),
   pinned and built on demand by `scripts/ensure-swift-bundler.sh`, wrapped by
   `make-bundle.sh`) and `@munkel/cli` (two `bun build --compile` targets
   + `lipo`, version stamped via `--define`). The root script copies the CLI
   into `Munkel.app/Contents/Resources/munkel`, then signs **inside-out** with
   Developer ID + hardened runtime: the CLI first (with
   `apps/cli/entitlements.plist`; Bun executables crash under the hardened
   runtime without the JIT entitlements), then the outer bundle **without**
   `--deep` so the app seal records the CLI's signature instead of clobbering
   its entitlements. It verifies the version stamp by running the embedded
   binary, then ditto-zips the app for notarytool. Deliberately **not** routed
   through turbo: release artifacts must never come out of a cache.
2. `notarytool submit --wait` on the app zip, `stapler staple` on the `.app`
   (the embedded CLI is covered by the same notarization + staple, with no online
   Gatekeeper check, unlike a bare binary).
3. `scripts/build-dmg.sh <version>` packages the stapled app into the
   drag-to-Applications `Munkel-<version>.dmg` (plain `hdiutil`: app +
   `/Applications` symlink, so it runs headless on CI). The DMG is then
   notarized and stapled too, so it opens without a warning.
4. `scripts/build-appcast.sh` EdDSA-signs the notarized DMG and renders the
   Sparkle auto-update feed `appcast.xml` (see **Auto-updates** below).
5. GitHub release with `Munkel-<version>.dmg` (+ `.sha256` + Sigstore bundle
   + `appcast.xml`). release-please creates the release as a **prerelease**
   (`prerelease: true` in `release-please-config.json`); `release.yml` clears
   that flag and marks it `latest` only **after** the assets are attached
   (`gh release edit … --prerelease=false --latest`). Until then GitHub's
   `releases/latest` skips it, so the Sparkle feed never resolves to a release
   whose `appcast.xml` isn't uploaded yet (see **Auto-updates**).
6. `scripts/build-brew-cask.sh` renders `Casks/munkel.rb` (with `auto_updates
   true`) with the new version + DMG sha256 and pushes it to
   `limehq/homebrew-tap`.

## One-time setup checklist

Keep private key locations, certificate exports, Apple identifiers, and token
inventory in a private operator note. This public file should describe the
shape of the setup, not publish operational details.

### Apple

- Developer ID Application certificate exported as a password-protected `.p12`.
- App Store Connect API key for `notarytool`; the `.p8` is a one-time download
  and must be backed up outside the repository.
- Repository variable `CODESIGN_IDENTITY` set to the exact Developer ID
  Application identity used by `codesign`.

### GitHub

- Public repository for `limehq/munkel`.
- Public tap repository `limehq/homebrew-tap`; the `homebrew-` prefix is
  required for `brew tap limehq/tap` to resolve.
- Repository secrets for the macOS certificate, certificate password,
  notarization API key, API key ID, issuer ID, the Sparkle appcast signing key
  (`SPARKLE_ED_PRIVATE_KEY`, see **Auto-updates**), and tap push token.
- The tap token should be a fine-grained PAT scoped only to
  `limehq/homebrew-tap` with **Contents: Read and write**. If it is absent,
  `release.yml` skips the cask bump with a warning.

## Local smoke test (no signing)

```sh
scripts/build-release.sh 0.0.0-dev
# → dist/stage/Munkel.app (ad-hoc signed, munkel CLI embedded in Resources/)
# → dist/Munkel-0.0.0-dev.zip (notarytool submission container)
scripts/build-dmg.sh 0.0.0-dev
# → dist/Munkel-0.0.0-dev.dmg (drag-to-Applications image)
```

Validate a rendered cask:

```sh
scripts/build-brew-cask.sh 1.0.0 <sha256> /tmp/munkel.rb
brew style --cask /tmp/munkel.rb
```

## Auto-updates (Sparkle)

Munkel updates itself via [Sparkle](https://sparkle-project.org): the app reads
a signed appcast and installs notarized updates in place, so direct-download
users get updates without re-downloading the DMG. The Homebrew cask is marked
`auto_updates true`, so `brew upgrade` defers to Sparkle instead of fighting the
in-place update.

- **Feed URL**: the app ships `SUFeedURL = https://munkel.app/appcast.xml`
  (`apps/macos/Bundler.toml`). That route
  (`apps/landing/src/routes/appcast[.]xml.ts`) 302-redirects to the latest
  release's `appcast.xml` asset; Sparkle follows the redirect. Owning the URL
  lets the backing store change later (e.g. an R2-backed accumulating feed)
  without reshipping the URL baked into already-installed builds.
- **Signing key**: every update is verified with an EdDSA key independent of the
  Developer ID signature. The public half is committed as `SUPublicEDKey` in
  `Bundler.toml`; the private half signs the appcast in CI and lives only in the
  `SPARKLE_ED_PRIVATE_KEY` repository secret. Generate the pair once with
  Sparkle's `generate_keys` (private key → your login Keychain; `generate_keys
  -p` prints the public key; `generate_keys -x <file>` exports the private key
  for the secret). Back the private key up outside the repo: it is
  unrecoverable, and losing it breaks updates for everyone not yet updated.
- **Appcast**: `scripts/build-appcast.sh` downloads the pinned Sparkle tools,
  EdDSA-signs the notarized DMG, and renders a single-entry `appcast.xml` that
  the release workflow uploads as a release asset. Keep its `SPARKLE_VERSION` in
  sync with the Sparkle SPM version in `apps/macos/Package.swift`.

- **Surfacing & scheduling**: `UpdaterController` forces one background check on
  launch (gated on the user's *Check Automatically* preference) on top of
  Sparkle's interval timer — without it, every manual *Check for Updates*
  rewrites `SULastCheckTime` and pushes the next scheduled check a full
  `SUScheduledCheckInterval` (1 day) out, so the automatic path effectively never
  surfaces. A scheduled find is a Sparkle "gentle reminder": Munkel has no Dock
  icon, so it shows as an accent dot on the menu-bar item (`AppDelegate`) plus the
  *Update to <version>…* menu entry, never an unprompted window.
- **Testing the automatic path** (release build only — the dev build never
  creates `UpdaterController`): point the app at an appcast advertising a version
  newer than the local `CFBundleShortVersionString`, then
  `defaults delete dev.uq.munkel SULastCheckTime` and relaunch. The menu-bar dot
  should appear within a couple of seconds, with no manual click.

First-release note: the release that introduces Sparkle produces the first
appcast, but existing users run a build without an updater: they update once
manually, and auto-updates take over from the next release onward.

## Why notarization is non-negotiable

Homebrew quarantines cask downloads, deprecated `--no-quarantine` in
brew 5.0, and macOS Tahoe shows unsigned quarantined apps a dead-end
"damaged" dialog. Distribution without Developer ID + notarization is
effectively broken for end users.
