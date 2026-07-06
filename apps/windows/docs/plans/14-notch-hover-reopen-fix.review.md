# Review: Plan 14 — Notch hover-reopen fix (WIN-NOTCH-006)

**Date:** 2026-07-06  
**Reviewer:** automated codebase review  
**Result:** Approve with minor corrections.

## Summary

The plan correctly identifies the geometric root cause: `.notch-hover-target` is anchored to the top of the widget, while Plans 12 and 13 moved the visible collapsed tab to the bottom. The proposed CSS-only fix (`top: 0` → `bottom: 0`) is technically correct, minimal, and consistent with the previous fixes. No JSX, main-process, or lifecycle changes are required.

However, the plan recommends adding a redundant unit test and makes a few statements that should be clarified or corrected before implementation.

## Concrete corrections

### 1. Proposed new test is already covered

The plan suggests adding a test in `apps/windows/src/renderer/lib/__tests__/useNotchLifecycle.test.ts` that:

- calls `result.current.reopenFromHoverTarget()` after the notch reaches `peek`,
- expects `hovering === true`, `reopening === true`, and `notchSetInteractive` last called with `true`.

This is already covered by the existing test **"hover-stuck repro: hovering never clears but empty-hide still fires"** (lines 195–235), which performs exactly those assertions. Adding a duplicate test would only increase maintenance burden without improving coverage.

**Correction:** Remove the "New / updated automated test" section. Instead, add a note that the existing test suite already verifies the lifecycle path from `reopenFromHoverTarget()` to interactivity. If additional coverage is desired, a component-level or visual test would be more appropriate for the CSS geometry change, but that is out of scope for this bugfix.

### 2. `z-index: 3` on `.notch-sliver` is defensive, not required

The plan proposes adding `z-index: 3` to `.notch-sliver` to keep the hover target above it. While this is safe and makes the stacking order explicit, it is not strictly necessary because `.notch-hover-target` already has `z-index: 4` and both elements are positioned within the same stacking context (`.notch-widget` is `position: relative`). The target will render above the sliver regardless of DOM order.

**Correction:** Keep the proposal but label it as a defensive/explicit stacking clarification, not a functional requirement.

### 3. Cursor hint is optional and may have no visible effect

The optional `cursor: default` on `.notch-hover-target` is harmless, but on Windows with `setIgnoreMouseEvents(true, { forward: true })` active in `peek`/`retracted`, the OS may not honor the CSS cursor because the window is click-through. The cursor is likely determined by the window beneath the notch.

**Correction:** Keep it as an optional polish item, but note that its effect may not be visible in `peek`/`retracted`.

### 4. Clarify interaction with `.notch-widget` mouse handlers

`.notch-widget` already has `onMouseEnter={cancelHoverLeave}` and `onMouseLeave={scheduleHoverLeave}` (`NotchWidget.tsx:268–269`). Moving the hover target to the bottom does not replace these handlers; it adds the `reopenFromHoverTarget` trigger over the visible sliver. The plan could make this clearer so a future implementer does not mistakenly remove the widget-level handlers.

**Correction:** Add a short sentence in the "Renderer component changes" section confirming that the existing widget-level `onMouseEnter`/`onMouseLeave` handlers remain unchanged.

## Corrected / approved plan

The plan can be implemented essentially as written, with the following minor adjustments.

### Renderer CSS changes (`apps/windows/src/renderer/styles/global.css`)

```css
.notch-hover-target {
  position: absolute;
  bottom: 0;          /* changed from top: 0 */
  left: 0;
  right: 0;
  height: 24px;
  z-index: 4;
  cursor: default;    /* optional polish, may not show in peek/retracted */
}

.notch-full .notch-hover-target,
.notch-reopened .notch-hover-target {
  pointer-events: none;
}

.notch-sliver {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 52px;
  height: 20px;
  opacity: 1;
  transition: opacity 0.2s ease-out, transform 0.3s ease;
  z-index: 3;         /* defensive: keep target above sliver */
}
```

### Renderer component changes

No JSX changes. The existing hover target at `NotchWidget.tsx:271` already carries `onMouseEnter={reopenFromHoverTarget}`. Keep the widget-level `onMouseEnter={cancelHoverLeave}` and `onMouseLeave={scheduleHoverLeave}` unchanged.

### Main-process / lifecycle changes

None. `main.ts:177–180` and `useNotchLifecycle.ts:159–162` already implement the correct interactive/forwarding contract.

### Verification

Run:

```bash
cd apps/windows
bun run typecheck
bun test
```

No new unit test is required; the existing `hover-stuck repro` test already covers the `reopenFromHoverTarget()` → interactivity path.

### Manual QA

The manual QA steps in the original plan are correct and should be retained, including:

1. Hover the visible sliver in `peek` and verify the notch reopens.
2. Hover the minimal grabber tab in `retracted` and verify reopening.
3. Confirm that clicking message body, reply field, copy/reply buttons, and channel toggle still work in `full`.
4. Confirm that scrolling, copy, and reply work in `reopened` — the hover target must be `pointer-events: none` in this state.
5. Repeat at 125% and 150% display scaling.
6. Confirm WIN-NOTCH-004/005 remain fixed: no vertical oversize, peek loading ring visible, hover-reopen works over it.

## Definition of done (unchanged)

- [ ] `.notch-hover-target` is anchored to the bottom of `.notch-widget`.
- [ ] Hovering the visible sliver/tab in `peek` reopens the notch.
- [ ] Hovering the grabber tab in `retracted` reopens the notch.
- [ ] The hover target does not intercept clicks in `full` or `reopened` states.
- [ ] `bun run typecheck` and `bun test` are green.
- [ ] Manual QA on Windows confirms hover-reopen in both `peek` and `retracted`.

## Risks / regression traps (reviewed)

- **Stacking order:** Adding `z-index: 3` to `.notch-sliver` is defensive; the hover target at `z-index: 4` already wins. OK to keep.
- **Pointer-events in expanded states:** The existing `pointer-events: none` rule for `.notch-full`/`.notch-reopened` must remain in place. Correctly noted in the plan.
- **Clipping by `.notch-inner`:** The hover target must remain a sibling of `.notch-inner`; the plan correctly warns against moving it inside.
- **Click-through forwarding:** Already correct in `main.ts`; the fix only changes which element receives the forwarded event.
- **Hover-stuck reopening:** Plan 07 already prevents this from blocking hide. Correctly noted.
- **Visual overlap:** The hover target is transparent; no visual regression expected. Correct.

## Final verdict

**Approve with minor corrections.** The root-cause analysis is accurate, the CSS fix is minimal and low-risk, and the plan is internally consistent with Plans 12 and 13. The only material change needed is removing the redundant unit-test proposal and clarifying a few optional/defensive points.
