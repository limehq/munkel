# Plan 08: Orphaned `%APPDATA%\Electron` Store Cleanup

**Type:** Maintenance / data cleanup (no code)
**Status:** ✅ **DONE 2026-07-04**

## Problem

Legacy Electron userData store at `%APPDATA%\Electron` — created when Munkel ran
under the default app name before `app.setName('munkel')` (PR #23). It held a
separate identity (`memberId 01130e06-…`, "Rodgi") and two circles (`munkel`,
`espresso`), **both pointing at the dead localhost relay `ws://127.0.0.1:8787`**.
The active store (`%APPDATA%\munkel`) already has `espresso` on the prod relay;
the only unique item was the non-functional `munkel` circle code on a dead relay.

## Decision (user, 2026-07-04)

**Delete after backup.** The store is dead legacy; the app no longer uses it
(`app.setName('munkel')` → `%APPDATA%\munkel`). Rejoin of the `munkel` circle on
prod was not needed.

## Actions performed

```bash
# 1) Full backup (reversible)
cp -r "$APPDATA/Electron/." scratchpad/electron-store-backup-20260704/
# 2) Delete
rm -rf "$APPDATA/Electron"
# 3) Verify → confirmed gone
```

- **Backup:** `scratchpad/electron-store-backup-20260704/` (incl. `state.json`).
- **Verified:** `%APPDATA%\Electron` no longer exists.

## Caveat / follow-up

- `%APPDATA%\Electron` is the **default** userData path for any Electron app run
  without `setName`. If it reappears, a stray default-named instance is running —
  close all instances and re-delete. Current Munkel source pins `munkel`, so a
  current dev/prod instance will not recreate it.
- **Rollback:** restore from `scratchpad/electron-store-backup-20260704/` if the
  `munkel` circle turns out to be needed.
