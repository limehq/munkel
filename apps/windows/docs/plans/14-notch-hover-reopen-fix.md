# Plan 14: Notch hover-reopen fix (WIN-NOTCH-006)

> **Status:** Implemented — pending human QA.  
> **Branch:** `platform/windows/notch-hover-reopen-fix`  
> **Base:** `platform/windows/v2-clean`  
> **Type:** Bugfix  
> **Bug:** WIN-NOTCH-006

## Problem

When the notch has collapsed to the `peek` or `retracted` phase, moving the mouse over the visible tab/sliver does **not** reopen the notification. The user expects the notch to expand on hover so they can read the message or start a reply.

## Root cause

The hover detection element is positioned at the **top** of the widget, while the visible part of a collapsed notch is now the **bottom** edge:

1. `apps/windows/src/renderer/components/NotchWidget.tsx:271` renders the hover target unconditionally when there is history:
   ```tsx
   {history.length > 0 && <div className="notch-hover-target" onMouseEnter={reopenFromHoverTarget} />}
   ```
2. `apps/windows/src/renderer/styles/global.css:562-568` places that target at the top of the widget:
   ```css
   .notch-hover-target {
     position: absolute;
     top: 0;
     left: 0;
     right: 0;
     height: 24px;
     z-index: 4;
   }
   ```
3. Plan 12 (WIN-NOTCH-004) made the widget content-aware: the widget no longer always fills the full `260px` window, so in collapsed states most of the widget is above the visible window area.
4. Plan 13 (WIN-NOTCH-005) moved the visible sliver (loading ring + grabber) to the bottom of the widget and changed the collapsed transforms to expose only the bottom edge:
   ```css
   .notch-widget.notch-peek       { transform: translateY(calc(-100% + 20px)); }
   .notch-widget.notch-retracted  { transform: translateY(calc(-100% + 12px)); }
   ```
   (`apps/windows/src/renderer/styles/global.css:545-551`)
5. As a result, `.notch-hover-target` is now located **above** the visible `20px`/`12px` tab. The mouse can only interact with the bottom sliver (`.notch-sliver`), but that element has no `onMouseEnter` handler.

### Main-process / lifecycle side is already correct

- `apps/windows/src/main/main.ts:177-179` already forwards mouse events while the window is click-through:
  ```ts
  notchWindow?.setIgnoreMouseEvents(!interactive, { forward: true });
  ```
- `apps/windows/src/renderer/lib/useNotchLifecycle.ts:159-162` already toggles interactivity based on `phase === 'full' || reopening || replyOpen`, so the window becomes interactive again as soon as `hovering` flips to `true`.
- Plan 07 removed the `!hovering` gate from the empty-hide timer, which prevents a stuck hover from blocking the hide path. That change is compatible with this fix.

The missing link is purely geometric: the hover target must cover the visible collapsed area.

## Fix

Move the hover target to the bottom of the widget so it overlays the visible sliver in `peek` and `retracted` states. Keep it inactive (`pointer-events: none`) in `full`/`reopened` states so it does not block content or buttons.

### Renderer CSS changes

`apps/windows/src/renderer/styles/global.css`

- `.notch-hover-target` (lines 562–568):
  - Change `top: 0;` to `bottom: 0;`.
  - Keep `left: 0; right: 0; height: 24px; z-index: 4;`.
  - The 24px height comfortably covers the 20px sliver in `peek` and the 12px grabber in `retracted`.
- `.notch-sliver` (lines 576–589):
  - Add an explicit `z-index: 3;` as a defensive clarification of the stacking order. The hover target already has `z-index: 4` and will render above the sliver even without this change.
- Existing rule `.notch-full .notch-hover-target, .notch-reopened .notch-hover-target { pointer-events: none; }` (lines 571–574) is kept unchanged.

### Renderer component changes

`apps/windows/src/renderer/components/NotchWidget.tsx`

- No JSX change is required. The existing target already carries `onMouseEnter={reopenFromHoverTarget}` (line 271). Once the CSS moves it over the visible sliver, that handler will fire as expected.
- Keep the widget-level `onMouseEnter={cancelHoverLeave}` and `onMouseLeave={scheduleHoverLeave}` unchanged; they are not replaced by this fix.
- Optional polish: add `cursor: default;` to `.notch-hover-target`. Note that in `peek`/`retracted` the window is click-through, so the OS may not honor this cursor.

### Main process / lifecycle changes

- None. `apps/windows/src/main/main.ts` and `apps/windows/src/renderer/lib/useNotchLifecycle.ts` already implement the correct interactive/forwarding contract.

## Files changed

- `apps/windows/src/renderer/styles/global.css` — move `.notch-hover-target` to the bottom and clarify sliver z-index.
- `apps/windows/src/renderer/components/NotchWidget.tsx` — no functional change (CSS-only fix).

## Verification

Run the existing automated checks:

```bash
cd apps/windows
bun run typecheck
bun test
```

### Automated tests

