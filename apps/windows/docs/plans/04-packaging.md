# Plan 04: Release packaging (Windows)

**Branch:** `platform/windows/packaging`  
**Base:** `platform/windows/v2-clean`  
**Depends on:** Plan 03 (Windows CI green)  
**Estimate:** 2 sessions + human signing setup

## Goal

Produce installable Windows artifacts (portable folder, ZIP, optional NSIS)
with documented signing strategy for public release.

## Existing scaffold

- `apps/windows/electron-builder.yml` — `appId: app.munkel.windows`, `win.target: [dir]`
- `apps/windows/package.json` — no `electron-builder` dependency or `pack` script yet
- Icon assets are **PNG/SVG only**: `assets/tray-icon.png`, `tray-icon.svg`,
  `tray-icon-32.png`, `tray-icon-48.png`. **There is no `.ico`** — Windows exe
  icons require one (see Task 2).
- Version: `0.0.1` (manual — not in release-please yet)

## Product decisions (human — before Task 2)

| Decision | Options | Default recommendation |
|----------|---------|------------------------|
| Primary artifact | portable dir / zip / NSIS | **zip** + portable dir for devs |
| Code signing | Authenticode cert / unsigned dev builds | unsigned OK for fork beta; cert for public |
| Auto-update | none / electron-updater | **none** for v1 |
| release-please | include `@munkel/windows` now? | **defer** until public launch |

Document chosen options in PR body and `apps/windows/README.md`.

## Out of scope

- Microsoft Store / MSIX (future)
- macOS notarization
- release-please automation (unless human explicitly approves)

## Tasks (sequential)

### Task 1 — electron-builder dependency + scripts

**Files:** `apps/windows/package.json`, root `package.json` turbo pipeline

1. Add `electron-builder` devDependency. **This trips the global 7-day npm-age
   guard** — the install will be blocked unless the version is already in the
   lockfile, or the user explicitly approves `ALLOW_FRESH_PKG=1`. Surface the
   exact version bump to the user and wait for "go" before installing; prefer a
   lockfile-pinned version.
2. Scripts:
   ```json
   "pack": "electron-builder --win --config electron-builder.yml",
   "pack:dir": "electron-builder --win dir --config electron-builder.yml"
   ```
3. Ensure `build` script runs before pack (main + renderer + preload)

**Acceptance:** `bun run pack:dir` produces `apps/windows/release/win-unpacked/`.

### Task 2 — Expand electron-builder.yml

**File:** `apps/windows/electron-builder.yml`

1. Add targets per product decision:
   ```yaml
   win:
     target:
       - zip
       - dir
       # - nsis   # if chosen
   ```
2. **Generate `assets/icon.ico`** (multi-size, 256×256 down to 16×16) from the
   existing `tray-icon.png` / `tray-icon.svg` — PNG alone is **not** accepted as
   a Windows exe icon. Use a converter (e.g. `electron-icon-builder`, ImageMagick
   `convert`, or `png-to-ico`) and commit the `.ico`. Then set
   `win.icon: assets/icon.ico` in `electron-builder.yml`.
3. `extraMetadata` / `productName`: Munkel
4. NSIS block (if chosen): one-click, per-machine, license file if required

**Acceptance:** `assets/icon.ico` exists and is committed; the built exe shows
the Munkel icon in Explorer/taskbar; app launches from the unpacked dir.

### Task 3 — CI pack job (optional smoke)

Extend Plan 03 workflow:

```yaml
- run: bun run pack:dir
  working-directory: apps/windows
- uses: actions/upload-artifact@v4
  with:
    name: munkel-windows-unpacked
    path: apps/windows/release/win-unpacked/
```

**Acceptance:** PR artifacts downloadable (optional, for QA).

### Task 4 — Code signing (human gate)

If signing cert available:

1. Store cert in GitHub Actions secret (PFX + password)
2. electron-builder `win.certificateFile` / `certificatePassword`
3. Document SmartScreen expectations

If **no** cert: document unsigned install path (Windows warning dialog).

**Acceptance:** Signing steps documented even if skipped for beta.

### Task 5 — Root documentation

**Files:**

- Root `README.md` — Windows install section (download artifact, run Munkel.exe)
- `docs/launch-platforms.md` — Windows distribution note
- `apps/windows/README.md` — pack commands, artifact paths

### Task 6 — CLI + app bundling

Decide: ship `munkel.exe` CLI inside installer or separate npm global.

**Minimum v1:** Document that CLI is installed via `npm i -g` / bun separately;
Windows app is standalone Electron bundle.

Optional follow-up: bundle CLI in `extraResources`.

### Task 7 — Manual QA checklist

- [ ] Fresh VM / machine: extract zip, run exe
- [ ] Single-instance lock works
- [ ] Tray icon visible
- [ ] Named pipe control works with CLI (`\\.\pipe\Munkel-<user>-Control`)
- [ ] Join circle + send message + image
- [ ] Uninstall clean — **only if the NSIS target was chosen**; skip for
      zip/dir-only builds (nothing to uninstall)

### Task 8 — PR

Title: `feat(windows): release packaging (zip + portable dir)`

## Verification

```bash
cd apps/windows
bun run build
bun run pack:dir
# Launch release/win-unpacked/Munkel.exe
```

## Definition of done

- [ ] Reproducible pack scripts documented
- [ ] At least zip + dir artifacts
- [ ] CI smoke (optional artifact upload)
- [ ] Root README Windows install section
- [ ] PR merged to `platform/windows/v2-clean`

## Launch gate (full Windows native)

With Plans 01–04 complete + Phase 2 merged:

1. **Feature parity with `upstream/main`** — not an agent-runnable step. Verify
   via the session-start `/graphify .` parity pass and the re-ranked gap list in
   the private `State.md`; treat "no remaining parity gaps" as the checklist
   item. Do not mark this done from inside an agent run.
2. `windows-ci` green (Plan 03).
3. Installable artifact exists (this plan).
4. User contacts upstream maintainer (see the private `State.md` fork strategy).
