# Plan 12: Notch vertical oversize fix

> **Status:** Implemented — pending human QA.  
> **Branch:** `platform/windows/notch-oversize-fix`  
> **Base:** `platform/windows/v2-clean`  
> **Type:** Bugfix  
> **Bug:** WIN-NOTCH-004

## Problem

When a single message arrives, the top-center notch is rendered much taller than expected, showing extra vertical space or "box" artefacts below the actual message content. The window size is fixed at `360 × 260 px` in the main process, but the renderer layout currently expands to fill the whole window even when the content is small, and can also overflow when the content is large.

## Root cause

1. `apps/windows/src/renderer/styles/global.css:497-514`  
   `.notch-widget` uses `min-height: 100%` with no `max-height` or `overflow`. This forces the widget to fill the fixed 260 px window even for a short message, creating the perceived empty "boxes" below the content.

2. `apps/windows/src/renderer/styles/global.css:632-636`  
   `.notch-content` has `display: flex; flex-direction: column; gap: 10px;` but no flex shrink constraints (`min-height: 0`) and no overflow rule. It can grow with its children.

3. `apps/windows/src/renderer/styles/global.css:638-645`  
   `.notch-history-list` has `max-height: 220px`, which is slightly larger than the available content area inside the 260 px window (260 − 26 − 18 = 216 px). This only applies in the reopened/history state anyway.

4. `apps/windows/src/renderer/styles/global.css:705-711`  
   `.message-text` has no `max-height` or `overflow`. Long single messages can take arbitrary vertical space.

5. `apps/windows/src/renderer/styles/global.css:937-945`  
   `.image-preview-row` uses `flex-wrap: wrap` with no row limit. Albums with many thumbnails add one or more full 72 px rows, pushing the bottom edge down.

6. `apps/windows/src/renderer/components/NotchWidget.tsx:282-288`  
   When `reopening` is true the component renders `.notch-history-list` (already capped), but in `full` it renders `renderMessageRow(newest)` directly inside `.notch-content`, bypassing the history list's height cap.

The fixed `NOTCH_HEIGHT = 260` in `apps/windows/src/main/notch-window.ts:11` sets the physical window bounds, but the renderer layout is not constrained to those bounds. Because the window is transparent, the visible dark area is exactly the `.notch-widget` background; forcing it to 260 px via `min-height` creates the oversized look for short messages.

## Fix

Make the notch content-aware but capped to the available window area, and clip or scroll any overflow.

### Renderer CSS changes

- `apps/windows/src/renderer/styles/global.css`
  - `.notch-widget`:
    - Remove `min-height: 100%`.
    - Add `max-height: 100%` so the widget never exceeds the fixed window.
    - Add `display: flex; flex-direction: column;` to lay out the content area.
    - Add `overflow: hidden;` so children cannot paint past the window bounds.  
      Caveat: this may clip the `::before` shadow and the `notch-enter` animation; if so, move the overflow clipping to an inner wrapper instead.
    - Keep padding, background, and transforms unchanged.
    - Normalize the indentation at line 498 to tabs (the file uses tabs everywhere else).
  - `.notch-content`:
    - Add `flex: 1 1 auto; min-height: 0;` so it participates in flex layout and can shrink to the parent's height.
    - Add `overflow-y: auto;` so excess content is clipped or scrollable instead of expanding the widget.
  - `.notch-history-list`:
    - Reduce `max-height` to fit inside the window, e.g. `max-height: calc(260px - 26px - 18px - 10px)` (≈ 206 px), or use `max-height: 100%` with the constrained flex parent.
    - Keep `overflow-y: auto;`.
  - `.message-text`:
    - Add `max-height: 4.5em` (about 4 lines at `line-height: 1.35`).
    - Add `overflow: hidden;` to clip longer text.
    - Optional: add `display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical;` for nicer ellipses.
  - `.image-preview-row`:
    - Limit to a single row with `flex-wrap: nowrap; overflow-x: auto;` or
    - Keep wrapping but add `max-height` for at most two rows (`2 * 72px + gap`). The single-row option is preferred for a compact notification.
  - `.reply-field` + `.reply-error`:
    - Ensure the reply area does not expand the widget; it should live inside the constrained `.notch-content` and use available space.

### Renderer component changes

- `apps/windows/src/renderer/components/NotchWidget.tsx`
  - In the `full` branch (`newest && (phase === 'full' || replyingTo === newest.id)`) wrap `renderMessageRow(newest)` in a constrained container (e.g. `.notch-single-message`) that applies the same height cap as `.notch-history-list`.
  - Alternatively, reuse `.notch-history-list` for the single-entry case so the existing cap applies consistently.

### Main process changes

- `apps/windows/src/main/notch-window.ts`
  - Keep `NOTCH_HEIGHT = 260` as the physical window size.
  - Content-aware window resizing is **out of scope** for this bugfix; it would require an IPC-driven resize helper and is a separate design decision.

## Files changed

- `apps/windows/src/renderer/styles/global.css` — remove forced full-height, constrain widget/content/text/image heights, add overflow clipping.
- `apps/windows/src/renderer/components/NotchWidget.tsx` — wrap single-message view in a height-capped container (or reuse history list).

## Verification

Run the existing automated checks:

```bash
cd apps/windows
bun run typecheck
bun test
```

Note: these checks validate TypeScript and business logic, but not the CSS layout. A visual/manual check is required.

