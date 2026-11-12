# Plan 13: Remaining macOS parity gaps for Windows

> **Goal:** Close the autonomous, decision-free gaps left in the Windows↔macOS parity matrix, explicitly park the two product-decision-blocked items (P2.2 CLI installer, P2.3 image lightbox), and clean up the three Low follow-ups plus the CLI constants drift flagged in the last review. No production code changes in this file; implementation follows this order.
> **Branch:** `platform/windows/macos-parity-p1` off `platform/windows/v2-clean`

## Goal

Finish the remaining decision-free parity work on the Windows Electron client so the matrix reaches 36+ DONE / 0 MISSING (excluding the two items that need a human product decision). The plan covers a renderer-side message ticker, two DEBUG-only developer toggles (echo own broadcasts, allow screenshots), three small hardening follow-ups in `NotchWidget.tsx` / `MenuWindow.test.tsx`, and the CLI constant drift. Items that require user input on product behavior are left blocked with the exact unblocking question.

## Evidence base

- Current parity matrix: `apps/windows/docs/plans/12-macos-feature-parity.md` (2026-07-10): **33 DONE / 2 PARTIAL / 5 MISSING**.
- macOS reference read: `apps/macos/Sources/MunkelApp/TickerText.swift`, `AppModel.swift`, `CaptureExclusion.swift`, `MenuView.swift`, `MessageNotchContainer.swift`.
- Windows current state read: `apps/windows/src/renderer/components/NotchWidget.tsx`, `MenuWindow.tsx`; `apps/windows/src/main/main.ts`, `session-store.ts`, `group-session.ts`, `notch-window.ts`, `menu-window.ts`, `palette-window.ts`, `preload.ts`, `ipc-channels.ts`; `apps/cli/src/munkel.ts`; test files `NotchWidget.test.tsx`, `MenuWindow.test.tsx`.

## Scope table

