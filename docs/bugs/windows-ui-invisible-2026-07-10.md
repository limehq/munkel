# Windows UI invisible on every launch — bug report (2026-07-10)

**Reporter:** Orchestrator (live repro), fix implemented by delegated agent
**Platform:** Windows client (`apps/windows`)
**Branch:** `platform/windows/macos-parity-p1` (diagnosed at tip `e4337ed`)
**Status:** Both root causes fixed on this branch. Build-artifact verification done (Bug B); full runtime verification (actually launching the app and seeing the notch/menu/palette) still pending — see "Open verification" below.

## Summary

Two independent P0 bugs each fully kill the Windows client UI — no window
ever becomes usable, with no error dialog shown to the user. They were
diagnosed together because both manifest as "nothing happens" on `bun run
dev`, but they have unrelated root causes and unrelated fixes.

| ID | Symptom | Severity | Trigger |
|----|---------|----------|---------|
| [Bug B](#bug-b-preload-requires-a-relative-chunk-electron-cannot-load) | `window.electronAPI` is `undefined` in every renderer; notch/menu/palette all throw immediately | **P0 — every launch** | Any launch, dev or packaged |
| [Bug A](#bug-a-electron_run_as_node-leaks-into-the-dev-electron-child-process) | Electron main process dies at module load, before any window opens | P0, but scoped to shells that inherit `ELECTRON_RUN_AS_NODE=1` | Launching `bun run dev` from a VS Code / Claude Code integrated terminal |

---

## Bug B: preload requires a relative chunk Electron cannot load

### Root cause

The IPC-channel centralization in commit `4b7f492` (`refactor(windows):
centralize IPC channel names and sync contract docs`) made both
`apps/windows/src/main/main.ts` and `apps/windows/src/main/preload.ts` import
the same module, `../shared/ipc-channels`. Both files were built from a
**single** Vite lib-mode config (`vite.main.config.ts`) with **two** entries:

```ts
lib: {
	entry: {
		main: path.resolve('src/main/main.ts'),
		preload: path.resolve('src/main/preload.ts'),
	},
	...
}
```

With two entries sharing a config, Rollup's code-splitting extracted the
common `../shared/ipc-channels` module into a separate chunk file and had
both `dist/main.cjs` and `dist/preload.cjs` `require()` it by relative path.

### Evidence

Before the fix, `dist/preload.cjs` line 1 read (truncated):

```
"use strict";const e=require("electron"),n=require("./ipc-channels-BSGJIECy.cjs"),C={...
```

`dist/ipc-channels-BSGJIECy.cjs` existed alongside it as an orphan chunk file
(verified directly in this repo's `apps/windows/dist/` before the fix — grep
for `require(` in `preload.cjs` showed exactly this `require("./ipc-channels-…")`
call).

Electron loads preload scripts through a sandboxed loader that only resolves
bare specifiers Electron itself provides (`electron`, `node:*` built-ins it
allows) — it cannot resolve a relative `require("./ipc-channels-*.cjs")`
against `dist/preload.cjs`'s own directory the way plain Node would. At
runtime this produces:

```
Unable to load preload script: dist\preload.cjs
```

and `contextBridge.exposeInMainWorld('electronAPI', …)` never runs, so
`window.electronAPI` is `undefined` in **every** renderer (menu, notch,
palette). The observable symptom in the renderer is every `electronAPI.*`
call throwing, e.g. `NotchWidget.tsx:72` (`window.electronAPI.notchResize(...)`)
crashing on first paint — the notch, menu, and palette are all dead.

### Fix

Split main and preload into two separate, single-entry Vite lib configs so
Rollup never has a second entry to code-split a shared chunk against:

- `apps/windows/vite.main.config.ts` — single entry `main.ts` only.
- `apps/windows/vite.preload.config.ts` (new) — single entry `preload.ts`
  only, `external: ['electron']`, `output.inlineDynamicImports: true`
  (defensive — inlines any future dynamic `import()` instead of splitting a
  chunk).

Both configs use `emptyOutDir: false`: Vite's watch mode re-runs its
outDir-empty logic on **every** rebuild (not just the first — verified by
reading Vite 5.4's `prepareOutDir` call site, which fires on every
`BUNDLE_START` watch event), so if either config emptied `dist/` on every
rebuild it would delete the sibling file the other config just wrote.
`apps/windows/scripts/clean-dist.mjs` (new) now owns the single, one-time
`dist/` clear, invoked once by `bun run build` and once at the top of
`scripts/dev.mjs` before either watcher starts.

`apps/windows/scripts/dev.mjs` now builds **both** configs in watch mode
(`mainWatcher` and `preloadWatcher`), sharing one `electron-starter` plugin
that restarts Electron whenever either bundle finishes.

`apps/windows/package.json`:
- `build` script: `clean-dist.mjs` → `vite build --config vite.main.config.ts`
  → `vite build --config vite.preload.config.ts` → renderer build →
  `check-preload-selfcontained.mjs`.
- `pack`, `pack:dir`, `pack:installer`, `pack:release` all invoke `bun run
  build` first, so they pick up the fix automatically — no changes needed
  there. `electron-builder.yml`'s `files: [dist/**/*, ...]` glob already
  picks up both `main.cjs` and `preload.cjs` regardless of how many Vite
  builds produced them.

### Regression test

Two layers, both reading the **built artifact**, not the source:

1. **Hard gate:** `apps/windows/scripts/check-preload-selfcontained.mjs`,
   wired into the `build` npm script. Reads `dist/preload.cjs`, extracts every
   `require(...)` call, and exits non-zero if anything other than `"electron"`
   appears. Also runnable standalone via `bun run check:preload`.
2. **Test suite duplicate:** `apps/windows/src/main/__tests__/preload-build.test.ts`
   runs the same check via `bun test`. It uses `it.skipIf(!distBuilt)` so it
   never fails a typecheck-only or pre-build test run — it only asserts once
   `dist/preload.cjs` actually exists.

Verified post-fix: `dist/preload.cjs` contains exactly one `require(...)`
call, `require("electron")`; `check-preload-selfcontained.mjs` printed `OK`;
the new bun test passed as part of a 430-pass/2-skip/0-fail run.

---

## Bug A: `ELECTRON_RUN_AS_NODE` leaks into the dev Electron child process

### Root cause

`ELECTRON_RUN_AS_NODE=1` is an Electron-recognized env var that makes the
Electron binary behave like plain Node (skip Electron's app bootstrap
entirely — `require('electron')` then resolves to a path string instead of
the Electron API object). It is not itself persistent in a normal shell, but
it **is** commonly present in the environment of VS Code / Claude Code
integrated terminals (used internally by those tools to run Node-based
tooling through the Electron binary they embed) and gets inherited by any
child process spawned from such a terminal — including `bun run dev`.

`apps/windows/scripts/dev.mjs` spawned Electron with:

```js
env: { ...process.env, NODE_ENV: 'development' }
```

which passes `ELECTRON_RUN_AS_NODE` straight through if it was present in
`process.env`. With the flag set, the spawned "Electron" process runs as
plain Node, `app` is `undefined`, and this line in `apps/windows/src/main/main.ts`:

```ts
app.setName('munkel');
```

throws immediately at module load:

```
TypeError: Cannot read properties of undefined (reading 'setName')
```

The main process crashes before any `BrowserWindow` is created — no window,
no error dialog, `bun run dev` just appears to do nothing.

### Fix

`apps/windows/scripts/dev.mjs` (`startOrRestartElectron`) now builds a
`childEnv` object and explicitly `delete`s `ELECTRON_RUN_AS_NODE` from it
before spawning Electron, regardless of whether it was present.

`apps/windows/scripts/launch-munkel-dev.cmd` (the Start Menu GUI launcher)
now runs `set "ELECTRON_RUN_AS_NODE="` before `cd`-ing into the project and
running `bun run dev`, so a GUI-launched dev session — which could inherit
the flag from whatever process tree spawned Explorer/the shortcut — can never
pass it through either.

### Regression test

None automated. This is an environment/launcher guard around a variable that
only exists in specific parent-process trees (VS Code / Claude Code
terminals) and is impractical to reproduce hermetically in `bun test`.
Documented here instead; both fix sites carry inline comments explaining why
the strip exists, pointing back at this doc.

---

## Open verification

The delegated agent that implemented these fixes could not launch/screen-test
the app directly (sandboxed, no display access, and told not to spin up a
second running instance). Confirmed so far:

- [x] Bug B: `dist/preload.cjs` build artifact contains exactly one
      `require("electron")` call (verified via `check-preload-selfcontained.mjs`
      and manual `grep` inspection).
- [x] `bun run typecheck` green across the monorepo.
- [x] `bun test` in `apps/windows`: 430 pass, 2 skip, 0 fail (429 baseline + 1
      new preload self-containment test).
- [x] **Runtime-verified by the orchestrator (2026-07-10):** launched
      `bun run dev` **from a shell that carried `ELECTRON_RUN_AS_NODE=1`** (the
      exact poisoned condition — a Claude-Code/VS-Code-spawned terminal). Result
      captured in `scratchpad/munkel-verify.log`: all three crash signatures are
      **0** (`reading 'setName'`, `reading 'notchResize'`, `Unable to load
      preload script`), the main process boots (`[munkel] userData path`,
      `restoreCircles {count:2}`, both circles `[relay] open`), and there are
      **no renderer errors** — so `dev.mjs` correctly strips the flag from the
      Electron child (Bug A) and the self-contained `preload.cjs` loads so
      `window.electronAPI` is defined and `NotchWidget` mounts (Bug B). The
      process stayed alive (no crash-exit). Kimi review of the fix commits:
      **SHIP-with-follow-ups** (no CRITICAL/BLOCK).
- [ ] Optional follow-up (Kimi MINOR): harden `check-preload-selfcontained.mjs`
      against `require` inside string/comment (false positive) and against
      template-literal/variable specifiers (false negative); debounce the double
      Electron restart in `dev.mjs` when a module shared by both bundles changes.
- [ ] Not yet done (cosmetic): a human still eyeballing the actual rendered
      notch/menu on screen and the Start-Menu-shortcut path — the log proves the
      code path works, but a visual confirmation is still worthwhile.
