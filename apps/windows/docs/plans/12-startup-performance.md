# Plan 12 — Startup performance (Windows)

## Goal

Shorten the perceived cold start of the Munkel Windows Electron app so the tray
appears sooner and the main process does less work before first useful UI — for
both `bun run dev` and packaged builds.

## Context

Two parallel analyses (main-process bootstrap + renderer/build path) found three
stacked cost centers, not a single bug:

1. **DEV toolchain gate** — Electron is spawned only after the first Vite
   main+preload watch build finishes (`apps/windows/scripts/dev.mjs`).
2. **Eager main requires** — `sharp` (via avatar / `../core` barrel), Zod
   (protocol), `electron-updater`, and `ws` load at process start even when not
   needed for tray visibility.
3. **Three BrowserWindows × one full React SPA** — Menu, Notch, and Palette are
   created and `loadURL`'d in `app.whenReady` *before* `createTray`
   (`apps/windows/src/main/main.ts`). Each window loads the same entry
   (`main.tsx` → `App.tsx`) with static imports of all routes (no code-split).

Tray already appears before `createControlServer` / `restoreCircles`. The
perceived slowness sits **before** those awaits (imports + window construction)
and in the DEV spawn gate.

Out of scope for first implementation pass: Relay/GitHub network, CSS /
`backdrop-filter` paint tuning, preload size (~3 KB — not a lever).

## Branch / Worktree

| Item | Value |
|------|--------|
| Branch | `platform/windows/startup-perf` |
| Base | `platform/windows/v2-clean` |
| PR target | `platform/windows/v2-clean` |
| Worktree (local Windows) | `C:\Users\rodgi\CODING\Test\munkel-wt-startup-perf` |
| Worktree (this agent / Linux) | `/home/ubuntu/munkel-wt-startup-perf` |

**Execution rule:** All Plan-12 docs and code land only in the worktree above —
never in the main checkout (stash / fake-injector WIP lives there). After
`git worktree add`, switch the agent root to the worktree path before editing.

```bash
# From main checkout
git fetch origin
git worktree add -b platform/windows/startup-perf \
  /path/to/munkel-wt-startup-perf \
  origin/platform/windows/v2-clean
# Then cd / move agent root into the worktree
```

## Status

🔄 **In progress** — Phase 0 instrumentation + Phase 1.1–1.3 landed on this
branch (tray first, lazy notch/palette, lazy `sharp`). Discuss remaining
Phase 1.4–1.6 / Phase 2–3 before expanding scope.

## Tasks

### Phase 0 — Measure (before any fix)

Add timestamp markers and capture a baseline (3× `bun run dev`, 1× packaged
`pack:dir` if feasible):

| Marker | Where |
|--------|--------|
| `dev.t0` → `renderer.listen` → `main.closeBundle` → `electron.spawn` | `scripts/dev.mjs` |
| `requires.done` → `whenReady` → `window.N` → `tray` → `control` → `restoreCircles` | `src/main/main.ts` |
| `scriptStart` → `react.mount` → `getState.done` | `src/renderer/main.tsx` / store |

Re-measure after each Phase-1 change. Without numbers, do not reorder priorities.

### Phase 1 — Quick wins

1. **Tray first** — call `createTray` before (or immediately after scheduling)
   the three `create*Window` calls so the icon appears without waiting on
   Chromium window construction.
2. **Lazy window create** — create Palette (and optionally Notch) only on first
   shortcut / first show; keep Menu creatable early if tray open-menu needs it.
3. **Lazy `sharp` / avatar / image-codec** — dynamic `import()` only on GitHub
   avatar or image-send paths; remove top-level `require("sharp")` from the
   startup graph (cut `../core` barrel pull-ins where needed).
4. **Lazy `electron-updater`** — load only when `app.isPackaged` (or inside
   packaged `initUpdateService` path).
5. **Strip / gate debug I/O** — remove or flag sync `appendFileSync` debug logs
   and NotchWidget debug `fetch` to ingest endpoints.
6. **`React.lazy` per route** in `App.tsx` so each window does not parse all
   three window components at mount.

Suggested order: 1 → 2 → 3, then 4–6. Compare Phase-0 markers after each step.

### Phase 2 — Dev orchestration

1. Spawn Electron immediately when a usable `dist/main.cjs` already exists;
   keep watch rebuild → restart, without blocking first spawn on a full cold
   main build when possible.
2. Add Vite `optimizeDeps.include: ['react', 'react-dom']` for a stabler first
   renderer transform.
3. Keep or narrow `React.StrictMode` based on measured DEV double-effect cost —
   measure first, do not guess.

### Phase 3 — Structural

1. **Cut main imports** — replace `../core` barrel imports with targeted modules
   so Zod/avatar/image-codec stay off the cold path.
2. **Three Vite entries** (`menu` / `notch` / `palette` HTML or entries) for
   real bundle splitting (beyond `React.lazy`).
3. **Slim notch state** — avoid broadcasting full member avatars to the notch
   window when unused.
4. **`restoreCircles`** — parallel `Promise.all` joins; reduce redundant
   IdentityStore load/save rewrites for unchanged circles.

### Phase 4 — Acceptance criteria

Tune targets after Phase-0 baseline; initial direction:

| Metric | Target |
|--------|--------|
| DEV: terminal → tray visible | −40 % vs baseline |
| PROD: process start → tray | −30 % vs baseline |
| BrowserWindows at ready (default) | ≤ 1 (Menu); Notch/Palette on demand |
| `require("sharp")` before tray | **0** |

## Verification

```bash
cd apps/windows
bun install
bun run typecheck
bun test
# After Phase 0 instrumentation:
bun run dev   # capture markers; compare to baseline
# Optional packaged check:
bun run pack:dir
```

Manual: confirm tray appears, menu/palette/notch still open correctly after lazy
create, GitHub avatar path still works after lazy `sharp`, packaged update check
still runs only when packaged.

## Decisions & notes

- Discuss Phase 0–4 with the owner before coding; defer Phase 3 items if Quick
  Wins already hit acceptance.
- Do not mix this work with notch-peek-hover / fake-injector WIP on the main
  checkout — worktree only.
- Index link lives solely in `apps/windows/docs/plans/README.md` (Plan 12 row).