| Feature | macOS reference | Windows target file(s) | Effort | decision-free? | Verification / Tests |
|---|---|---|---|---|---|
| **Message text ticker** | `TickerText.swift` (single-line scroll teaser: 1.6 s standstill, 24 pt/s, one pass, edge fade, static if it fits) | `src/renderer/components/NotchWidget.tsx`, `src/renderer/styles/global.css` | S | **yes** | `bun run typecheck`; `NotchWidget.test.tsx` tests for static short text, scrolling long text, fade only while moving, one-shot finish callback; visual QA. |
| **Dev-only "Echo my broadcasts" toggle** | `AppModel.swift:57-65` (`#if DEBUG devEchoBroadcasts`, default `true`); `AppModel.swift:114-136` and `141-187` (echo text + image broadcasts back into own notch) | `src/main/session-store.ts`, `src/main/group-session.ts`, `src/main/main.ts`, `src/main/identity-store.ts`, `src/main/preload.ts`, `src/shared/types.ts`, `src/shared/ipc-channels.ts`, `src/renderer/components/MenuWindow.tsx` | S–M | **yes** | `bun run typecheck`; `group-session.test.ts` / `session-store.test.ts` for echo path; `MenuWindow.test.tsx` for settings toggle; manual QA: send a broadcast alone and see it in the notch. |
| **Dev-only "Allow in screenshots" toggle** | `CaptureExclusion.swift:32-38` (DEBUG-only toggle); `CaptureExclusion.swift:92-118` (`CaptureScreenshotPreference`, default off, live re-apply via notification); `MenuView.swift:11-14`, `148-151` | `src/main/menu-window.ts`, `src/main/notch-window.ts`, `src/main/palette-window.ts`, `src/main/main.ts`, `src/main/identity-store.ts`, `src/main/preload.ts`, `src/shared/types.ts`, `src/shared/ipc-channels.ts`, `src/renderer/components/MenuWindow.tsx` | S | **yes** | `bun run typecheck`; unit tests for IPC toggle + `setContentProtection` flip; renderer test that the checkbox appears only in dev and toggles the IPC; manual QA: Snipping Tool captures / does not capture the menu/notch/palette depending on toggle. |
| **Sent-to-Timer race guard** | `MessageNotchContainer.swift:23` (`replySent`); NotchPresenter auto-dismiss | `src/renderer/components/NotchWidget.tsx:412-416` | S | **yes** | `bun run typecheck`; regression test in `NotchWidget.test.tsx` that the 1.5 s auto-dismiss cannot close a reply opened after the confirmation starts. |
| **Reply-prune cleanup / stale-effect guard** | n/a — Windows-specific cleanup | `src/renderer/components/NotchWidget.tsx:325-331` | S | **yes** | `bun run typecheck`; regression test in `NotchWidget.test.tsx` that no timer/effect leaks when the replied-to entry is pruned from history or the component unmounts. |
| **`act()` test warning in `MenuWindow.test.tsx`** | n/a — test hygiene | `src/renderer/components/__tests__/MenuWindow.test.tsx` | S | **yes** | `bun test` runs with zero "not wrapped in act(...)" warnings; no warning attributed to `MenuWindow`. |
| **CLI constants drift (#10)** | `MessageLimits.swift` (single source of truth) vs. local `MAX_MESSAGE_CHARS = 2048` | `apps/cli/src/munkel.ts`, `packages/shared-wire` (new home for `message-limits.ts`), `apps/windows/src/renderer/components/NotchWidget.tsx`, `apps/windows/src/renderer/components/MenuWindow.tsx`, `apps/windows/src/main/group-session.ts` | S | **yes** | `bun run typecheck`; existing CLI tests pass; shared-module test asserting `MAX_MESSAGE_CHARS === 2048` and imported from a single source. |
| **CLI installer from app menu (P2.2)** | `CLIInstaller.swift`; `MenuView.swift:131-137` (`#if !DEBUG Install Command Line Tool…`) | `src/renderer/components/MenuWindow.tsx`, `src/main/main.ts`, new `src/main/cli-installer.ts` | M | **BLOCKED on OQ5** | `bun run typecheck`; manual QA: install, fresh PowerShell, `munkel circles`. **Cannot implement until user answers OQ5.** |
| **Image full-resolution view / lightbox (P2.3)** | `MessageNotchContainer.swift:12-14` (`fullImages`), `:17-19` (`imageLoaders`); `MessageNotchView.swift` (`AlbumCell.load`) | `src/renderer/components/NotchWidget.tsx`, new `src/core/blob-download.ts` (or extend `blob-upload.ts`), `src/main/group-session.ts` | L | **BLOCKED on OQ4** | `bun run typecheck`; unit test for download+decrypt; manual QA: send album, click thumb, verify full image. **Cannot implement until user answers OQ4.** |
| **Notch copy message — image path** | `MessageDisplayModel.copyImage` (full-res if loaded, else thumb) | `src/renderer/components/NotchWidget.tsx` (currently text-only via `handleCopyText` at `:349-352`) | M | **BLOCKED on OQ4** | Same test/QA as P2.3; the image copy path is coupled to full-res load. **Cannot implement until user answers OQ4.** |
| **Settings menu / native About panel** | `MenuView.swift:114-167` settings menu; `MenuView.swift:172-175` `showAbout()` | n/a | S | **out of scope** | No Windows equivalent per Plan 12 out-of-scope list; remains **PARTIAL**. |

## Status summary

- **Autonomously doable (this plan):** 7 items → ticker, 2 dev toggles, 3 Low follow-ups, CLI drift.
- **BLOCKED on product decision:** P2.2 (OQ5) + P2.3 (OQ4); the image-copy partial row is coupled to P2.3.
- **Out of scope / remains PARTIAL:** native About panel + text-only notch copy message.
- **Expected matrix outcome after this plan:** 36 DONE / 2 PARTIAL (About panel, image-copy message) / 0 MISSING / 2 BLOCKED (P2.2, P2.3).

## Prioritized, decision-free implementation order

Order rationale: land zero-risk cleanups and test hygiene first, then shared infrastructure (dev toggles), then the visible ticker feature. Each item is independent enough to ship separately.

### 1. CLI constants drift (#10)

- **Files:** `apps/cli/src/munkel.ts`, `apps/windows/src/shared/message-limits.ts` and its test, `packages/shared-wire/package.json`, plus consumers in `apps/windows` (`NotchWidget.tsx`, `MenuWindow.tsx`, `group-session.ts`).
- **Current state:** `apps/cli/src/munkel.ts:54` defines its own `MAX_MESSAGE_CHARS = 2048`; `apps/windows/src/shared/message-limits.ts` already exports the same value.
- **macOS behavior being mirrored:** macOS has one `MessageLimits.swift` source of truth.
- **Change:** move `message-limits.ts` and its tests from `apps/windows/src/shared` into `packages/shared-wire` (add a `./message-limits` export to the package), then update every consumer:
  - `apps/cli` removes its local `MAX_MESSAGE_CHARS` and imports `{ MAX_MESSAGE_CHARS } from '@munkel/shared-wire/message-limits'`.
  - `apps/windows` imports `MAX_MESSAGE_CHARS` / `clampMessageText` from `@munkel/shared-wire/message-limits` instead of the local `../../shared/message-limits` path.
- **Mandatory tests:** `bun run typecheck`; existing CLI tests still pass; existing `message-limits` test asserts `MAX_MESSAGE_CHARS === 2048` from the shared package.
- **Pitfalls:**
  - `apps/cli` only depends on `@munkel/shared-wire`; importing from `apps/windows/src/shared` would violate the workspace package boundary and fail the CLI's build. The clean fix is the shared package, not a cross-app import.
  - `packages/shared-wire` already has typecheck/test tooling; keep the module free of Electron/DOM dependencies so the CLI can use it too.
  - Delete the old `apps/windows/src/shared/message-limits.ts` and `__tests__/message-limits.test.ts` after moving them to avoid a duplicate source of truth.

### 2. `act()` test warning in `MenuWindow.test.tsx`

- **Files:** `src/renderer/components/__tests__/MenuWindow.test.tsx`.
- **Current state:** `bun test` emits a React "not wrapped in act(...)" warning whose component stack points to `CircleSection` in `MenuWindow.tsx:809`. The warning appears when a state update flushes outside `act()`, most likely because a describe block leaves a mounted `react-test-renderer` root across tests and an async side effect (e.g. `leaveCircle` settling, copy-code feedback, or settings-popover fetch) later updates it.
- **Change:** audit every describe block for dangling `create()` roots and async timers. Add an explicit `root.unmount()` in each `afterEach` (or per-test where the helper does not already do it). For async flushes, wrap the await in `act(async () => { ... })` so state updates settle inside the boundary.
- **Mandatory tests:** `bun test` in `apps/windows` runs with zero React "not wrapped in act(...)" warnings.
- **Pitfalls:**
  - The warning may come from a timer/promise in the component rather than the test; if unmounting alone does not silence it, fix the component cleanup.
  - Do not silence warnings by ignoring stderr.
  - Ensure `afterEach` runs even when a test throws; `react-test-renderer` roots left mounted can leak into the next test.

### 3. Reply-prune cleanup / stale-effect guard (`NotchWidget.tsx:325-331`)

- **Files:** `src/renderer/components/NotchWidget.tsx:325-331`.
- **Current state:**
  ```tsx
  useEffect(() => {
      if (!replyingTo) return;
      if (history.some((entry) => entry.id === replyingTo)) return;
      closeReply();
      setReplyText('');
      setError(null);
  }, [history, replyingTo, closeReply]);
  ```
  This effect closes the reply when its target entry ages out of the 60-second history window. It is not itself a timer, but it can race with the `SENT_CONFIRMATION_MS` timer: if the entry is pruned while a confirmation chip is showing, the chip and its timer can outlive the reply field that the prune effect already closed.
- **Change:** ensure the reply-prune path is covered by cleanup:
  1. Guard the effect with a `mounted` ref so it cannot call `closeReply()` / `setState` after unmount.
  2. Clear any running `sentConfirmationTimerRef` when the prune effect fires (the confirmation belongs to the reply that is being closed), and reset `sentConfirmation` so the chip disappears together with the reply field.
  3. Verify `useNotchLifecycle` cleans up its own timers on unmount; add an explicit unmount regression test if any leak is found.
- **Mandatory tests:** regression test in `NotchWidget.test.tsx` that mounts a widget, opens a reply on a history entry, advances time until the entry is pruned, and asserts the reply closes exactly once, the confirmation chip is gone, and no timers leak after unmount.
- **Pitfalls:**
  - Do not describe this task as fixing a `setTimeout` at `:325-331`; there is no timer there. The work is guarding the effect's side effects and cancelling related timers.
  - `closeReply` may be idempotent, but state setters after unmount will still warn in StrictMode/tests.

### 4. Sent-to-Timer race guard (`NotchWidget.tsx:412-416`)

- **Files:** `src/renderer/components/NotchWidget.tsx:412-416`.
- **Current state:** after a successful reply, a 1.5 s `setTimeout` clears the confirmation chip and calls `closeReply()`. `openReply()` already calls `clearSentConfirmation()` (line 340), and a new message arrival also clears it (line 309).
- **macOS behavior being mirrored:** macOS `MessageNotchContainer.swift:23` (`replySent`) plus NotchPresenter auto-dismiss.
- **Change:** audit for any remaining race where the timer can fire after the reply state has moved on (e.g. after the replied-to entry was pruned and the effect at `:325-331` already closed the reply). Harden by capturing the timer in the ref and clearing it whenever `replyingTo` changes, the entry leaves history, or the widget unmounts.
- **Mandatory tests:** existing regression test in `NotchWidget.test.tsx` should pass; add a new case where the auto-dismiss timer and a history-prune/closeReply race.
- **Pitfalls:**
  - Do not over-fix — the main race (open another reply / new message) is already covered; this task is verification + coverage of the prune/unmount edge case.
  - The prune effect from item 3 must clear the confirmation timer; make sure the two items' tests do not duplicate or contradict each other.

### 5. Dev-only "Allow in screenshots" toggle

- **Files:** `src/main/menu-window.ts`, `src/main/notch-window.ts`, `src/main/palette-window.ts`, `src/main/main.ts`, `src/main/identity-store.ts`, `src/main/preload.ts`, `src/shared/types.ts`, `src/shared/ipc-channels.ts`, `src/renderer/components/MenuWindow.tsx`.
- **macOS behavior being mirrored:** `CaptureExclusion.swift:32-38` and `CaptureExclusion.swift:92-118`: DEBUG builds expose a Settings toggle "Allow in screenshots" that switches capture-excluded surfaces from `.none` to `.readOnly`; default off; live re-apply via `CaptureScreenshotPreference.didChange` notification.
- **Change:**
  1. Add `allowInScreenshots` to `IdentityStore` (default `false`).
  2. Add `GET_ALLOW_IN_SCREENSHOTS` / `SET_ALLOW_IN_SCREENSHOTS` IPC channels (menu-window-only sender guard, same pattern as `get/set-launch-at-login`).
  3. In the main process, expose a helper `setMunkelContentProtection(enabled)` that calls `setContentProtection(!enabled)` on the menu, notch, and palette windows.
  4. Expose a dev flag to the renderer (e.g. add `isDev` to the preload API and `IpcApi`, backed by `process.env.NODE_ENV === 'development'` in `main.ts`) so the UI can gate the checkbox without relying on `window.electronAPI.isPackaged`, which does not exist today.
  5. Render a checkbox in `MenuWindow.tsx` settings popover only in dev builds. Toggling it calls the IPC, which updates every existing window immediately.
  6. Apply the persisted value at startup in `main.ts` after windows are created.
- **Mandatory tests:** `bun run typecheck`; unit test for the IPC handler verifying `setContentProtection` is called with the correct boolean; renderer test that the checkbox appears only in dev and toggles the IPC; manual QA with Windows Snipping Tool.
- **Pitfalls:**
  - Gate the UI and IPC behind `!app.isPackaged` / `process.env.NODE_ENV === 'development'` so release builds never expose or persist this.
  - `setContentProtection` must be applied to **all three** windows; missing one leaks message content.
  - Windows has no `.readOnly` equivalent — the toggle is strictly on/off (`setContentProtection(true/false)`). Document that this makes the window visible in both screenshots and screen recordings, matching the macOS DEBUG trade-off.
  - Persist default `false` so dev builds stay protected until explicitly opted in.
  - Do not reference `window.electronAPI.isPackaged`; it is not in the current preload API.

### 6. Dev-only "Echo my broadcasts" toggle

- **Files:** `src/main/session-store.ts`, `src/main/group-session.ts`, `src/main/main.ts`, `src/main/identity-store.ts`, `src/main/preload.ts`, `src/shared/types.ts`, `src/shared/ipc-channels.ts`, `src/renderer/components/MenuWindow.tsx`.
- **macOS behavior being mirrored:** `AppModel.swift:57-65` (`#if DEBUG static var devEchoBroadcasts`, default `true`); `AppModel.swift:114-136` (text echo) and `141-187` (image album echo). When a broadcast (`to: nil`) is sent, macOS shows it in the sender's own notch because the relay only delivers broadcasts to *other* members.
- **Post-ship note (2026-07-18):** Windows default later flipped to **opt-in `false`** (`state.json` v2 + migration) after users hit surprise self-echo in the notch. Toggle/feature kept.
- **Change:**
  1. Add `devEchoBroadcasts` to `IdentityStore` (originally default `true` for dev; now `false` — see note above).
  2. Add `GET_DEV_ECHO_BROADCASTS` / `SET_DEV_ECHO_BROADCASTS` IPC channels (menu-window-only sender guard).
  3. Expose the same dev flag to the renderer as in item 5.
  4. In `AppState`, give `GroupSession` a way to read the current echo flag (e.g. pass a getter or read `identityStore` inside `sendChat`/`sendImages`).
  5. In `GroupSession.sendChat` / `GroupSession.sendImages`, after a successful wire send with `to === undefined`, if the flag is enabled, construct a `NotchMessage` from the local identity and invoke `callbacks.onNotch` (for text) or build `IncomingImage` thumbnails from the local encoded data and invoke `callbacks.onNotch` (for images).
  6. Render a checkbox in `MenuWindow.tsx` settings popover only in dev builds.
- **Mandatory tests:** `bun run typecheck`; `group-session.test.ts` tests for chat echo and image album echo paths; `session-store.test.ts` test that the flag is forwarded; `MenuWindow.test.tsx` test for the dev-only checkbox and IPC.
- **Pitfalls:**
  - Only dev builds (same gating as the screenshot toggle).
  - Default `true` on macOS DEBUG; mirror that on Windows dev.
  - Echo must go through the **same `onNotch` path** used for real incoming messages so the notch sees identical data.
  - For image echo, reuse the local AVIF full data and build a thumbnail without an R2 round-trip, matching macOS's `Task.detached` echo builder (`AppModel.swift:149-169`). Do not re-read files from disk.
  - Avoid double-echo if the relay ever reflects; the toggle only injects locally, never via the wire.
  - Image echo needs the same `MAX_IMAGES_PER_MESSAGE` cap and `perThumbBudget` logic that `sendImages` already uses.

### 7. Message text ticker (`TickerText.swift`)

- **Files:** `src/renderer/components/NotchWidget.tsx`, `src/renderer/styles/global.css`.
- **macOS behavior being mirrored:** `TickerText.swift`: a single-line message teaser; text starts fully visible; 1.6 s standstill; scrolls right-to-left at ~24 pt/s exactly once; stops at the end with 14 pt trailing padding; static if the text fits; leading edge fade appears only once scrolling has started.
- **Change:**
  1. Add a new `TickerText` component (or inline it in `NotchWidget.tsx`) that receives the message text and the available width.
  2. Render a hidden measurement span to determine natural text width. If `naturalWidth <= availableWidth`, render static text.
  3. If too long, after a 1.6 s delay animate `translateX` from `0` to `-(naturalWidth - availableWidth + 14)` over `(distance / 24) s`; fire an `onFinished` callback once.
  4. Apply a CSS `mask-image` / `linear-gradient` leading fade only while `translateX > 0.5` and a trailing fade always.
  5. Use the ticker only in the single/current-message view (`newest && (phase === 'full' || replyingTo === newest.id)`), not in collapsed history rows.
- **Mandatory tests:** `bun run typecheck`; `NotchWidget.test.tsx` tests for:
  - short text renders statically (no animation class);
  - long text gets the animation class and finishes exactly once;
  - leading fade is absent at start and appears after movement begins;
  - `onFinished` is called once;
  - history rows (P3.6) do not run the ticker.
- **Pitfalls:**
  - **Coexistence with P3.6 expand/collapse:** the ticker must not run on collapsed history rows; only the single/current message teaser scrolls.
  - **Click-to-reply:** the ticker wrapper must not swallow pointer events; the existing `.message-body` click handler must still open reply.
  - **Reduced motion:** respect `prefers-reduced-motion` by showing static truncated text or skipping the scroll animation.
  - **Width reference:** macOS `TickerText.swift:9` defaults to 190 pt, but `MessageNotchContainer.swift:163` passes `tickerWindow = 250 pt`; Windows uses a 280 px window (`notch-window.ts:19`) and CSS `.notch-widget { width: 280px }` (`global.css:644`). Calibrate the padding and end-padding to the actual Windows *content* width (280 px minus horizontal padding / avatar / channel icon), not the macOS 190 pt default.
  - **jsdom measurement:** `getBoundingClientRect` / offsetWidth may return 0 in tests; mock the measurement or test via CSS class presence and animation duration.

## Explicitly BLOCKED

### P2.2 CLI installer from app menu

- **Blocked by Open Question 5** from Plan 12: *"Should the Windows app bundle the CLI in `extraResources` and install from the menu (P2.2), or keep CLI as a separate manual/installer step?"*
- **Evidence:** `MenuView.swift:131-137` shows an "Install Command Line Tool…" menu item in release builds; `apps/windows/src/renderer/components/MenuWindow.tsx` has no equivalent item; Plan 12 OQ5 is still open.
- **Unblocking action:** user must choose one of the two distribution models. Only then can we size the exact installer target (`%LOCALAPPDATA%\Microsoft\WindowsApps`, a user-writable fallback, or `extraResources`) and the menu UX.

### P2.3 Image full-resolution view / lightbox

- **Blocked by Open Question 4** from Plan 12: *"Should clicking a thumbnail open a lightbox inside the notch, a separate always-on-top window, or the system default image viewer?"*
- **Evidence:** `MessageNotchContainer.swift:12-14` maintains `fullImages`; `:17-19` maintains `imageLoaders`; Windows `NotchWidget.tsx:477-488` renders only base64 thumbnails with no click handler; Plan 12 OQ4 is still open.
- **Unblocking action:** user must pick the UX variant. The implementation size differs significantly: inline lightbox (renderer-only, S–M), separate window (new BrowserWindow + IPC, M), system viewer (write temp file + `shell.openPath`, S but different security surface).

### Notch image copy (coupled to P2.3)

- The matrix row "Notch copy message" is **PARTIAL** only because image copy requires the full-resolution bytes. `MessageDisplayModel.copyImage` copies full-res if loaded, otherwise the thumb; Windows `NotchWidget.tsx:349-352` copies only text. This row cannot be completed until P2.3 is unblocked and implemented.

## Out of scope / Open questions

### Out of scope

- **Native About panel** — macOS-specific behavior with no Windows equivalent, listed as out-of-scope in Plan 12. The settings popover already covers the functional settings; a Windows About panel is not planned.
- **Swift/TypeScript shared core unification** (`packages/core/` rewrite) — deferred per Plan 12.
- **MSIX / Windows Store distribution, Authenticode signing, network relay hardening** — not parity items.

### Open questions that do not block this plan

1. **OQ1 — GitHub login mandatory or optional on Windows?** macOS gates everything on GitHub sign-in; Windows currently works without it. No code change planned until product decides.
2. **OQ2 — Default autostart behavior?** macOS release auto-registers once on first launch; Windows is opt-in (`launchAtLogin` default `false`). Already implemented per Plan 12 P2.1.
3. **OQ3 — Notch sizing?** Windows uses a fixed 280 px × content-driven-height floating pill. Already implemented per Plan 12 P1.3.

### Open questions that block P2.2 and P2.3

4. **OQ4 — Image album full-resolution view variant?** (see BLOCKED section above)
5. **OQ5 — CLI distribution model?** (see BLOCKED section above)

## Notable discrepancies found while verifying

1. **Matrix says "Menu: settings gear / About / Quit" is PARTIAL** because of no native About panel. Verified in `MenuWindow.tsx:466-547`: the settings popover has Display name, Launch at login, Check Automatically, Palette hotkey, Quick send, Check for Updates, and Quit — no About item. This is correctly out of scope per Plan 12.
2. **Matrix says "Notch copy message" is PARTIAL** only because image full-resolution copy is missing. Verified in `NotchWidget.tsx:349-352`: only text is copied. The image copy path is genuinely blocked on P2.3.
3. **"Orphaned prune timer" label is wrong.** The current `NotchWidget.tsx:325-331` contains a `useEffect` that closes the reply when its target leaves history, but no `setTimeout`. The follow-up is about ensuring the prune effect's state updates are guarded after unmount and that any related `sentConfirmationTimerRef` is cancelled when the reply target disappears.
4. **`act()` warning location:** Plan 12 noted a similar warning was fixed in `NotchWidget.test.tsx`; the new Low follow-up points to `MenuWindow.test.tsx`, confirmed by running the suite. The component stack points to `CircleSection`; the fix is likely to unmount every `react-test-renderer` root in `afterEach` and wrap async flushes in `act()`.
5. **Ticker width mismatch:** macOS `TickerText.swift:9` defaults to 190 pt, but `MessageNotchContainer.swift:163` uses 250 pt for the content width. Windows `notch-window.ts:19` uses 280 px and CSS `.notch-widget { width: 280px }` (`global.css:644`). The Windows ticker should target the actual 280 px content width (minus padding/avatar/channel icon), not either macOS number.
6. **Dev-toggle gating:** macOS uses `#if DEBUG` compile-time guards. Windows should use `!app.isPackaged` / `process.env.NODE_ENV === 'development'` on the main side and an equivalent dev flag on the renderer side. Do **not** use `window.electronAPI.isPackaged` — that property does not exist in the current preload API.
7. **Expected matrix count was off by two.** Plan 12 starts at 33 DONE / 2 PARTIAL / 5 MISSING. This plan resolves only 3 of the 5 MISSING items into DONE (ticker, echo, screenshot); the other 2 become BLOCKED. Therefore the expected outcome is 36 DONE / 2 PARTIAL / 0 MISSING / 2 BLOCKED, not 38 / 1 / 0 / 2.

## Verification checklist (before closing this plan)

- [x] `bun run typecheck` clean.
- [x] `bun test` in `apps/windows`: expected baseline + new tests pass; zero `act()` warnings. (532 pass / 3 skip / 0 fail, up from the 477 pass / 3 skip baseline.)
- [ ] Manual QA: dev "Echo my broadcasts" toggle — solo dev sees own broadcast in notch.
- [ ] Manual QA: dev "Allow in screenshots" toggle — Snipping Tool respects on/off for menu/notch/palette.
- [ ] Manual QA: long message text in notch scrolls once, short text stays static.
- [x] P2.2 and P2.3 remain unimplemented and linked to OQ4/OQ5 in any follow-up matrix update. (`12-macos-feature-parity.md` matrix rows now read **BLOCKED**, each citing OQ5/OQ4 respectively.)
