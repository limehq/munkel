# Windows notch regression — bug report (2026-07-06)

**Reporter:** User (manual QA)  
**Platform:** Windows client (`apps/windows`)  
**Branch at report time:** `platform/windows/v2-clean`  
**Status:** Implemented pending human QA — all regressions (WIN-NOTCH-004 through WIN-NOTCH-008) are fixed in code; visual/manual QA on Windows is still outstanding.

## Summary

Three notch issues were observed when receiving a single incoming message on Windows. They are filed as one cluster because they all affect the top-center notification lifecycle and may share root causes in the renderer layout, phase state machine, or mouse-event forwarding.

| ID | Symptom | Severity |
|----|---------|----------|
| [WIN-NOTCH-004](#win-notch-004-notch-renders-vertically-oversized) | Notch renders too tall, showing multiple vertical frame/box artefacts | High |
| [WIN-NOTCH-005](#win-notch-005-loading-ring-not-visible) | Peek-phase loading/activity ring is not visible | Medium |
| [WIN-NOTCH-006](#win-notch-006-hover-does-not-reopen-notch) | Hovering the retracted notch does not reopen it | High |
| [WIN-NOTCH-007](#win-notch-007-hover-should-show-stage-2-preview-not-reset-timer) | Hover resets the message expiry timer instead of showing a stage-2 preview | High |
| [WIN-NOTCH-008](#win-notch-008-recent-message-history-not-displayed) | Recent message history is not shown in the notch | High — fixed, human QA pending |

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

- [x] Capture screenshot + actual `BrowserWindow` bounds when a single message is shown.
- [x] Inspect renderer DOM: identify which elements contribute to the excess height (empty history rows, reply placeholder, margins, etc.).
- [x] Check `screen.getPrimaryDisplay().scaleFactor` and whether CSS uses fixed px vs. DPI-aware units.
- [x] Compare `notch-window.ts` fixed `NOTCH_HEIGHT` against the renderer's actual content height.

### Fix

Implemented via Plan 12 (`apps/windows/docs/plans/12-notch-oversize-fix.md`):

- **CSS height cap on the widget:** `.notch-widget` no longer forces `min-height: 100%`; it now uses `max-height: 100%`, `display: flex; flex-direction: column;` so it can shrink to content but never exceed the fixed 260 px window.
- **Inner clipping wrapper:** Added `.notch-inner` with `flex: 1 1 auto; min-height: 0; overflow: hidden;` to clip overflowing content without clipping the widget's `::before` shadow or `notch-enter` animation.
- **Constrained content area:** `.notch-content` received `flex: 1 1 auto; min-height: 0;` and `overflow-y: auto;` so it participates in the flex layout without growing past the available window height.
- **Message text clamping:** `.message-text` now uses `max-height: 5.4em` (4 lines at `line-height: 1.35`), `overflow: hidden`, and `-webkit-line-clamp: 4` to keep long single messages compact.
- **Image preview row limit:** `.image-preview-row` was changed to `flex-wrap: nowrap` with `overflow-x: auto`, capping thumbnails to a single scrollable row.
- **Single-message wrapper:** In `NotchWidget.tsx`, the `full` branch now wraps `renderMessageRow(newest)` inside `.notch-history-list`, giving single messages the same height cap as the reopened history state.

> **Status:** Code is implemented and automated checks are green. **Visual/manual QA on Windows is still pending** (see Plan 12 verification section).

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

- [x] Inspect the renderer DOM during peek phase and verify the ring element exists.
  - Confirmed: ring element is rendered; it is positioned outside the visible peek area.
- [x] Check computed styles for size, color, opacity, and visibility.
  - Confirmed: styles are correct; the sliver is clipped because it lives at the top of the widget while the peek transform exposes the bottom edge.
- [x] Confirm the `phase === 'peek'` condition is reached after `NOTCH_FULL_MS`.
  - Confirmed: condition is reached; bug is purely layout/CSS-based.

### Fix

Implemented via Plan 13 (`apps/windows/docs/plans/13-notch-loading-ring-fix.md`):

- **Sliver nach unten verschoben:** `.notch-sliver` wurde von `top: 8px` auf `bottom: 0` umgestellt, damit der Ladekreis + Grabber an der unteren Kante des Notch-Widgets verankert sind.
- **Peek-Transform angepasst:** Exposed height von 18 px auf 20 px erhöht (`translateY(calc(-100% + 20px))`), damit die vollen 20 px des Slivers sichtbar sind.
- **Retracted-Transform angepasst:** Exposed height von 8 px auf 12 px erhöht (`translateY(calc(-100% + 12px))`), damit der Grabber-Tab vollständig sichtbar bleibt.
- **Keine JSX-Änderungen:** Die Render-Bedingung `phase === 'peek' && !expanded` und die SVG-Attribute (`RING_RADIUS`, `RING_CIRCUMFERENCE`) wurden nicht verändert.

> **Status:** Code is implemented and automated checks are green. **Visual/manual QA on Windows is still pending** (see Plan 13 verification section).

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

- [x] Confirm the notch window receives `mouseenter`/`mouseleave` events in the renderer.
  - Renderer events are delivered correctly; the issue is geometric, not lifecycle-related.
- [x] Verify `window.electronAPI.setIgnoreMouseEvents` is called with `forward: true` during peek/retracted phases.
  - Already implemented in `apps/windows/src/main/main.ts` and `useNotchLifecycle.ts`; no change required.
- [x] Test hover-reopen with and without `setIgnoreMouseEvents(forward:true)`.
  - Root cause identified: the hover target was positioned at the top of the widget, above the visible collapsed sliver.

### Fix

Implemented via Plan 14 (`apps/windows/docs/plans/14-notch-hover-reopen-fix.md`):

- **Hover-Target nach unten verschoben:** `.notch-hover-target` wurde von `top: 0` auf `bottom: 0` umgestellt, damit er den sichtbaren Sliver in den `peek`- und `retracted`-Zuständen überlagert.
- **z-index defensiv geklärt:** `.notch-sliver` erhielt explizit `z-index: 3`, während `.notch-hover-target` bei `z-index: 4` bleibt, damit Events eindeutig beim Hover-Target ankommen.
- **Keine JSX-Änderungen:** `NotchWidget.tsx` nutzt weiterhin `onMouseEnter={reopenFromHoverTarget}` an der bestehenden Hover-Target-DIV. Die vorhandene `pointer-events: none`-Regel für `.notch-full`/`.notch-reopened` verhindert weiterhin, dass das transparente Target Inhalt oder Buttons blockiert.

> **Status:** Code is implemented and automated checks are green. **Visual/manual QA on Windows is still pending** (see Plan 14 verification section).

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
| 2026-07-06 | Fix implemented (Plan 12): CSS height cap, inner wrapper, message clamping, image-preview row limit, single-message wrapper; automated checks green; human QA pending |
| 2026-07-06 | Fix implemented (Plan 13): sliver anchored to bottom, peek/retracted exposed heights adjusted; automated checks green; human QA pending |
| 2026-07-06 | Fix implemented (Plan 14): hover target moved to bottom of widget, sliver z-index clarified defensively; automated checks green; human QA pending |
| 2026-07-06 | New issues identified during manual QA: WIN-NOTCH-007 (hover timer/stage-2 preview) and WIN-NOTCH-008 (history not displayed) |
| 2026-07-06 | Fix implemented (Plan 15): new `ui` state, stage-2 preview on hover without resetting the 60-second expiry timer, click-to-open; automated checks green; human QA pending |
| 2026-07-06 | Fix implemented (Plan 16): history list now rendered in `full`, `open` and reply-open states; automated checks green (211 pass / 2 skip / 0 fail); human QA pending, with focus on WIN-NOTCH-004 oversize regression |

---

## WIN-NOTCH-007: Hover should show stage-2 preview, not reset timer

### Reported behavior

When the user moves the mouse over a retracted/peeked notch, the current implementation appears to reset the message-expiry timer. The expected behavior is different:

- A new incoming message starts a **60-second expiry timer**.
- This timer should remain visible/running for the full 60 seconds.
- When the notch retracts and the user hovers over it, the notch should **partially reopen to a stage-2 preview** (more than the tiny peek tab, but not the full panel).
- The user must **actively click** the notch to fully reopen it.
- Hovering must **not reset** the 60-second expiry timer.

### Expected behavior

- `full` (5 s) → `peek`/`retracted` with visible timer/ring.
- Hover in collapsed state → expand to an intermediate **stage-2 preview** (e.g., larger peek showing sender + truncated text or a few recent messages).
- Click on the preview → transition to `full`/`reopened` history view.
- Mouse leave → return to collapsed state (timer continues).
- Timer expiry after 60 s → history pruned/notch hidden as before.

### Suspected code areas

- `apps/windows/src/renderer/lib/useNotchLifecycle.ts` — hover/reopen state and timer interaction.
- `apps/windows/src/renderer/lib/notch-phase.ts` — phase state machine; may need a new intermediate phase.
- `apps/windows/src/renderer/components/NotchWidget.tsx` — rendering of collapsed vs. stage-2 vs. full states.
- `apps/windows/src/renderer/styles/global.css` — transforms for the new intermediate preview height.

### Diagnosis steps

- [x] Confirm that `phase` timers are keyed only on `newest?.id` and are not reset by hover.
  - Confirmed: `ui` is kept out of the phase-effect dependency array; the 60-second prune interval is independent.
- [x] Verify that the old `hovering`/`reopening` boolean conflates hover with full open.
  - Confirmed: `reopening = hovering` caused every hover to render the full history panel.
- [x] Check whether a distinct preview state can be introduced without changing the timer logic.
  - Confirmed: a separate `ui` state (`collapsed | preview | open`) is orthogonal to `phase`.

### Fix

Implemented via Plan 15 (`apps/windows/docs/plans/15-notch-hover-stage2-fix.md`):

- **New `ui` state:** `useNotchLifecycle.ts` now exposes `ui: 'collapsed' | 'preview' | 'open'` instead of the flat `hovering` boolean. `phase` remains the canonical message-expiry timer and is untouched by hover.
- **Stage-2 preview on hover:** Hovering the collapsed notch (`peek`/`retracted`) enters `ui = 'preview'` and renders a compact teaser (sender avatar + name + 2-line snippet). The preview is clickable but does not show copy/reply buttons.
- **Timer is not reset:** The 60-second expiry timer and the `full → peek → retracted` phase transitions continue to run while the notch is in `preview`; mouse leave returns to `collapsed` without rescheduling anything.
- **Click to open:** Clicking the preview calls `openFromPreview()` and sets `ui = 'open'`, showing the full history/reply view. `scheduleHoverLeave` leaves `ui = 'open'` unchanged on mouse leave.
- **External IPC:** `onNotchReopen` transitions to `ui = 'open'`; `onNotchHide` resets to `ui = 'collapsed'` and closes any reply field.
- **CSS:** Added `.notch-preview` transform and `.notch-preview-content` layout so the preview expands above the visible bottom sliver.

> **Status:** Code is implemented and automated checks are green. **Visual/manual QA on Windows is still pending** (see Plan 15 verification section).

---

## WIN-NOTCH-008: Recent message history not displayed

### Reported behavior

The notch does not show the recent message history. The user expects to see the last messages when the notch is reopened or in the stage-2 preview.

### Expected behavior

- The notch keeps the last messages received within the 60-second window.
- When the notch is opened (full/reopened/stage-2), the recent history is visible.
- History entries are pruned correctly after 60 seconds.

### Suspected code areas

- `apps/windows/src/renderer/lib/useNotchLifecycle.ts` — `history` array and pruning logic.
- `apps/windows/src/renderer/lib/prune-notch-history.ts` — pruning function.
- `apps/windows/src/renderer/components/NotchWidget.tsx` — history rendering branch (`reopening` state).
- `apps/windows/src/main/notch-window.ts` / group session — incoming messages may not be appended to history correctly.

### Fix

Implemented via Plan 16 (`apps/windows/docs/plans/16-notch-history-display-fix.md`):

- **History in allen geöffneten Zuständen sichtbar:** `expanded` wurde um `phase === 'full'` und `replyOpen` erweitert, sodass `.notch-history-list` jetzt immer dann gerendert wird, wenn die Notch geöffnet ist (`full`, `open` oder geöffneter Reply).
- **Keine Änderung an Lifecycle/Pruning:** `useNotchLifecycle.ts` und `prune-notch-history.ts` blieben unverändert; History-State und 60-Sekunden-Pruning waren bereits korrekt.
- **Peek/Retracted/Preview unverändert:** Kollabierte Zustände zeigen weiterhin nur den Sliver bzw. die einzeilige Preview.
- **Reply-Verhalten dokumentiert:** Ein geöffneter Reply auf einen älteren Eintrag bleibt sichtbar, solange der Eintrag in der History liegt; er wird weiterhin bei neuer Nachricht oder beim Pruning des Eintrags geschlossen.

> **Status:** Code is implemented and automated checks are green (211 pass / 2 skip / 0 fail). **Visual/manual QA on Windows is still pending**, especially to confirm no regression for WIN-NOTCH-004 (Oversize) with many messages, images, or an open reply. See Plan 16 verification section.
