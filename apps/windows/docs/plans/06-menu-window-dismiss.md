# Plan 06: Menu Window Click-Away Dismiss

> **Status:** Merged via merge commit `1c7c0c2` into `platform/windows/v2-clean`.

**Branch:** `platform/windows/menu-dismiss-on-blur`
**Base:** `platform/windows/v2-clean`
**Estimate:** ½–1 session
**Type:** Bugfix / UX

> **Provenance:** Drafted by Kimi (k2.6), adversarially reviewed by two Kimi
> critics (correctness lens + edge-case/regression lens), then reconciled and
> finalized by the orchestrator. All findings below are grounded in real code
> (`file:line` verified 2026-07-04).

## Problem

The large Munkel menu window (`320 × 520`, frameless, transparent,
`alwaysOnTop: true` — `menu-window.ts:11-28`) stays open indefinitely. Clicking
outside it, switching apps, or otherwise removing focus does not dismiss it. The
only way to close it is the tray toggle or an explicit in-app action.

## Goal

Add click-away-to-dismiss: when the menu window loses focus (`blur`), hide it —
**unless** a dismissal-suppression reason is active. Tray toggle, second-instance
activation, GitHub login, the recipient picker, and in-app interactions must stay
reliable and flicker-free.

## Core design: `blur` → hide, gated by suppression + a tray-toggle guard

The naive "hide on any blur" breaks two real flows (both verified). The design is
a single **suppression gate** plus a **tray-toggle race guard**.

### Suppression reasons (blur does NOT hide while any is true)

| Reason | Why | Signal source |
|--------|-----|---------------|
| **Native picker open** | The recipient `<select>` (`MenuWindow.tsx:383`) opens a native Windows combobox popup that steals OS focus → window `blur` → would hide the menu mid-selection. | Renderer IPC `menu-picker-state` (decision: **Suppress-Signal**, keep native `<select>`) |
| **GitHub login active** | Device-auth (`phase: 'awaiting'`) shows the user a code to enter **in the browser**; login state is pushed **only** to `menuWindow` (`main.ts:122`). Switching to the browser blurs the menu → login UI vanishes mid-flow. | Main tracks `GitHubLoginState.phase` in `pushGitHubLoginState` (decision: **Suppress during login**) |
| **DevTools open (dev only)** | Opening DevTools blurs the menu → would auto-hide while debugging. | `win.webContents.isDevToolsOpened()` (dev build only) |

`GitHubLoginPhase = 'idle' | 'requesting' | 'awaiting' | 'fetching' | 'failed'`
→ login is "active" when phase ∈ `{ requesting, awaiting, fetching }`.

### Tray-toggle race guard

On Windows the emission order of the tray `click` vs the window `blur` is **not
contractually guaranteed** (verified — Electron does not document it). Two orders:

- **blur → click:** blur hides the menu; the tray `click` then runs
  `toggleMenuWindow`, sees `!isVisible()`, and would **immediately reopen** it →
  the tray can never close the menu. ← the race we must guard.
- **click → blur:** toggle hides (menu was visible); the nested `blur` from
  `hide()` early-returns on `!isVisible()`. Already fine.

**Guard (hybrid timestamp + flag):** the blur handler records
`menuHiddenByBlurAt = Date.now()` **and** sets `lastHideWasBlur = true`. Any
explicit show clears `lastHideWasBlur = false`. `toggleMenuWindow` skips the
reopen only when `!isVisible() && lastHideWasBlur && (now - menuHiddenByBlurAt) <
MENU_TOGGLE_GUARD_MS`, then clears the flag. The flag prevents an unrelated
click-away blur from swallowing a later *intentional* tray-open; the timestamp
self-expires so a stuck flag can't wedge the toggle.

**Known trade-off (do not oversell as "race solved"):** `MENU_TOGGLE_GUARD_MS`
pulls in two directions — too low re-admits the race on slow machines, too high
swallows a fast legitimate reopen. Start at **200 ms**; treat as QA-tunable. The
flag narrows the false-negative to the "click away, then re-open within 200 ms"
window only.

## Design notes (verified facts + non-issues)

