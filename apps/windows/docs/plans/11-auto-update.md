# Plan 11 — Auto-update (Windows)

## Goal

Add automatic update discovery and one-click installation to the Munkel Windows
Electron app, using `electron-updater` with a GitHub Releases feed.

## Context

- The Windows app is packaged with `electron-builder` (NSIS one-click installer).
- Fork beta builds are **unsigned**; SmartScreen may warn, and `electron-updater`
  signature verification must be disabled for beta.
- macOS uses Sparkle; Windows gets its own `electron-updater` path.
- Updates must never install without explicit user consent.

## Tasks

1. **Dependency & builder config**
   - Add `electron-updater` to `apps/windows/package.json` dependencies.
   - Configure `electron-builder.yml`:
     - Add GitHub publish provider under `win` (`owner: rodgi040`, `repo: munkel`).
     - Add `verifyUpdateCodeSignature: false` under `win` with a TODO comment
       linking signature verification to the future Authenticode signing task.

2. **Main-process update service**
   - Create `apps/windows/src/main/update-service.ts`.
   - Import `autoUpdater` from `electron-updater`; set GitHub provider feed URL.
   - Export `initUpdateService(send, options?)` returning `{ check, install, dispose }`.
   - Track phases: `idle`, `checking`, `available`, `downloading`, `downloaded`, `error`.
   - Auto-check on app launch only when `app.isPackaged` (dev mode skips).
   - Optional 24-hour periodic check.
   - Handle errors gracefully; for signature errors, surface a user-facing message.

3. **Unit tests**
   - Create `apps/windows/src/main/__tests__/update-service.test.ts`.
   - Mock `electron-updater` via dependency injection.
   - Test state transitions, error handling, dev-mode skip, manual check, and
     install gating.

4. **IPC contract**
   - Add `UpdatePhase`, `UpdateState` to `apps/windows/src/shared/types.ts`.
   - Extend `IpcApi` with `checkForUpdates`, `installUpdate`, `onUpdateState`.
   - Expose channels in `apps/windows/src/main/preload.ts`.
   - Register handlers and broadcast state from `apps/windows/src/main/main.ts`.
   - Add a "Check for Updates…" item to the tray context menu in `tray.ts`.
   - Document channels in `apps/windows/docs/ipc-contract.md`.

5. **Renderer UI**
   - Add update state and actions to `apps/windows/src/renderer/store/app-store.tsx`.
   - Render an update status pill in `MenuWindow.tsx` for non-idle phases,
     including an Install button for `downloaded` and a Retry button for `error`.
   - Add "Check for Updates…" to the settings popover.
   - Add `.update-status` styles to `global.css`.
   - Add update-related tests to `MenuWindow.test.tsx`.

6. **CI / release**
   - Add `pack:release` script to `apps/windows/package.json`:
     `bun run build && electron-builder --win nsis --publish never`.
   - Extend `.github/workflows/release.yml` with a Windows job that builds the
     installer and uploads `Munkel-Setup-*.exe`, `latest.yml`, and blockmap files
     to the GitHub release.
   - Update `.github/workflows/ci.yml` to run `bun run pack:installer` as a
     smoke test.

7. **Documentation**
   - Add an Auto-updates section to `apps/windows/README.md`.
   - Update `apps/windows/docs/plans/README.md` status table.
   - Update `docs/README.md` open-tasks table.

## Verification

```bash
cd apps/windows
bun install
bun run typecheck
bun test
bun run build
bun run pack:installer
# Inspect release/latest.yml
cat release/latest.yml
```

## Decisions & notes

- `verifyUpdateCodeSignature: false` is intentionally scoped to the unsigned
  beta. A TODO comment marks the spot to re-enable after Authenticode signing.
- `autoInstallOnAppQuit` is disabled; the user must click Install.
- Dev mode never auto-checks on launch, avoiding updater noise during local
  development.
- The `pack:release` script uses `--publish never`; release uploads are handled
  by the GitHub Actions workflow so the local build never mutates a release.
