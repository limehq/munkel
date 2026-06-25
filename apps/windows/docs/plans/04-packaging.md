# Plan 04: Release packaging (Windows)

**Branch:** `platform/windows/packaging`  
**Base:** `platform/windows/v2-clean`  
**Depends on:** Plan 03 (Windows CI green)  
**Estimate:** 2 sessions + human signing setup

## Goal

Produce installable Windows artifacts (portable folder, ZIP, optional NSIS)
with documented signing strategy for public release.

## Existing scaffold

- `apps/windows/electron-builder.yml` — `appId: app.munkel.windows`, `win.target: dir`
- `apps/windows/package.json` — no `electron-builder` script yet
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

1. Add `electron-builder` devDependency (respect 7-day npm age guard or use lockfile)
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
2. Set `icon` — use existing tray/app icon assets
3. `extraMetadata` / `productName`: Munkel
4. NSIS block (if chosen): one-click, per-machine, license file if required

**Acceptance:** Icons appear in built exe; app launches from unpacked dir.

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
- [ ] Named pipe control works with CLI
- [ ] Join circle + send message + image
- [ ] Uninstall clean (if NSIS)

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

1. Feature parity with `upstream/main` (session-start graphify pass)
2. `windows-ci` green
3. Installable artifact exists
4. User contacts upstream maintainer (see `State.md` fork strategy)
