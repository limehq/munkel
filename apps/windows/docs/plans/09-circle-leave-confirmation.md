# Plan 09: Circle Leave Confirmation Dialog

> **Status:** Implemented in `platform/windows/circle-leave-confirmation`, PR pending.

**Branch:** `platform/windows/circle-leave-confirmation`
**Base:** `platform/windows/v2-clean`
**Estimate:** ½ session
**Type:** Feature / UX

> **Provenance:** Derived from the repo-root open-tasks list
> ([`docs/README.md#open-tasks`](../../../../docs/README.md#open-tasks)) and the
> existing `MenuWindow.tsx` leave interaction. All findings are grounded in real
> code (`file:line`) verified 2026-07-05.

## Problem

The menu window (`MenuWindow.tsx:354`) shows a small "➡️" leave button on every
joined circle. Clicking it immediately calls `leaveCircle(code)` and removes the
circle from state. There is no confirmation step, so an accidental click boots
the user out of a circle with no way to undo short of rejoining with the code.

## Goal

Add a small, focused confirmation dialog that asks the user to confirm before
actually leaving a circle. The dialog must:

- Be easy to dismiss (Cancel, Escape, backdrop click).
- Use the safer default of focusing **Cancel**, not **Leave**.
- Stay accessible (`role="dialog"`, `aria-modal="true"`, labelled title).
- Match the existing frosted/dark Windows UI.
- Auto-close if the underlying circle disappears while the dialog is open.

## Core design

A local `confirmingLeave: string | null` state in `MenuWindow` stores the code of
the circle currently being confirmed. The circle's leave button sets this state
instead of calling `handleLeave` directly. When the state is non-null, an inline
`LeaveConfirmationDialog` is rendered over the menu window.

### Dialog behavior

| Action | Result |
|--------|--------|
| Click **Leave** | Calls `handleLeave(code)`, then clears `confirmingLeave`. |
| Click **Cancel** | Clears `confirmingLeave`; no `leaveCircle` call. |
| Press **Escape** | Clears `confirmingLeave`; no `leaveCircle` call. |
| Click backdrop | Clears `confirmingLeave`; no `leaveCircle` call. |
| Circle removed from state | Effect clears `confirmingLeave`; dialog closes. |

### Safer default focus

The **Cancel** button receives an auto-focus `ref` in a `useEffect` on mount so
that pressing `Enter` or `Space` dismisses without leaving, and an accidental
extra click/enter does not confirm the destructive action.

### Styling

The dialog uses the existing `.glass` class for the frosted panel and adds
scoped classes `.leave-dialog-overlay`, `.leave-dialog`, `.leave-dialog-title`,
and `.leave-dialog-actions` in `global.css`. Colors and radii reuse existing CSS
tokens (`--munkel-radius-md`, `--munkel-text-primary`, etc.).

## Files involved

- `apps/windows/src/renderer/components/MenuWindow.tsx` — add state, guard
  effect, conditional dialog render, `data-testid` on leave button, and inline
  `LeaveConfirmationDialog` component.
- `apps/windows/src/renderer/styles/global.css` — add scoped dialog styles.
- `apps/windows/src/renderer/components/__tests__/MenuWindow.test.tsx` — new
  renderer component tests.
- `apps/windows/docs/plans/README.md` — execution order table.
- `docs/README.md` — open-tasks status.
- `apps/windows/README.md` — status note.

## Tasks (in order)

1. Add `confirmingLeave` state and guard effect to `MenuWindow`.
2. Wire the circle leave button to `setConfirmingLeave(code)` instead of
   `handleLeave(code)`.
3. Implement `LeaveConfirmationDialog` with Cancel focus, Escape/backdrop
   dismissal, and ARIA attributes.
4. Add scoped CSS classes to `global.css` using existing tokens and `.glass`.
5. Add `data-testid` attributes to the leave button and dialog controls for
   robust tests.
6. Add `MenuWindow.test.tsx` covering: open dialog without leaving, Cancel,
   Escape, backdrop, and confirm-leave exactly once.
7. Update plan docs, open-tasks table, and Windows README status.
8. Run `bun run typecheck`, `bun test`, and `bun run build`.

## Verification

```bash
cd apps/windows
bun run typecheck
bun test
bun run build
```

## Definition of done

- [x] Clicking the leave button opens a confirmation dialog.
- [x] The dialog does not call `leaveCircle` until confirmed.
- [x] Cancel, Escape, and backdrop click dismiss without leaving.
- [x] The Leave button calls `leaveCircle(code)` exactly once and closes the dialog.
- [x] Cancel button receives auto-focus.
- [x] Dialog has `role="dialog"`, `aria-modal="true"`, and `aria-labelledby`.
- [x] Dialog auto-closes if the circle is removed from state.
- [x] Styles match the existing frosted/dark Windows UI.
- [x] Component tests pass; full `bun test` suite passes.
- [x] Typecheck and production build succeed.

## Decisions

- **Inline component:** `LeaveConfirmationDialog` lives in `MenuWindow.tsx`
  because it is tightly coupled to the menu's leave flow and is not reused
  elsewhere. If a generic modal is needed later, it can be extracted.
- **Focus default:** Cancel is focused instead of Leave to prevent accidental
  confirmation.
- **Backdrop dismissal:** Clicking the overlay dismisses only when the click
  target is the overlay itself, not the dialog card.
- **Guard effect:** A small `useEffect` watches `state.circles`; if the
  confirming circle disappears, the dialog closes automatically.

## Open questions / deferred (non-blocking)

1. **Destructive Leave button styling:** the Leave button currently uses the
   primary accent blue. A future polish pass could add a red/destructive variant
   for destructive actions.
2. **Generic dialog component:** if more confirmation dialogs are added, the
   inline dialog can be promoted to a shared `Dialog` component.
