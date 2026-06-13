# Releasing Munkel via Homebrew

End-user install (after the first release is published):

```sh
brew install limehq/tap/munkel      # taps automatically, installs app + CLI
```

The cask puts `Munkel.app` into `/Applications` and symlinks the `munkel`
CLI into `$(brew --prefix)/bin`. One artifact, one command.

## Versioning

One **SemVer product version** for the whole artifact — app and CLI ship
together in one zip and are version-locked by design (the CLI talks to the
app's control socket), so they never get separate numbers. The
**git tag is the single source of truth**; nothing is hardcoded:

| Where the number lands | How it gets there |
|---|---|
| `Munkel-<version>.zip` | release workflow, from the tag |
| `Munkel.app` → `CFBundleShortVersionString` | `make-bundle.sh` via `MUNKEL_VERSION` |
| `munkel --version` | `bun build --define MUNKEL_BUILD_VERSION` |
| cask `version "<version>"` | `scripts/build-brew-cask.sh` |

**Releases are cut by release-please** (`.github/workflows/release-please.yml`):
Conventional Commits on `main` (`feat:` → minor, `fix:` → patch, `feat!:`
→ breaking) feed a rolling release PR that maintains `CHANGELOG.md` and
computes the next version. **Merging that PR is the release** — it creates
tag + GitHub release and dispatches the desktop build. Note the scope:
release-please watches the whole repo, so server/landing commits also land
in the product changelog — that's intentional (one product, one version).

Escape hatch: a manually pushed `v*` tag still triggers `release.yml`
directly, bypassing release-please.

The `version` fields in the workspace `package.json`s are irrelevant
(`private: true`, never published to npm) and stay untouched.

## Release flow

Pushing a tag `v<version>` runs `.github/workflows/release.yml`:

1. `scripts/build-release.sh <version>` — orchestration only. Each app
   builds itself via its `build:release` workspace script:
   `@munkel/macos` (universal SPM build via `--arch` flags, wrapped by
   `make-bundle.sh`) and `@munkel/cli` (two `bun build --compile` targets
   + `lipo`, version stamped via `--define`). The root script stages
   `Munkel.app` + `bin/munkel`, signs with Developer ID + hardened runtime
   (CLI needs `apps/cli/entitlements.plist` — Bun executables crash under
   the hardened runtime without the JIT entitlements), verifies the
   version stamp, and ditto-zips. Deliberately **not** routed through
   turbo: release artifacts must never come out of a cache.
2. `notarytool submit --wait` on the zip, `stapler staple` on the `.app`
   (zips and bare CLI binaries cannot be stapled), re-zip with `ditto`.
3. GitHub release with `Munkel-<version>.zip`.
4. `scripts/build-brew-cask.sh` renders `Casks/munkel.rb` with the new
   version + sha256 and pushes it to `limehq/homebrew-tap`.

## One-time setup checklist

### Apple (team K8T3LW283A, Unique (Deutschland) GmbH)

- [x] **Developer ID Application certificate** — created 2026-06-13 via
      developer.apple.com (G2 Sub-CA), valid until 2031-06-13. Private key,
      `.p12` and password live in `~/.munkel-signing/` on Jurij's Mac
      (see `NOTES.md` there) — **back this up**; Apple cannot re-issue the
      private key. On an organization team only the Account Holder (or a
      member with Developer ID permission) can create such a certificate.
- [x] `.p12` exported (OpenSSL `-legacy` mode — modern OpenSSL 3 PKCS#12
      defaults are rejected by macOS `security import`).
- [x] **App Store Connect API key** for notarization: Team Key
      `munkel-notarytool`, Key ID `43FZV9YFL8`, role Developer, Issuer ID
      `69a6de8e-b081-47e3-e053-5b8c7c11a4d1`. The `.p8` is a one-time
      download and lives in `~/.munkel-signing/`.

### GitHub

- [x] Public tap repo `limehq/homebrew-tap` created 2026-06-13 (the
      `homebrew-` prefix is required for `brew tap limehq/tap` to resolve).
      Until `TAP_GITHUB_TOKEN` is set, `release.yml` skips the cask bump
      with a warning instead of failing.
- [x] Release assets publicly downloadable: `limehq/munkel` is **public**
      since 2026-06-13 (history secret-scanned before the flip).
- [x] LICENSE: MIT (Unique (Deutschland) GmbH).
- [x] Repository **secrets** on `limehq/munkel`: `MACOS_CERTIFICATE_P12`,
      `MACOS_CERTIFICATE_PASSWORD`, `APPLE_API_KEY_P8`, `APPLE_API_KEY_ID`,
      `APPLE_API_ISSUER_ID` — set 2026-06-13.
- [ ] `TAP_GITHUB_TOKEN` secret: fine-grained PAT —
      github.com/settings/personal-access-tokens → Generate new token →
      Resource owner **limehq** → Only select repositories →
      **limehq/homebrew-tap** → Repository permissions → **Contents:
      Read and write** (nothing else). Then from a terminal:
      `gh secret set TAP_GITHUB_TOKEN --repo limehq/munkel`
      (paste, Enter, Ctrl-D — keeps the token out of shell history).
- [x] Repository **variable** `CODESIGN_IDENTITY` =
      `Developer ID Application: Unique (Deutschland) GmbH (K8T3LW283A)`.

## Local smoke test (no signing)

```sh
scripts/build-release.sh 0.0.0-dev
# → dist/Munkel-0.0.0-dev.zip with Munkel.app + bin/munkel (ad-hoc signed)
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
