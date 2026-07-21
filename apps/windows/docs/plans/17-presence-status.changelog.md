# Changelog Fragment: Presence / Online-Status mit Ruhemodus

> Feature: iOS/macOS parity for presence status  
> Branch: `platform/windows/feature/presence-status`  
> Plan: [Plan 17](./17-presence-status.md)

## Commit message

```
feat(windows): add presence status with auto-away and DND (iOS parity)

Implement online / do-not-disturb / away states matching macOS:
- Extend shared-wire profile/presence payloads with status.
- Persist chosen status in identity store.
- Auto-away after 5 min idle or on sleep/lock.
- Add status picker and avatar dot.
- Suppress notch preview when not online.
```

## Summary of changes

### Protocol
- Added `PresenceStatus` type (`online`, `dnd`, `away`) to `packages/shared-wire/src/payload.ts`.
- Extended `ProfilePayload` with optional `status` and `avatarURL`.
- Added new `PresencePayload` kind for lightweight status deltas.
- `decodePayload` now handles `presence` frames and falls back unknown/missing status to `online`.

### Main process
- Added `presence-monitor.ts` with injectable `IdleTimeSource` interface.
- Added `electron-idle-source.ts` wrapping Electron `powerMonitor`.
- `IdentityState` now persists `presenceStatus`.
- `SessionStore` exposes `presenceStatus`/`effectiveStatus` and broadcasts status changes.
- `GroupSession` sends `profile` with status and `presence` deltas; updates member status on receive.
- `main.ts` instantiates `PresenceMonitor` after `app.whenReady()` and suppresses notch previews when not `online`.

### Renderer
- `Avatar.tsx` renders colored status dots (green/orange/red) and supports `imageURL` priority.
- `MenuWindow.tsx` includes a presence status picker and shows own status dot.
- `useNotchLifecycle.ts` handles `silent` messages by adding them to history without triggering the `full` preview phase.
- `app-store.tsx` exposes `setPresenceStatus` action.

### Tests
- `packages/shared-wire/src/__tests__/payload.test.ts`
- `apps/windows/src/main/__tests__/presence-monitor.test.ts`
- `apps/windows/src/main/__tests__/group-session.test.ts`
- `apps/windows/src/renderer/lib/__tests__/useNotchLifecycle.test.ts`

## Verification

- `cd apps/windows && bun run typecheck` ✅
- `cd apps/windows && bun test` ✅ 195 pass / 2 skip / 0 fail
- `cd packages/shared-wire && bun test` ✅ 17 pass / 0 fail

## Outstanding

- Manual QA on Windows for idle/lock/sleep auto-away and notch suppression.
