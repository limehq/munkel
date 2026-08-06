# Plan 05: Notch Peek + 60s History

> **Status:** Merged via PR #22 (`a72b456`) into `platform/windows/v2-clean`.

**Branch:** `platform/windows/notch-peek-history`  
**Base:** `platform/windows/v2-clean`  
**Estimate:** 1 session  
**Type:** Feature / UX

## Problem

The notch currently behaves like a single-message toast: one message replaces the
previous one, the full panel stays open until it is hidden, and there is no
rolling local history.

## Goal

Implement a three-phase notch lifecycle for the newest message, backed by a
60-second in-memory history buffer in the notch renderer:

1. **FULL** for the first 5 seconds after local receipt.
2. **PEEK** for the next 30 seconds with a white reverse progress ring.
3. **RETRACTED** after 35 seconds with only a minimal sliver visible.
4. **REOPEN** on hover, showing the full list of messages received in the last
   60 seconds, newest first.
5. **PRUNE** every message 60 seconds after local receipt.
6. **EMPTY** hide the notch window once the buffer has stayed empty briefly.

## Design notes

- The 60-second window is based on **local receive time** (`receivedAt`), not
  the sender-provided `sentAt`.
- The history lives in `NotchWidget.tsx`, not in the shared app store.
- `onNotchMessage` is the only source of history entries. `onNotchUpdate`
  remains for metadata updates such as the default private/public reply mode.
- The notch window stays physically fixed at `360 × 260`; collapse is done via
  CSS transforms only.
- Collapsed states use `setIgnoreMouseEvents(true, { forward: true })` so the
  transparent window stops swallowing desktop clicks while hover detection still
  works.
- Reply remains available in the expanded states and is scoped to the specific
  selected history row (`replyingTo: string | null`).

## Files involved

- `apps/windows/src/shared/types.ts`
- `apps/windows/src/main/group-session.ts`
- `apps/windows/src/main/main.ts`
- `apps/windows/src/main/notch-window.ts`
- `apps/windows/src/main/preload.ts`
- `apps/windows/src/renderer/components/NotchWidget.tsx`
- `apps/windows/src/renderer/lib/notch-phase.ts`
- `apps/windows/src/renderer/lib/prune-notch-history.ts`
- `apps/windows/src/renderer/styles/global.css`
- `apps/windows/src/main/__tests__/group-session.test.ts`
- `apps/windows/src/renderer/lib/__tests__/notch-phase.test.ts`
- `apps/windows/src/renderer/lib/__tests__/prune-notch-history.test.ts`
- `apps/windows/docs/ui-spec.md`

## Tasks

1. Extend `NotchMessage` with required `receivedAt: string`.
2. Add `receivedAt` to both `group-session.ts` `onNotch(...)` payloads and to
   the notch demo path in `main.ts`.
3. Extract pure notch-phase helpers (`full`, `peek`, `retracted`) into
   `src/renderer/lib/notch-phase.ts`.
4. Move notch history into `NotchWidget.tsx` with renderer-side ids,
   1-second pruning, and empty-window notification.
5. Convert the widget to a phase-based state machine keyed to the newest
   history entry id.
6. Replace the old single-message UI with peek/retracted/reopened states,
   including a scrollable history list and per-entry reply UI.
7. Add the reverse 30-second SVG ring and reduced-motion CSS fallback.
8. Add notch IPC for `notch-set-interactive`, `notch-empty`, and
   `notch-reopen`, plus pending-hide cancellation in `notch-window.ts`.
9. Update tests for the new helper functions and the added `receivedAt`
   payload field.
10. Update this plan and the UI spec to describe the rolling-history behavior.

## Verification

```bash
cd apps/windows
bun run typecheck
bun test
```

## Definition of done

- [x] New notch messages include required `receivedAt`.
- [x] Newest message transitions `full -> peek -> retracted` at 5s / 35s.
- [x] Peek shows a white reverse-draining ring for 30 seconds.
- [x] Hovering the sliver reopens the notch and shows all messages from the
      last 60 seconds, newest first.
- [x] Each history row supports copy and reply; only one reply field is open at
      a time.
- [x] Messages are pruned 60 seconds after receipt.
- [x] The empty notch renderer requests a debounced hide from the main process.
- [x] Collapsed notch states are click-through outside the visible sliver.
- [x] `bun run typecheck` and `bun test` are green.

> **Note:** `notchPhaseForElapsed` is currently unused; it is tracked as a
> robustness candidate in [Plan 07](./07-notch-retract-verify-fix.md).
