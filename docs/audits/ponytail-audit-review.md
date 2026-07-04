# Ponytail audit review

Review outcome for [`ponytail-audit-2026-06-30.md`](./ponytail-audit-2026-06-30.md).

**Status:** in progress  
**Reviewer:** _to be filled_  
**Date:** _to be filled_

---

## Summary

_Executive summary of the review: overall savings potential, top-level
decisions, and whether the Swift/TS shared core (#1) is treated as a milestone
or deferred._

---

## Finding-by-finding decisions

| # | Finding | Decision | Owner / branch | Notes |
|---|---------|----------|----------------|-------|
| 1 | Parallel Swift `MunkelKit` reimplementation vs. Windows TS core | _implement / defer / reject_ | _owner_ | _Swift/TS shared core milestone question_ |
| 2 | Duplicate `control.ts` + `transport.ts` (CLI ↔ Windows) | _implement / defer / reject_ | _owner_ | _e.g. `packages/control`_ |
| 3 | Duplicate `protocol.ts` (server + Windows) | _implement / defer / reject_ | _owner_ | _e.g. `packages/protocol`_ |
| 4 | Hand-rolled HKDF/AES-GCM in dev scripts | _implement / defer / reject_ | _owner_ | _reuse `apps/windows/src/core/crypto` + `payload`_ |
| 5 | Renderer crypto IPC (`deriveGroupId`, `sealChat`, `openChat`) | _implement / defer / reject_ | _owner_ | _only main smoke uses `deriveGroupId`_ |
| 6 | Second interop script superseded by root `scripts/interop.ts` | _implement / defer / reject_ | _owner_ | _delete `apps/windows/scripts/interop.ts`_ |
| 7 | Triplicated wire constants | _implement / defer / reject_ | _owner_ | _single `wire-constants.ts`_ |
| 8 | Three near-identical Electron window factories | _implement / defer / reject_ | _owner_ | _`createOverlayWindow({ ... })`_ |
| 9 | Unused landing dependencies | _implement / defer / reject_ | _owner_ | _remove from `apps/landing/package.json`_ |
| 10 | `ProfileBroadcaster` class | _implement / defer / reject_ | _owner_ | _inline in `AppState`_ |
| 11 | `createPipeServer` in production CLI module | _implement / defer / reject_ | _owner_ | _move to test helper_ |
| 12 | Hand-rolled Unix socket client in CLI | _implement / defer / reject_ | _owner_ | _unify on `createPipeClient`_ |
| 13 | ~65-line protocol spec comment block duplicated | _implement / defer / reject_ | _owner_ | _link one `PROTOCOL.md`_ |
| 14 | `onImage` callback + `ImageMessage` | _implement / defer / reject_ | _owner_ | _never wired in Windows main_ |
| 15 | `AvatarCodec` interface + factory | _implement / defer / reject_ | _owner_ | _export `SharpAvatarCodec` directly_ |
| 16 | `imageCodec.decode()` (exported, never called) | _implement / defer / reject_ | _owner_ | _remove dead export_ |
| 17 | Stale plan doc (`NotchPanel` already implemented) | _implement / defer / reject_ | _owner_ | _delete `apps/macos/docs/own-notch-presenter-plan.md`_ |
| 18 | `Logger` interface with one implementation | _implement / defer / reject_ | _owner_ | _inline tagged JSON logger_ |
| 19 | `useIpc()` hook (one-line re-export) | _implement / defer / reject_ | _owner_ | _use `window.electronAPI` directly_ |
| 20 | Dead exports (`RelayEvent`, `buttonVariants`) | _implement / defer / reject_ | _owner_ | _remove dead exports_ |
| 21 | Trivial tests asserting types/constants exist | _implement / defer / reject_ | _owner_ | _remove or replace with behavior tests_ |
| 22 | `motion.ts` with only `easeInOutQuad` | _implement / defer / reject_ | _owner_ | _inline or use Motion built-in_ |
| 23 | `github-config.ts` (7 lines, one env override) | _implement / defer / reject_ | _owner_ | _colocate in `github-device-auth.ts`_ |
| 24 | shadcn-style stack for one `Button` | _implement / defer / reject_ | _owner_ | _plain `<button className=…>`; drops 2 deps_ |
| 25 | Empty `onChat` placeholder | _implement / defer / reject_ | _owner_ | _remove until chat UI exists_ |

---

## Swift/TS shared core milestone decision

_Record the decision on finding #1: implement as a milestone, defer, or reject.
If implemented, outline the milestone boundaries (scope, branch, dependencies,
risk)._

---

## Recommended cut order / phase plan

_Phase plan derived from the audit's recommended order and any adjustments made
during review. Include risk level and dependencies for each phase._

| Phase | Action | Risk | Depends on |
|-------|--------|------|------------|
| _1_ | _e.g. Shared `control` + `transport` package_ | _Low_ | _review complete_ |
| _2_ | _..._ | _..._ | _..._ |

---

## Reviewer sign-off

- [ ] Findings #1–#25 reviewed
- [ ] Line/dep estimates confirmed or adjusted
- [ ] Decision list recorded above
- [ ] Swift/TS shared core (#1) milestone question resolved
- [ ] No code changes made before review complete