- `showMenuWindow` (`menu-window.ts:55-56`) does `win.show()` then `win.focus()`.
  Focusing cannot fire `blur` (blur is the opposite event) — safe. Confirmed by both reviewers.
- **`isDestroyed()` guard is mandatory** in the blur handler: `win.isVisible()`
  throws `Object has been destroyed` on a torn-down window, and blur can fire
  during app teardown. Handler must `if (win.isDestroyed()) return;` **first**.
- The `!isVisible()` early-return is also required: `win.hide()` blurs a focused
  window and re-emits `blur`; without the guard the handler recurses / double-stamps.
- **Listener re-registration is a non-issue here:** the app never destroys
  windows (`window-all-closed` is a no-op, `main.ts:211-213`); `second-instance`
  (`main.ts:44-45`) only recreates if `menuWindow` is null/destroyed, which never
  happens → no double `blur` registration, no leak. Do **not** add
  `removeAllListeners('blur')` "defensively" — it would kill unrelated listeners.
- `setContentProtection(true)` (`menu-window.ts:30`) affects screen capture only;
  **no** interaction with focus/blur. Checked, irrelevant.
- **Cross-window coexistence (intended, documented):** menu, palette, and notch
  are all `alwaysOnTop` + focusable. Opening the palette (`palette-window.ts:46`
  `focus()`), the quick-send palette, or a notch reply (`notch-focus.ts:9`
  `focusNotchForReply`) while the menu is open will blur → dismiss the menu. This
  is the intended "one surface at a time" behavior, called out here so it isn't
  mistaken for a regression.
- **Involuntary blur (Alt-Tab, OS toast, UAC, lock) dismisses the menu** — this
  is standard popover behavior and is accepted as intended.
- `BrowserWindow.getFocusedWindow()` is **not** a cleaner alternative for the
  race: on a tray click the foreground goes to the shell and it returns `null`,
  indistinguishable from a desktop click. The timestamp+flag guard is the
  least-bad option.

## Files involved

- `apps/windows/src/main/menu-window.ts` — blur handler, guard, `createMenuWindow` gains a `{ isDismissSuppressed?: () => boolean }` option
- `apps/windows/src/main/menu-dismiss.ts` — **new** pure helpers (testable)
- `apps/windows/src/main/main.ts` — track `pickerOpen` + `githubLoginActive`; wire `isDismissSuppressed`; IPC `menu-picker-state`; set login-active in `pushGitHubLoginState`
- `apps/windows/src/main/preload.ts` — expose `setMenuPickerOpen(open)`
- `apps/windows/src/shared/types.ts` — `IpcApi.setMenuPickerOpen`
- `apps/windows/src/renderer/components/MenuWindow.tsx` — `<select>` `onFocus`/`onBlur` → `setMenuPickerOpen`
- `apps/windows/src/main/__tests__/menu-dismiss.test.ts` — **new** unit tests
- `apps/windows/docs/ipc-contract.md` — document `menu-picker-state`
- `apps/windows/src/main/palette-window.ts` — reference only (no blur pattern today; not changed)

## Tasks (in order)

1. **Extract pure helpers** into `menu-dismiss.ts` (repo convention = testable
   pure functions, per `resolve-reply-recipient.ts` / `notch-phase.ts`):
   - `shouldReopenMenu({ visible, lastHideWasBlur, hiddenByBlurAt, now, guardMs }): boolean`
   - `isDismissSuppressed({ pickerOpen, githubLoginActive, devToolsOpen, isDev }): boolean`
   - `isGitHubLoginActive(phase): boolean` → `phase ∈ {requesting, awaiting, fetching}`
   - `export const MENU_TOGGLE_GUARD_MS = 200`
2. **`menu-window.ts`:** module state `let menuHiddenByBlurAt = 0`,
   `let lastHideWasBlur = false`. `createMenuWindow(opts?: { isDismissSuppressed?: () => boolean })`.
   Register a `blur` handler that: `isDestroyed()`→return; `!isVisible()`→return;
   `opts?.isDismissSuppressed?.()`→return; (dev) `isDevToolsOpened()`→return;
   else set `menuHiddenByBlurAt = Date.now()`, `lastHideWasBlur = true`, `win.hide()`.
