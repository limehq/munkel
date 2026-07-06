# Plan 13: Notch peek loading ring fix (WIN-NOTCH-005)

> **Status:** Implemented — pending human QA.  
> **Branch:** `platform/windows/notch-loading-ring-fix`  
> **Base:** `platform/windows/v2-clean`  
> **Type:** Bugfix  
> **Bug:** WIN-NOTCH-005

## Problem

After the initial 5-second `full` phase, the notch should enter `peek` and show a white reverse-draining progress ring in the top sliver. Manual QA reports that the ring is not visible during `peek`.

## Root cause

1. `apps/windows/src/renderer/components/NotchWidget.tsx:273-278` renders the ring when `phase === 'peek' && !expanded`. The condition is correct and the SVG element is present in the DOM.

2. `apps/windows/src/renderer/styles/global.css:576-589` positions `.notch-sliver` at `top: 8px` inside `.notch-widget`.

3. `apps/windows/src/renderer/styles/global.css:545-551` translate the widget upward in collapsed states:
   - `.notch-peek { transform: translateY(calc(-100% + 18px)); }`
   - `.notch-retracted { transform: translateY(calc(-100% + 8px)); }`

   These transforms expose only the **bottom** 18 px (peek) or 8 px (retracted) of the widget.

4. The fundamental mismatch is that the sliver (ring + grabber) lives near the **top** of the widget, but the visible peek/retracted tab is the **bottom** part of the widget. Plan 12 (WIN-NOTCH-004) made the widget content-aware: in `peek` it collapses to roughly its padding height (~44 px) because no message content is rendered. This turned a partial clipping issue into a near-total one — the sliver is now almost completely above the visible window area.

5. The SVG geometry and animation attributes are correct:
   - `RING_RADIUS = 8`, `RING_CIRCUMFERENCE = 2 * π * 8 ≈ 50.27`
   - `viewBox="0 0 20 20"`, `cx="10" cy="10" r="8"`
   - `stroke-dasharray: var(--ring-circumference)`
   - `animation: notch-ring-drain 30s linear forwards`

   The ring itself is not broken; it is only invisible because its container is positioned outside the exposed peek area.

## Fix

Anchor the sliver to the bottom of the widget so that the exposed bottom edge of the collapsed widget contains the ring and grabber. Minor height adjustments to the peek/retracted exposed areas ensure the 20 px sliver is not clipped.

### Renderer CSS changes

`apps/windows/src/renderer/styles/global.css`

- `.notch-sliver` (lines 576–589):
  - Change `top: 8px` to `bottom: 0`.
  - Keep `height: 20px`, `display: inline-flex`, `align-items: center`, `justify-content: center`, `gap: 8px`, and the existing opacity/transform transitions.
  - The sliver must remain a sibling of `.notch-inner` so it is not clipped by `.notch-inner { overflow: hidden; }`.
  - Note: `.notch-widget` has a 20 px bottom border-radius, but the sliver is horizontally centered and the ring/grabber do not reach into the corners, so no clipping occurs.

- `.notch-widget.notch-peek` (line 545–547):
  - Increase exposed height from 18 px to 20 px so the full 20 px sliver is visible:
    ```css
    .notch-widget.notch-peek {
      transform: translateY(calc(-100% + 20px));
    }
    ```

- `.notch-widget.notch-retracted` (line 549–551):
  - Increase exposed height from 8 px to 12 px so the grabber remains visible when the ring is hidden:
    ```css
    .notch-widget.notch-retracted {
      transform: translateY(calc(-100% + 12px));
    }
    ```

- `.notch-full .notch-sliver, .notch-reopened .notch-sliver` (lines 591–595):
  - No change required. The sliver is already hidden via `opacity: 0` and `transform: translate(-50%, -8px)` in these states.

### Renderer component changes

`apps/windows/src/renderer/components/NotchWidget.tsx`

- No JSX changes required. Keep the sliver as a sibling of `.notch-inner` and keep the existing ring render condition at line 273:
  ```tsx
  {phase === 'peek' && !expanded && (
    <svg className="notch-ring" ...>...</svg>
  )}
  ```
- Do not change `RING_RADIUS`, `RING_CIRCUMFERENCE`, or the SVG attributes.

### Main process changes

- None. `apps/windows/src/main/notch-window.ts` keeps `NOTCH_HEIGHT = 260`.

## Files changed

- `apps/windows/src/renderer/styles/global.css` — reposition sliver to bottom and adjust collapsed exposed heights.

## Verification

Run the existing automated checks:

```bash
cd apps/windows
bun run typecheck
bun test
```

These validate TypeScript and business logic but not the visual layout. No new unit tests are added for this change because the bug is purely visual/CSS-based. A manual QA pass on Windows is required.

### Manual QA steps

1. Receive a single short text message.
2. Wait ~5 s for the `full → peek` transition.
3. Observe the peek sliver:
   - A white progress ring is visible.
   - The **entire** 20 px ring is visible (not just the bottom half).
   - The ring drains counter-clockwise over ~30 s.
4. Wait another ~30 s for `peek → retracted`.
   - The ring disappears.
   - A minimal grabber tab remains fully visible.
5. Enable **Settings → Accessibility → Show animations = off** (or `prefers-reduced-motion: reduce`):
   - The ring should show a static half-drained state instead of animating.
