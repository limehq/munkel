# Plan 07: Notch hover-stuck / retract deadlock fix

> **Status:** Merged via merge commit `1b63d37` into `platform/windows/v2-clean`.
> Fix implemented — hover-stuck deadlock resolved.
> **Remaining human gate:** manual live-animation QA on Windows (FULL → PEEK → RETRACTED → hide).
> - Extracted `useNotchLifecycle` hook from `NotchWidget.tsx`.
> - Added `useNotchLifecycle` unit tests covering the happy path and the hover-stuck repro.
> - Removed the `!hovering` guard from the empty-hide timer so the notch hides reliably even when `mouseleave` is never delivered.
> - `bun run typecheck` and `bun test` green (159 pass / 2 skip / 0 fail).

**Branch:** `platform/windows/notch-retract-fix`
**Base:** `platform/windows/v2-clean`
**Type:** Bugfix

## Problem

User report: incoming messages stay visible and the notch never hides.

The lifecycle sequence (FULL → PEEK → RETRACTED → prune → EMPTY → hide) works in code, but the final EMPTY step could deadlock on Windows:

1. After `NOTCH_FULL_MS` (5 s) the notch enters `peek` and calls `notchSetInteractive(false)`.
2. The main process turns the notch window click-through via `setIgnoreMouseEvents(true, { forward: true })`.
3. On Windows the renderer may never receive a `mouseleave` event while the window is click-through, so the local `hovering` state stays `true`.
4. The empty-hide effect was gated on `history.length === 0 && !hovering`. With `hovering` stuck, `notchEmpty()` was never sent and the notch stayed open indefinitely.

## Root cause

`apps/windows/src/renderer/components/NotchWidget.tsx:158-164` coupled the empty-hide decision to hover state.
When hover state could not clear (due to the platform-level click-through behavior), the hide chain never completed.

## Fix

- Extracted all notch lifecycle state and effects into `apps/windows/src/renderer/lib/useNotchLifecycle.ts`:
  - `history`, `phase`, `hovering` / `reopening`, `replyOpen`, prune timer, empty-hide timer.
  - Same constants and delays as before (`NOTCH_FULL_MS`, `NOTCH_PEEK_MS`, `NOTCH_RETRACT_AT_MS`, `NOTCH_HISTORY_MS`, 350 ms empty-hide delay, 1 s prune interval).
- The empty-hide effect now only checks `history.length === 0`.
  Hover state no longer blocks the hide, so a stuck `hovering = true` cannot keep the notch open.
- `notchSetInteractive` is still driven by `phase === 'full' || reopening || replyOpen`, preserving interactivity during hover/reply.

## Files changed

- `apps/windows/src/renderer/lib/useNotchLifecycle.ts` — new hook.
- `apps/windows/src/renderer/lib/__tests__/useNotchLifecycle.test.ts` — new tests.
- `apps/windows/src/renderer/components/NotchWidget.tsx` — consumes the hook; JSX and UX unchanged.
- `apps/windows/package.json` — added `react-test-renderer@18.3.1` and `@types/react-test-renderer@18.3.0` as dev dependencies for hook tests.

## Verification

```bash
cd apps/windows
bun run typecheck
bun test
```

Result: `159 pass / 2 skip / 0 fail`.

## Definition of done

- [x] `NotchWidget.tsx` lifecycle state/effects extracted into `useNotchLifecycle`.
- [x] Hook preserves existing behavior: newest-first history, 1 s prune, `receivedAt` handling, `notchEmpty()` call, `notchSetInteractive` effect.
- [x] Empty-hide no longer gated on `!hovering`; deadlock removed.
- [x] Happy-path and hover-stuck-deadlock tests added and passing.
- [x] `bun run typecheck` and `bun test` green.
- [ ] Manual QA on Windows (FULL → PEEK → RETRACTED → hide) — human gate, not blocking merge.
