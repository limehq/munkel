# Verification: Plan 14 — Notch hover-reopen fix (WIN-NOTCH-006)

**Date:** 2026-07-06  
**Verifier:** codebase verification  
**Result:** Passed — no corrections required.

## Overall verdict

The changes in `apps/windows/src/renderer/styles/global.css` correctly implement the
CSS-only fix described in Plan 14 and its review. `bun run typecheck` and
`bun test` both pass. No JSX changes were necessary and none were made.

## Point-by-point verification

| Plan requirement | Status | Evidence |
|---|---|---|
| `.notch-hover-target` anchored to bottom of widget | ✅ | `global.css:564` uses `bottom: 0;` (was `top: 0;`) |
| Keep `left: 0; right: 0; height: 24px; z-index: 4;` | ✅ | `global.css:565-568` |
| Add explicit `z-index: 3` to `.notch-sliver` | ✅ | `global.css:588` |
| Keep `pointer-events: none` in `full`/`reopened` | ✅ | `global.css:572-575` unchanged |
| No JSX change in `NotchWidget.tsx` | ✅ | `NotchWidget.tsx:271` still renders `<div className="notch-hover-target" onMouseEnter={reopenFromHoverTarget} />` |
| Hover target remains sibling of `.notch-inner` | ✅ | `NotchWidget.tsx:271` (target), `:272` (sliver), `:282` (inner) are all direct children of `.notch-widget` |
| Widget-level `onMouseEnter`/`onMouseLeave` unchanged | ✅ | `NotchWidget.tsx:268-269` still present |
| Optional `cursor: default` polish applied | ✅ | `global.css:569` |

## Stacking order check

- `.notch-sliver` is on `z-index: 3`.
- `.notch-hover-target` is on `z-index: 4`.
- Both are positioned within the same stacking context created by
  `.notch-widget { position: relative; }`.
- Therefore the hover target receives events above the sliver, as intended.

## Automated checks

```bash
cd apps/windows
bun run typecheck   # ✅ green
bun test            # ✅ 195 pass, 2 skip, 0 fail
```

## Regressions reviewed

- **WIN-NOTCH-004 (oversize):** The content-aware height rules in `.notch-widget`
  and `.notch-inner` are untouched.
- **WIN-NOTCH-005 (loading ring / bottom sliver):** `.notch-sliver` positioning
  and `.notch-ring` styles are unchanged except for the defensive `z-index: 3`.
- **Click blocking in expanded states:** The `pointer-events: none` rule for
  `.notch-full`/`.notch-reopened` remains active.
- **Hover-stuck hide path:** Plan 07's removal of the `!hovering` gate from the
  empty-hide timer is still in place and compatible.

## Found problems / correction suggestions

None. The implementation matches the approved plan and review.

## Final statement

The code changes for WIN-NOTCH-006 are technically correct and complete.
Manual QA on Windows remains the only open item from the definition of done.