6. Repeat at 125 % and 150 % display scaling.
7. Verify that hovering the visible sliver still reopens the notch (this overlaps with WIN-NOTCH-006; if it does not, the hover target position must be adjusted in the WIN-NOTCH-006 fix).

## Definition of done

- [x] `.notch-sliver` is anchored to the bottom of `.notch-widget`.
- [x] The peek transform exposes enough height (20 px) to show the full sliver and ring.
- [x] The retracted transform exposes enough height (12 px) to show the grabber tab.
- [ ] The ring is visible during the entire 30-second peek phase. *(pending manual QA)*
- [ ] The entire 20 px ring is visible (no partial clipping at the top). *(pending manual QA)*
- [ ] The ring animation still drains over 30 s. *(pending manual QA)*
- [x] `bun run typecheck` and `bun test` are green.
- [ ] Manual QA on Windows confirms the ring is visible in peek and the grabber remains visible in retracted.

## Risks / regression traps

- **Visual change in full/reopened states:** The sliver is hidden in these states via `opacity: 0`, so moving it to the bottom has no visual effect there. Verify the fade-out animation still looks correct.
- **DOM structure regression:** `.notch-sliver` must stay a sibling of `.notch-inner`. If it is accidentally moved inside `.notch-inner`, it will be clipped by `overflow: hidden`.
- **Hot-reload / dynamic position change:** `top`/`bottom` are not covered by the sliver's `transition` (only `opacity` and `transform`). In a normal lifecycle the sliver position is static, so this is not an issue; it only matters if the property is toggled dynamically.
- **Hover detection (WIN-NOTCH-006):** `.notch-hover-target` is currently at `top: 0` and shares the same root cause. This plan intentionally fixes only the ring visibility; the hover target should be repositioned separately as part of WIN-NOTCH-006. If both fixes land together, ensure the hover target covers the visible sliver area.
- **Compactness regression:** Increasing peek from 18 px to 20 px and retracted from 8 px to 12 px makes the collapsed notch slightly taller. This is necessary to fit the 20 px sliver and should be acceptable.
- **Display scaling:** Fixed-pixel values may appear larger at 150 % scaling. The sliver is still expected to fit because the transform and sliver heights use the same pixel units.
- **Future design conflict:** If a future design requires the grabber at the top of the panel, this bottom-anchored approach must be revisited. Document the rationale in the plan and commit message.

## Related bugs

- **WIN-NOTCH-004:** The content-aware height introduced by Plan 12 exposed the sliver-positioning mismatch. The 004 fix itself is correct; 005 only becomes visible once the widget no longer fills the entire 260 px window.
- **WIN-NOTCH-006:** The hover target is positioned at the top of the widget and is also outside the visible collapsed area. It likely needs the same bottom-anchoring treatment.

## Implementation guidance

- Do not add `overflow: hidden` to `.notch-widget`; keep clipping on `.notch-inner` so the `::before` shadow and `notch-enter` animation are not clipped.
- The `.notch-sliver` transition already animates opacity and transform, so the bottom-anchored sliver will fade/slide in smoothly when entering peek.
- No React state or lifecycle changes are needed.

## Commit message

```text
fix(windows): show peek-phase loading ring by anchoring sliver to bottom

The notch sliver (loading ring + grabber) was positioned at the top of
the widget, but the peek/retracted transforms expose only the bottom
edge of the widget. After the content-aware height fix for WIN-NOTCH-004,
the widget collapses to ~44 px in peek, so the ring was rendered above
the visible window area.

Move .notch-sliver from top: 8px to bottom: 0 and adjust the exposed
collapsed heights (peek 18 px → 20 px, retracted 8 px → 12 px) so the
ring and grabber remain visible while the notch is collapsed.

Fixes WIN-NOTCH-005
```

## Implementation notes

### Ausgeführte Änderungen

- `apps/windows/src/renderer/styles/global.css`: `.notch-sliver` von `top: 8px` nach `bottom: 0` verschoben, damit der Sliver (Ring + Grabber) an der unteren Kante des Widgets verankert ist.
- Peek-Transform angepasst: `translateY(calc(-100% + 18px))` → `translateY(calc(-100% + 20px))`, damit die vollen 20 px Sliver sichtbar sind.
- Retracted-Transform angepasst: `translateY(calc(-100% + 8px))` → `translateY(calc(-100% + 12px))`, damit der Grabber vollständig sichtbar bleibt.
- Keine JSX-/React-Änderungen nötig; Sliver bleibt Geschwister von `.notch-inner`, damit kein Clipping durch `overflow: hidden` auftritt.

### Automatisierte Checks

```bash
cd apps/windows
bun run typecheck
bun test
```

Ergebnis:
- `bun run typecheck`: ✅ grün
- `bun test`: ✅ 195 pass / 2 skip (Electron-only Bild-Codec) / 0 fail

### Offene menschliche Verifikation

- Visuelles QA auf Windows: Ring komplett sichtbar in `peek`, Grabber vollständig sichtbar in `retracted`.
- `prefers-reduced-motion: reduce` prüfen (statischer Halbdrain-Zustand).
- 125 % und 150 % Display-Skalierung testen.
- Nach Merge von WIN-NOTCH-006 (Hover-Target) gemeinsam prüfen, ob Hover-Reopen über dem sichtbaren Sliver funktioniert.
