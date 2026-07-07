# Review: Plan 17 – Presence / Online-Status mit Ruhemodus

**Reviewer:** Agent 2b + manuelle Korrektur  
**Decision:** APPROVED  
**Date:** 2026-07-06

## Summary

The plan has been revised to address all blocking issues identified in the initial review:

1. ✅ `Member` type now extends the existing shape (`memberId`, `displayName?`, `joinedAt`) with `status?: PresenceStatus`.
2. ✅ `IdleTimeSource.getIdleTimeMs()` correctly documents that Electron `powerMonitor.getSystemIdleTime()` returns seconds and must be multiplied by 1000.
3. ✅ `ElectronIdleTimeSource` and `PresenceMonitor` are explicitly instantiated inside `app.whenReady()`.
4. ✅ `encodeProfile()` is extended to accept and forward `status` and `avatarURL`.
5. ✅ `IdentityUpdate` is left unchanged; only `IdentityState` and `StateUpdate` carry `presenceStatus`.
6. ✅ `registerSessionHandlers` signature is updated to accept `PresenceMonitor`.

## Clarifications applied

- Status-dot colors specified: `online` = green, `dnd` = orange, `away` = red.
- `avatarURL` priority documented in `Avatar.tsx`.
- Status dot applied to self-avatar first, with optional extension to member avatars.
- `silent` plumbing clarified between `main.ts` and `NotchWidget`/`useNotchLifecycle`.

## Conclusion

Plan is ready for implementation (Agent 3).