### Manual QA steps

1. Single short text message:
   - Notch appears as a compact pill sized to the message; the dark background does not extend far below the content.

2. Single long text message (~500 characters):
   - Message text is clipped after ~4 lines.
   - Notch height does not exceed the fixed window area.

3. Single message with 8 image thumbnails:
   - Thumbnails render in one scrollable row (or at most two rows).
   - No vertical expansion past the window bounds.

4. Text + images + reply field open:
   - Reply input fits inside the notch; the overall height stays bounded.

5. Reopened history state:
   - `.notch-history-list` scrolls when more than ~4 entries are present.
   - No overflow beyond the notch window.

6. Display scaling:
   - Repeat steps 1–4 on a display with 125 % / 150 % scaling to confirm the fixed-pixel CSS still clips correctly.

7. Animation / shadow regression:
   - Verify `notch-enter` animation and `::before` shadow are not visibly clipped. If clipping occurs, move `overflow: hidden` from `.notch-widget` to an inner wrapper.

## Definition of done

- [ ] `.notch-widget` no longer forces `min-height: 100%` and is capped at `max-height: 100%`.
- [ ] `.notch-content` cannot grow past the available window height.
- [ ] Long `.message-text` is clipped/ellipsized.
- [ ] `.image-preview-row` is capped to one or two rows.
- [ ] Single-message `full` view uses the same height cap as the history list.
- [ ] `bun run typecheck` and `bun test` are green.
- [ ] Manual QA on Windows confirms no vertical oversize for text/images/reply.

## Risks / regression traps

- Removing `min-height: 100%` could make the widget collapse to content height; `max-height: 100%` and `overflow: hidden` keep it inside the window. Re-test empty/retracted states to ensure transforms still work.
- `overflow: hidden` on `.notch-widget` could clip the `notch-enter` animation or the `::before` shadow pseudo-element. If observed, apply `overflow: hidden` to an inner wrapper instead of the widget itself.
- Clipping `.message-text` hides part of long messages. This is intentional for a compact notification; full content remains available by reopening the history.
- Capping image previews to one row reduces visible thumbnails. If product prefers two rows, adjust `max-height` accordingly and re-test overflow.
- Changes to `.notch-content` height may affect the peek/retracted transform calculations. Confirm the sliver positions (18 px peek, 8 px retracted) still look correct.

## Implementation notes

### Changes applied

- `apps/windows/src/renderer/styles/global.css`
  - `.notch-widget`: removed `min-height: 100%`, added `max-height: 100%`, `display: flex; flex-direction: column;`.
  - `.notch-inner` (new inner wrapper): added `flex: 1 1 auto; min-height: 0; overflow: hidden;` to clip content without affecting the widget shadow/animation.
  - `.notch-content`: added `flex: 1 1 auto; min-height: 0;` and `overflow-y: auto;`.
  - `.notch-history-list`: reduced `max-height` to `calc(260px - 26px - 18px - 10px)`.
  - `.message-text`: added `max-height: 5.4em` (4 lines at `line-height: 1.35`), `overflow: hidden`, and `-webkit-line-clamp: 4`.
  - `.image-preview-row`: changed to single-row layout with `flex-wrap: nowrap` and `overflow-x: auto`.
- `apps/windows/src/renderer/components/NotchWidget.tsx`
  - Wrapped the single-message `full` branch (`renderMessageRow(newest)`) inside `.notch-history-list` so it shares the same height cap as the reopened history state.
  - Wrapped `.notch-content` inside the new `.notch-inner` container.
- `apps/windows/src/main/notch-window.ts`
  - Kept `NOTCH_HEIGHT = 260` unchanged; content-aware resizing remains out of scope.

### Automated checks

```bash
cd apps/windows
bun run typecheck   # ✅ green
bun test            # ✅ 195 pass / 2 skip / 0 fail
```

The 2 skipped tests cover Electron-only image codec loading.

### Open human verification

A visual/manual QA pass on Windows is still required before this fix is considered complete:

1. Single short text message renders as a compact pill without excess vertical space.
2. Single long text message (~500 characters) is clipped after ~4 lines; notch height stays within the window bounds.
3. Message with 8 image thumbnails shows a single scrollable row, no vertical overflow.
4. Text + images + open reply field fit inside the notch without expanding past the window.
5. Reopened history state scrolls correctly when more than ~4 entries are present.
6. `notch-enter` animation and `::before` shadow are not visibly clipped by `overflow: hidden`.
7. Repeat steps 1–5 at 125 % / 150 % display scaling.

> **Verification review follow-ups applied:**
> - `overflow: hidden` was moved from `.notch-widget` to a new inner wrapper `.notch-inner` so the `::before` shadow and `notch-enter` animation are not clipped.
> - `.message-text` `max-height` was aligned to `5.4em` to match four full lines at `line-height: 1.35`.

## Commit message

```text
fix(windows): let notch shrink to content and cap height to window bounds

Removes the forced min-height on the notch widget so short messages no
longer fill the entire 260 px window. Adds max-height and overflow
clipping so long messages and image previews cannot stretch past the
fixed window bounds. Message text is capped to ~4 lines and image
thumbnail rows are limited to a single scrollable row. The single-message
full view is wrapped so it shares the same height cap as the reopened
history list.

Fixes WIN-NOTCH-004
```