3. **`menu-window.ts`:** `toggleMenuWindow` uses `shouldReopenMenu(...)` to decide;
   when it hides explicitly, it does **not** set `lastHideWasBlur` (that's blur-only);
   `showMenuWindow` sets `lastHideWasBlur = false`.
4. **`main.ts`:** add `let pickerOpen = false; let githubLoginActive = false;`.
   Pass `{ isDismissSuppressed: () => isDismissSuppressed({ pickerOpen, githubLoginActive, devToolsOpen: menuWindow?.webContents.isDevToolsOpened() ?? false, isDev }) }` to `createMenuWindow`.
5. **`main.ts`:** in `pushGitHubLoginState`, set `githubLoginActive = isGitHubLoginActive(state.phase)`.
6. **`main.ts` + `preload.ts` + `types.ts`:** add IPC `menu-picker-state`
   (`ipcMain.on` sets `pickerOpen`); expose `setMenuPickerOpen(open)` on `IpcApi`.
7. **`MenuWindow.tsx`:** on the recipient `<select>` (`:383`), `onFocus` →
   `setMenuPickerOpen(true)`, `onBlur` → `setMenuPickerOpen(false)`.
8. **Tests** `menu-dismiss.test.ts`: cover `shouldReopenMenu` (both race orders,
   guard expiry, flag reset), `isDismissSuppressed` (each reason), and
   `isGitHubLoginActive`. Use injected `now` — do **not** rely on real `Date.now()`
   (the `FakeTimers` harness mocks `setTimeout`, not `Date.now`).
9. **`ipc-contract.md`:** document `menu-picker-state` (renderer→main, boolean).
10. Copy is already final (this file). Update the plans `README.md` execution table.

## Verification

```bash
cd apps/windows
bun run typecheck
bun test
```

**Manual runtime QA (Windows — the parts unit tests can't cover):**
- Open menu via tray → click desktop/another app → menu hides.
- Click tray again → reopens cleanly (no reopen flicker).
- Click tray **while menu visible** → hides and stays hidden (no race reopen).
- **Open the recipient `<select>` dropdown → menu must NOT hide; pick an item → stays open.**
- **Start GitHub login, switch to the browser → menu + login-code UI stay visible.**
- Open DevTools (dev) → menu does not auto-hide.
- **Open menu and do nothing → it must stay open** (guards against Windows
  `show()`-without-focus → immediate self-blur; `SetForegroundWindowLockTimeout`).
- Right-click the tray (native context menu) → menu behavior sane (no spurious hide loop).

## Definition of done

- [x] `blur` hides the menu when focus moves outside, except while suppressed.
- [x] Recipient `<select>` interaction does not dismiss the menu.
- [x] GitHub login (`requesting`/`awaiting`/`fetching`) keeps the menu open.
- [x] DevTools open (dev) does not auto-hide.
- [x] Tray click toggles the menu off without immediate reopen.
- [x] Second-instance (`main.ts:43-48`) still reliably shows the menu.
- [x] IPC `toggle-menu` (`main.ts:173`) remains functional.
- [x] `blur` handler is `isDestroyed()`- and `!isVisible()`-safe.
- [x] Menu opened via tray stays open with no user action (no self-blur hide).
- [x] Pure helpers unit-tested with injected `now`; `bun run typecheck` + `bun test` green.

## Decisions (fundamental — from user, 2026-07-04)

- **Native picker:** **Suppress-Signal** — keep native `<select>`, renderer signals
  open state via IPC, main suppresses blur-dismiss while open. (Alternative
  "replace with custom dropdown" deferred as a possible follow-up.)
- **GitHub login:** **Suppress during login** — main suppresses blur-dismiss while
  a login flow is active, so the user can switch to the browser without losing
  the login-code UI.

## Open questions / deferred (non-blocking, documented scope cuts)

1. **Escape-to-dismiss** — the other standard popover dismissal — is **out of
   scope** for this plan (blur-only). Possible follow-up.
2. **Palette blur-dismiss parity** — `palette-window.ts` has no blur pattern; if
   desired it can adopt the same mechanism in a follow-up.
3. **Guard duration** — `200 ms` is a starting value; QA on target hardware may
   tune it (see trade-off above).
