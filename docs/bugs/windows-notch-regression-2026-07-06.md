# Windows notch regression — bug report (2026-07-06)

**Reporter:** User (manual QA)  
**Platform:** Windows client (`apps/windows`)  
**Branch at report time:** `platform/windows/v2-clean`  
**Status:** Open — three fresh regressions/QA gaps identified during live use.

## Summary

Three notch issues were observed when receiving a single incoming message on Windows. They are filed as one cluster because they all affect the top-center notification lifecycle and may share root causes in the renderer layout, phase state machine, or mouse-event forwarding.

| ID | Symptom | Severity |
|----|---------|----------|
| [WIN-NOTCH-004](#win-notch-004-notch-renders-vertically-oversized) | Notch renders too tall, showing multiple vertical frame/box artefacts | High |
| [WIN-NOTCH-005](#win-notch-005-loading-ring-not-visible) | Peek-phase loading/activity ring is not visible | Medium |
| [WIN-NOTCH-006](#win-notch-006-hover-does-not-reopen-notch) | Hovering the retracted notch does not reopen it | High |

---

## Environment (to confirm during diagnosis)

| Field | Value |
|-------|-------|
| OS | Windows 10/11 (build TBD) |
| Display scaling | TBD — likely relevant for WIN-NOTCH-004 |
| App build | Dev (`bun run dev`) |
| Circle / relay | Online (message was received from another client) |

---

## WIN-NOTCH-004: Notch renders vertically oversized

### Reported behavior

When a single message arrives, the notch at the top of the screen is displayed **much taller than expected**, as if several empty boxes or frames are stacked below the actual message content. The user described it as "mehrere Kasten nach unten Frames".

### Expected behavior

The notch should be a compact top-center pill/teaser sized to the actual content of the incoming message (and optionally a small history area). A single short message should not produce a tall vertical stack.

### Actual behavior

The notch extends downward with what looks like multiple frames/boxes, even though only one message was received and only one reply was written back.

### Suspected code areas

- `apps/windows/src/main/notch-window.ts` — still defines `NOTCH_HEIGHT = 260` and a fixed `NOTCH_WIDTH = 360`. The window may not be resized to content after the renderer layout changes.
- `apps/windows/src/renderer/components/NotchWidget.tsx` — layout/CSS may create extra vertical containers (history list, reply area, padding) that are visible even when they have no content.
- `apps/windows/src/renderer/styles/global.css` — `.notch-widget`, `.notch-full`, `.notch-peek`, `.notch-retracted` height/overflow rules may allow the content box to grow instead of clipping or collapsing.
- `apps/windows/src/renderer/lib/useNotchLifecycle.ts` — phase transitions (`full` → `peek` → `retracted`) may leave stale history entries or reply UI rendered.

### Diagnosis steps

- [ ] Capture screenshot + actual `BrowserWindow` bounds when a single message is shown.
- [ ] Inspect renderer DOM: identify which elements contribute to the excess height (empty history rows, reply placeholder, margins, etc.).
- [ ] Check `screen.getPrimaryDisplay().scaleFactor` and whether CSS uses fixed px vs. DPI-aware units.
- [ ] Compare `notch-window.ts` fixed `NOTCH_HEIGHT` against the renderer's actual content height.

---

## WIN-NOTCH-005: Loading ring not visible

### Reported behavior

After the full phase ends, the notch should show a loading/activity ring during the peek phase, but **the ring is not seen**.

### Expected behavior

Per the phase lifecycle, the notch transitions from `full` (5 s) to `peek` (30 s) with a visible activity/loading ring, then to `retracted`.

### Actual behavior

The ring appears to be missing or invisible when the notch enters the peek phase.

### Suspected code areas

- `apps/windows/src/renderer/components/NotchWidget.tsx` — the ring is rendered with `RING_RADIUS = 8` and `RING_CIRCUMFERENCE`. It may be too small, clipped by a parent container, or hidden behind the frosted background.
- CSS for `.notch-ring` or equivalent — may set `opacity: 0`, `display: none`, or wrong `z-index`.
- `apps/windows/src/renderer/lib/notch-phase.ts` / `useNotchLifecycle.ts` — the phase may not transition to `peek` correctly, so the ring is never rendered.

### Diagnosis steps

- [ ] Inspect the renderer DOM during peek phase and verify the ring element exists.
- [ ] Check computed styles for size, color, opacity, and visibility.
- [ ] Confirm the `phase === 'peek'` condition is reached after `NOTCH_FULL_MS`.

---

## WIN-NOTCH-006: Hover does not reopen notch

### Reported behavior

When the notch has retracted, moving the mouse over it **does not reopen** the notification.

### Expected behavior

Hovering the retracted notch should reopen it (the "hover-reopen" behavior) so the user can read the message or start a reply.

### Actual behavior

Nothing happens on hover; the notch stays retracted.

### Suspected code areas

- `apps/windows/src/main/notch-window.ts` — the window is created with `focusable: false` and uses `setIgnoreMouseEvents`. If mouse events are not forwarded (`forward: true`), hover will not reach the renderer.
- `apps/windows/src/renderer/components/NotchWidget.tsx` — `onMouseEnter` / `onMouseLeave` handlers must call `reopenFromHoverTarget()` and `scheduleHoverLeave()`.
- `apps/windows/src/renderer/lib/useNotchLifecycle.ts` — `hovering` state drives `reopening`; verify the state transitions correctly.

### Diagnosis steps

- [ ] Confirm the notch window receives `mouseenter`/`mouseleave` events in the renderer (add logging).
- [ ] Verify `window.electronAPI.setIgnoreMouseEvents` is called with `forward: true` during peek/retracted phases.
- [ ] Test hover-reopen with and without `setIgnoreMouseEvents(forward:true)`.

---

## Repro steps (consolidated)

1. Start the Windows app in dev mode and join a circle.
2. Have another client send a single text message.
3. Observe the notch appearing at the top of the screen:
   - **WIN-NOTCH-004:** note the vertical size and any empty frames/boxes below the message.
   - **WIN-NOTCH-005:** after ~5 s, check whether a loading ring appears in the peek phase.
   - **WIN-NOTCH-006:** after the notch retracts, move the mouse over it and verify it reopens.

---

## Related documentation

- [Previous notch UX report](./windows-notch-ux-2026-06-30.md) — WIN-NOTCH-001/002/003 were marked fixed; these are follow-up/regression symptoms.
- [UI spec — Notch content](../../apps/windows/docs/ui-spec.md)
- [Plan 05 — Notch Peek + 60s History](../../apps/windows/docs/plans/05-notch-message-timer.md)
- [Plan 07 — Notch hover-stuck / retract deadlock fix](../../apps/windows/docs/plans/07-notch-retract-verify-fix.md)

---

## Changelog

| Date | Action |
|------|--------|
| 2026-07-06 | Initial report from user QA; filed by agent |
