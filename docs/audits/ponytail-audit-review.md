# Ponytail audit review

Review outcome for [`ponytail-audit-2026-06-30.md`](./ponytail-audit-2026-06-30.md).

**Status:** completed  
**Reviewer:** Agent Swarm analysis  
**Date:** 2026-07-04

---

## Summary

The audit identifies ~900–1,050 lines of quick-win bloat across findings #2–#25 and an additional ~800–1,200 lines if the Swift/TS shared core (#1) is treated as an architecture milestone. After reviewing every finding against the current `platform/windows/v2-clean` branch, the recommendation is to **implement most quick wins now**, **defer the high-risk consolidation items that collide with in-flight work or the final `main` PR**, and **defer the Swift/TS shared core (#1) to a dedicated post-integration milestone**.

**Top-line decisions:**
- **Implement:** 19 findings (#2–#7, #9–#11, #13–#17, #19–#23, #25)
- **Defer:** 4 findings (#1, #8, #12, #24)
- **Reject:** 1 finding (#18)

**Expected net savings if the "implement" findings land:**
- **Lines:** ~700–800 (quick wins only)
- **Dependencies:** −2 certain (landing unused deps), with optional further reductions later

The Swift/TS shared core (#1) remains the largest theoretical cut (~800–1,200 lines) but is intentionally excluded from the immediate scope because it requires a new cross-platform runtime, Swift FFI bindings, and a full interop regression pass.

---

## Finding-by-finding decisions

| # | Finding | Decision | Owner / branch | Notes |
|---|---------|----------|----------------|-------|
| 1 | Parallel Swift `MunkelKit` reimplementation vs. Windows TS core | **defer** | post-`main` milestone | High-risk architecture milestone; see Swift/TS shared core section below. |
| 2 | Duplicate `control.ts` + `transport.ts` (CLI ↔ Windows) | **implement** | `platform/windows/shared-control-transport` | Create shared `packages/control` (or `apps/shared/control`). Depends on workspace-location decision. |
| 3 | Duplicate `protocol.ts` (server + Windows) | **implement** | same as #2/#7/#13 | Create shared `packages/protocol`. Do together with #7 and #13. |
| 4 | Hand-rolled HKDF/AES-GCM in dev scripts | **implement** | `platform/windows/consolidate-dev-crypto` | Rewrite `dev-send.ts` / `dev-image.ts` to import from Windows core/shared crypto. |
| 5 | Renderer crypto IPC (`deriveGroupId`, `sealChat`, `openChat`) | **implement** | `platform/windows/remove-renderer-crypto-ipc` | Only main smoke uses `deriveGroupId`; inline or move if needed. |
| 6 | Second interop script superseded by root `scripts/interop.ts` | **implement** | `platform/windows/remove-dead-interop` | Delete `apps/windows/scripts/interop.ts`. Trivial. |
| 7 | Triplicated wire constants | **implement** | same as #2/#3/#13 | Single `wire-constants.ts` inside shared protocol package. |
| 8 | Three near-identical Electron window factories | **defer** | — | Wait until `scratchpad/06-menu-window-dismiss.draft.md` and `scratchpad/07-notch-retract-fix.draft.md` land to avoid merge conflicts. |
| 9 | Unused landing dependencies | **implement** | `platform/windows/landing-deps-cleanup` | Remove `@tanstack/react-router-ssr-query` and `@tailwindcss/typography`. |
| 10 | `ProfileBroadcaster` class | **implement** | `platform/windows/inline-profile-broadcaster` | Inline debounce/flush into `AppState`. |
| 11 | `createPipeServer` in production CLI module | **implement** | `platform/windows/cli-transport-cleanup` | Move server helper to test helper; ideally folded into #2 branch. |
| 12 | Hand-rolled Unix socket client in CLI | **defer** | — | Medium runtime risk on macOS/Linux; schedule after #2/#11 when transport module is settled. |
| 13 | ~65-line protocol spec comment block duplicated | **implement** | same as #2/#3/#7 | Keep spec in shared protocol module or extract to `docs/wire-protocol.md`. |
| 14 | `onImage` callback + `ImageMessage` | **implement** | `platform/windows/group-session-callbacks` | Remove speculative callback; batch with #25. |
| 15 | `AvatarCodec` interface + factory | **implement** | same as #14 or standalone | Export `SharpAvatarCodec` directly; drop interface/factory/stub `decode()`. |
| 16 | `imageCodec.decode()` (exported, never called) | **implement** | `platform/windows/remove-dead-image-decode` | Delete unused method. |
| 17 | Stale plan doc (`NotchPanel` already implemented) | **implement** | `platform/windows/remove-stale-macos-doc` | Delete `apps/macos/docs/own-notch-presenter-plan.md`. |
| 18 | `Logger` interface with one implementation | **reject** | — | Abstraction provides real value: structured format, stderr routing, future sink seam. |
| 19 | `useIpc()` hook (one-line re-export) | **implement** | `platform/windows/remove-use-ipc-hook` | Use `window.electronAPI` directly. |
| 20 | Dead exports (`RelayEvent`, `buttonVariants`) | **implement** | `platform/windows/dead-exports` | Remove `export` keywords only. |
| 21 | Trivial tests asserting types/constants exist | **implement** | `platform/windows/remove-trivial-type-test` | Delete `apps/windows/src/shared/types.test.ts`. |
| 22 | `motion.ts` with only `easeInOutQuad` | **implement** | `platform/windows/inline-motion-easing` | Inline quadratic easing into `hero.tsx`. |
| 23 | `github-config.ts` (7 lines, one env override) | **implement** | `platform/windows/colocate-github-config` | Move `getGitHubClientID()` into `github-device-auth.ts`. |
| 24 | shadcn-style stack for one `Button` | **defer** | — | Used in 3 sections; small savings, medium regression risk while landing page is stable. |
| 25 | Empty `onChat` placeholder | **implement** | same as #14 | Make `onChat` optional and remove placeholder from `AppState`. |

---

## Swift/TS shared core milestone decision

**Decision:** `defer` to a dedicated post-integration milestone.

### Pro (implement now)

- Largest line reduction in the audit (~800–1,200 net lines).
- Single source of truth for crypto, payload, protocol, image codec, avatar codec, blob, relay, and GitHub auth.
- Eliminates the class of cross-language drift bugs between macOS and Windows.
- Faster protocol evolution: new message kinds or frame types only need one implementation.
- Potential dependency consolidation around one Rust/WASM or TS-native toolchain.

### Contra (implement now)

- No shared runtime exists yet; it must be designed, built, and battle-tested before adoption.
- High risk immediately before the final PR to `main`: touches the two most critical subsystems (cryptography and media codecs) in both clients.
- Swift FFI or native-module integration introduces memory ownership, async bridging, and build-tooling complexity.
- Must reproduce exact pinned interop-vector byte outputs or regenerate and re-audit them.
- Requires security review outside the audit's scope (correctness/security/performance were explicitly excluded).
- macOS-side review bandwidth needed; not purely a Windows integration task.

**Conclusion:** The duplication is real and should be addressed, but the correct fix is a new cross-platform runtime, not a refactor that can be completed safely before the final `main` PR. Execute the smaller shared-package findings (#2, #3, #7) first to reduce the surface area, then schedule #1 as a post-integration architecture milestone with its own design doc, branch, FFI plan, and interop-test strategy.

---

## Recommended cut order / phase plan

| Phase | Findings | Risk | Depends on | Notes |
|-------|----------|------|------------|-------|
| 0 | #17, #21 | Low | review complete | Pure deletions (stale doc, trivial test). |
| 1 | #2, #3, #7, #13 | Medium | workspace location decision | Shared `control`/`transport`/`protocol` packages and unified wire constants. |
| 2 | #4, #5, #6 | Low | Phase 1 optional | Dev-script crypto consolidation, dead renderer crypto IPC, superseded interop script. |
| 3 | #9, #10, #14, #15, #16, #19, #20, #22, #23, #25 | Low | — | Dead-code removal and small simplifications across Windows/landing. |
| 4 | #11 | Low | Phase 1 | Move `createPipeServer` to test helper (or fold into Phase 1). |
| 5 | #8, #12, #24 | Medium | in-flight UI work | Window factories, Unix socket client unification, landing Button refactor. |
| — | #1 | High | post-`main` milestone | Swift/TS shared core; separate architecture track. |
| — | #18 | — | — | Rejected; keep `Logger` abstraction. |

---

## Reviewer sign-off

- [x] Findings #1–#25 reviewed
- [x] Line/dep estimates confirmed or adjusted
- [x] Decision list recorded above
- [x] Swift/TS shared core (#1) milestone question resolved
- [x] No code changes made before review complete
