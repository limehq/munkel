# Plan 10: Logo assets integration (Windows)

**Branch:** `platform/windows/logo-assets-integration`  
**Base:** `platform/windows/v2-clean`  
**Depends on:** Plan 04 (release packaging) in `v2-clean`  
**Estimate:** 1 session

## Problem

The Windows app shipped with placeholder branding. `tray-icon.svg` was doing
double duty as both the tray icon source and the ad-hoc source for the
Windows `.ico` file. There was no single, clearly labeled canonical logo
source, and the tray icon resolution chain only offered 16×16 and 32×32
bitmaps, missing a useful 24×24 intermediate for medium-DPI taskbars.

## Goal

Make `apps/windows/assets/logo.svg` the single source of truth for all
Windows branding, document the placeholder status, and wire the render
scripts and tray loader to consume it. Leave the repo ready so that when
the official brand SVG arrives, only `logo.svg` needs to be swapped and
the render scripts rerun.

## Files involved

- `apps/windows/assets/logo.svg` — new canonical brand logo source
- `apps/windows/assets/tray-icon.svg` — previous ad-hoc source (kept for history)
- `apps/windows/assets/icon.ico` — regenerated from `logo.svg`
- `apps/windows/assets/tray-icon.png` — regenerated from `logo.svg`
- `apps/windows/assets/tray-icon-24.png` — newly generated from `logo.svg`
- `apps/windows/assets/tray-icon-32.png` — regenerated from `logo.svg`
- `apps/windows/assets/tray-icon-48.png` — regenerated from `logo.svg`
- `apps/windows/scripts/render-ico.mjs` — points at `logo.svg`
- `apps/windows/scripts/render-tray-icon.mjs` — points at `logo.svg`, emits 24×24
- `apps/windows/src/main/tray.ts` — includes `tray-icon-24.png` in the loader chain
- `apps/windows/README.md` — documents the logo source and render scripts
- `docs/README.md` — project open-task status
- `.planning/todos/pending/E4-logo-svg-einarbeiten.md` — todo status
- `apps/windows/docs/plans/README.md` — execution plans index

## Tasks (sequential)

### Task 1 — Create `assets/logo.svg`

1. Copy the contents of `apps/windows/assets/tray-icon.svg`.
2. Add a top-level XML comment explaining it is the canonical source and a
   placeholder to be replaced with official assets.
3. Commit the new file.

### Task 2 — Point `render-ico.mjs` at `logo.svg`

1. Change `svgPath` to `../assets/logo.svg`.
2. Keep sizes `[16, 20, 24, 32, 40, 48, 64, 128, 256]`.
3. Run `bun run render-ico` and commit the regenerated `icon.ico`.

### Task 3 — Expand `render-tray-icon.mjs`

1. Change `svgPath` to `../assets/logo.svg`.
2. Expand sizes to `[16, 24, 32, 48]`.
3. Output naming:
   - 16 → `tray-icon.png`
   - 24 → `tray-icon-24.png`
   - 32 → `tray-icon-32.png`
   - 48 → `tray-icon-48.png`
4. Run `bun run render-tray-icon` and commit all generated PNGs.

### Task 4 — Update tray icon loader

In `apps/windows/src/main/tray.ts`, add `tray-icon-24.png` to the candidate
array. Keep the existing fallback order (32 → 24 → 16) so Electron can pick
the best available DPI match.

### Task 5 — Documentation

1. Update `apps/windows/README.md`:
   - Document `assets/logo.svg` as the canonical source.
   - Explain `bun run render-ico` and `bun run render-tray-icon`.
   - Note that `logo.svg` should be replaced with the official brand SVG.
2. Update `docs/README.md`:
   - Mark “Integrate official logo assets” as Done.
   - Note that the placeholder pipeline is in place.
3. Update `.planning/todos/pending/E4-logo-svg-einarbeiten.md`:
   - Mark status as done and link to this plan doc and the PR.

### Task 6 — Update plans index

Add a row for Plan 10 to `apps/windows/docs/plans/README.md`.

## Verification

```bash
cd apps/windows
bun run typecheck
bun run render-ico
bun run render-tray-icon
bun test
bun run build
bun run pack:dir
```

Re-run the two render scripts a second time and confirm `git diff` shows no
changes (outputs are deterministic). Visually confirm that
`release/win-unpacked/Munkel.exe` carries the icon resource after
`pack:dir`.

## Definition of done

- [x] `assets/logo.svg` exists with a placeholder comment.
- [x] `render-ico.mjs` and `render-tray-icon.mjs` derive bitmaps from `logo.svg`.
- [x] `icon.ico` and all tray PNGs are regenerated and committed.
- [x] `tray-icon-24.png` is part of the tray loader fallback chain.
- [x] README and project docs reflect the new canonical source.
- [x] `bun run typecheck`, `bun test`, `bun run build`, and `bun run pack:dir` are green.
- [x] PR opened to `platform/windows/v2-clean`; not self-merged.