No new unit test is required. The existing test **"hover-stuck repro: hovering never clears but empty-hide still fires"** in `apps/windows/src/renderer/lib/__tests__/useNotchLifecycle.test.ts` already verifies that calling `reopenFromHoverTarget()` sets `hovering = true`, `reopening = true`, and calls `notchSetInteractive(true)`. The bug is purely geometric/CSS-based.

### Manual QA steps on Windows

1. Receive a single short text message.
2. Wait for `full → peek` (~5s).
3. Hover the visible bottom sliver:
   - The notch reopens (shows the newest message or the full history list).
   - Moving the mouse away causes it to retract after ~150ms.
4. Wait for `peek → retracted` (~30s).
5. Hover the minimal grabber tab at the bottom:
   - The notch reopens again.
6. While the notch is `full`, verify that clicking the message body, reply field, copy/reply buttons, and channel toggle still work.
7. While the notch is `reopened` (history list visible), verify scrolling, copy, and reply work — the hover target must be `pointer-events: none` in this state.
8. Repeat at 125% and 150% display scaling.
9. Confirm that WIN-NOTCH-004/005 remain fixed: no vertical oversize and the peek loading ring is still visible and hover-reopen works over it.

## Definition of done

- [ ] `.notch-hover-target` is anchored to the bottom of `.notch-widget`.
- [ ] Hovering the visible sliver/tab in `peek` reopens the notch.
- [ ] Hovering the grabber tab in `retracted` reopens the notch.
- [ ] The hover target does not intercept clicks in `full` or `reopened` states.
- [ ] `bun run typecheck` and `bun test` are green.
- [ ] Manual QA on Windows confirms hover-reopen in both `peek` and `retracted`.

## Risks / regression traps

- **Stacking order:** If `.notch-sliver` renders above `.notch-hover-target`, the hover target will not receive events. Give `.notch-sliver` an explicit lower `z-index` (e.g., `3`) and keep the target at `z-index: 4`.
- **Pointer-events in expanded states:** The existing `.notch-full .notch-hover-target, .notch-reopened .notch-hover-target { pointer-events: none; }` rule must stay in place. Without it, the transparent target could block clicks on message content or the reply field.
- **Clipping by `.notch-inner`:** `.notch-inner` has `overflow: hidden`. `.notch-hover-target` must remain a sibling of `.notch-inner` (as it currently is) and not be moved inside the inner wrapper.
- **Click-through forwarding:** With `setIgnoreMouseEvents(true, { forward: true })`, mouse events are delivered to the renderer even when the window is click-through. This is already the behavior; the fix only changes which element receives the event.
- **Hover-stuck reopening:** A missing `mouseleave` could leave `hovering = true` and keep the notch interactive. Plan 07 already prevents this from blocking hide when the buffer empties. If keeping the notch open indefinitely while messages are present is considered a problem, that should be tracked as a separate follow-up.
- **Visual overlap:** The hover target is transparent, so the sliver/grabber/ring remain visible. No visual regression is expected.

## Related bugs

- **WIN-NOTCH-004:** Plan 12 made the widget content-aware and therefore exposed the hover-target mismatch.
- **WIN-NOTCH-005:** Plan 13 moved the sliver to the bottom; the same positioning logic must now be applied to the hover target.
- **Plan 07:** The hover-stuck fix removed the `!hovering` gate from the empty-hide timer and is a prerequisite for reliable hover behavior.

## Commit message

```text
fix(windows): reopen notch on hover by moving hover target to visible sliver

The hover target was absolutely positioned at the top of the notch
widget. After the content-aware height fix (WIN-NOTCH-004) and the
bottom-anchored sliver fix (WIN-NOTCH-005), the visible collapsed tab
is now the bottom edge of the widget, so the top hover target was
outside the visible window area and could not receive mouse events.

Move .notch-hover-target from top: 0 to bottom: 0 so it covers the
visible sliver in peek/retracted states. Keep pointer-events: none in
full/reopened states so message content and buttons remain clickable.

Fixes WIN-NOTCH-006
```

## Implementation notes

### Changes made

- `apps/windows/src/renderer/styles/global.css`:
  - `.notch-hover-target` moved from `top: 0` to `bottom: 0` so it overlays the visible sliver in `peek` and `retracted` states.
  - Defensive `z-index: 3` added to `.notch-sliver`; hover target remains at `z-index: 4`.
  - Optional `cursor: default` polish added to the hover target.
  - Existing `pointer-events: none` rule for `.notch-full`/`.notch-reopened` kept unchanged.
- `apps/windows/src/renderer/components/NotchWidget.tsx`: no functional change required; the existing `onMouseEnter={reopenFromHoverTarget}` target now sits over the visible area.

### Automated checks

```bash
cd apps/windows
bun run typecheck   # ✅ green
bun test            # ✅ 195 pass / 2 skip / 0 fail
```

### Open human verification

- Visual QA on Windows: hover over the `peek` sliver (with loading ring) and the `retracted` grabber tab to confirm the notch reopens.
- Verify that clicks on message content, reply field, copy/reply buttons, and channel toggle remain unaffected in `full`/`reopened` states.
- Repeat at 125% and 150% display scaling.
- Confirm WIN-NOTCH-004/005 remain fixed.
