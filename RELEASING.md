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
4. GitHub release with `Munkel-<version>.dmg` (+ `.sha256` + Sigstore bundle).
5. `scripts/build-brew-cask.sh` renders `Casks/munkel.rb` with the new
   version + DMG sha256 and pushes it to `limehq/homebrew-tap`.

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
  notarization API key, API key ID, issuer ID, and tap push token.
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

## Why notarization is non-negotiable

Homebrew quarantines cask downloads, deprecated `--no-quarantine` in
brew 5.0, and macOS Tahoe shows unsigned quarantined apps a dead-end
"damaged" dialog. Distribution without Developer ID + notarization is
effectively broken for end users.
