# Plan 12: macOS feature-parity matrix for Windows

> **Goal:** Produce an evidence-based feature-parity matrix between the macOS reference implementation (`apps/macos/`) and the Windows Electron port (`apps/windows/`), then define prioritized implementation phases for the remaining gaps.
> **Branch:** `platform/windows/macos-parity-p1` off `platform/windows/v2-clean`
> **Estimate:** This plan is an analysis artifact only; implementation spans P1–P3 below.

## Goal

Close the remaining functional and UX gaps between the Windows Electron client and the macOS SwiftUI reference client. The matrix below maps every significant macOS feature to its Windows status, with file-level evidence. Open bugs are addressed before new features.

## Evidence base

- macOS reference read: `apps/macos/Sources/MunkelApp/` and `apps/macos/Sources/MunkelKit/`.
- Windows current state read: `apps/windows/src/main/`, `apps/windows/src/renderer/`, `apps/windows/src/shared/`, `apps/windows/src/core/`.
- Git status: currently on `platform/windows/tray-click-fix`, which is **4 commits ahead** of `platform/windows/v2-clean` (tray click/double-click fixes + IPC channel refactor).
- Merged branches query (`git branch --merged platform/windows/v2-clean`): `circle-leave-confirmation`, `ios-feature-sync`, `logo-assets-integration`, `menu-dismiss-on-blur`, `notch-retract-fix`, and `v2-clean` itself are merged. The `auto-update` branch is **not** reported as merged yet (matches README "In review" / recent log shows it is on the current branch stack).
- Note: the user-referenced `docs/bugs/windows-notch-regression-2026-07-06.md` does **not exist** in the repo; only `docs/bugs/windows-notch-ux-2026-06-30.md` exists. The `STATE.md` E3 item "Notch vertical oversize (WIN-NOTCH-004)" is therefore treated as a stale planning hypothesis that must be re-verified against code.

## Feature-parity matrix

| macOS feature | macOS source | Windows status | Windows source(s) | Evidence |
|---|---|---|---|---|
| **Tray / menu-bar status item** | `MunkelApp.swift` (AppDelegate, NSPopover) | **DONE** | `src/main/tray.ts`, `src/main/menu-window.ts` | Tray icon loads PNGs from `assets/`, left-click toggles menu, right-click pops context menu on Windows. |
| **Menu: circle list / join / leave** | `MenuView.swift` | **DONE** | `src/renderer/components/MenuWindow.tsx` | `CircleSection` renders status, members, send row; `handleLeave` calls `leaveCircle`; `handleJoin` creates/joins. |
| **Menu: copy circle code button** | `MenuView.swift:565-573` (header copy button) | **MISSING** | — | Each macOS circle card has a "Copy code" button next to the code; Windows shows only the code text. |
| **Menu: inline circle send (text)** | `MenuView.swift` (`GroupSectionView.sendTapped`) | **DONE** | `src/renderer/components/MenuWindow.tsx` (`handleSend`) | Sends via `sendChat(code, text, to)`. |
| **Menu: message character limit (2048)** | `MessageLimits.swift`, `MenuView.swift:667-670` | **MISSING** | — | macOS clamps outgoing and incoming text to 2048 characters; Windows composer has no length cap. |
| **Menu: inline image attach via ⌘V** | `MenuView.swift` (`updatePasteMonitor`, `ClipboardImage.read`) | **MISSING** | — | Windows menu has no clipboard-image paste monitor; only the palette file picker is available. |
| **Menu: recipient picker with hover tooltip** | `MenuView.swift` (`TargetChip`, custom fast tooltip) | **PARTIAL** | `src/renderer/components/MenuWindow.tsx` (`<select>`) | Uses native `<select>` instead of avatar chips; tooltip on hover is absent. |
| **Menu: settings gear / About / Quit** | `MenuView.swift` (`settingsMenu`, `showAbout`) | **PARTIAL** | `src/renderer/components/MenuWindow.tsx` | Settings popover has display name, Quick send, Check updates, Quit; no native About panel and no "Launch at Login" toggle. |
| **Menu: Launch at Login toggle** | `LoginItem.swift` | **MISSING** | — | No Windows autostart implementation; `main.ts` never calls `app.setLoginItemSettings` and contains no autostart code. |
| **Menu: GitHub OAuth device flow** | `AppModel.swift` (`runGitHubLogin`), `MunkelKit/GitHubDeviceAuth.swift` | **DONE** | `src/main/github-login.ts`, `src/core/github-device-auth.ts` | Full device flow with user code, clipboard, browser open, profile fetch, avatar encode. |
| **GitHub login is mandatory** | `AppModel.swift:81` (`if Identity.githubLogin != nil`) | **N.A. / product gap** | `src/renderer/components/MenuWindow.tsx`, `README.md` | Windows allows manual display name and works without GitHub; macOS gates everything on GitHub. |
| **Command palette (Quick send)** | `CommandPalettePresenter.swift`, `CommandPaletteView.swift`, `CommandPaletteState.swift` | **DONE** | `src/renderer/components/PaletteWindow.tsx`, `src/main/palette-window.ts` | Search, recipient list, compose view, image attach, send via `sendChat`/`sendImages`. |
| **Global hotkey for palette** | `Shortcuts.swift` (`togglePalette`, default ⌃⌘M) | **DONE** | `src/main/shortcuts.ts` | Registers `Ctrl+Shift+M`; unregisters on quit. |
| **Rebindable hotkey UI** | `MenuView.swift` (`KeyboardShortcuts.Recorder`) | **MISSING** | — | Windows shortcut is hardcoded; no UI to change it. |
| **Incoming message notch** | `NotchPresenter.swift`, `MessageNotchView.swift`, `MessageNotchContainer.swift` | **DONE** | `src/renderer/components/NotchWidget.tsx`, `src/main/notch-window.ts` | Shows avatar, sender, channel icon, circle dot, message text, image thumbs. |
| **Notch inline reply** | `NotchPresenter.swift` (`beginReply`), `MessageNotchContainer.swift` (reply field) | **DONE** | `src/renderer/components/NotchWidget.tsx`, `src/main/notch-focus.ts` | Reply button + message-body click open reply; `beginNotchReply`/`endNotchReply` toggle focusability; 80 ms focus delay matches macOS. |
| **Notch reply-sent confirmation** | `MessageNotchContainer.swift:360-377` (`sentConfirmation`) | **MISSING** | — | macOS shows a "Sent to …" confirmation chip after a reply; Windows closes the reply field with no confirmation. |
| **Notch 60-second history** | `NotchPresenter.swift` (`historyWindow = 60`, `visibleHistory`) | **DONE** | `src/renderer/lib/useNotchLifecycle.ts`, `src/renderer/lib/prune-notch-history.ts` | `NOTCH_HISTORY_MS = 60000`; entries pruned every second; reopened on hover. |
| **Notch history expand/collapse toggle** | `MessageNotchContainer.swift` (`historyExpanded`) | **MISSING** | — | Windows history list is always expanded/scrollable; no one-line collapsed rows with expand toggle. |
| **Notch copy message** | `MessageDisplayModel.copy`, `CopyMessageButton.swift`, `MessageNotchContainer.copyCurrent()` | **PARTIAL** | `src/renderer/components/NotchWidget.tsx` (copy button, `copyText`) | Copies text via `navigator.clipboard.writeText` and shows checkmark feedback. macOS also copies the full-resolution image (if loaded) for image messages; Windows copies only text. |
| **Hover-"C" copy hotkey** | `Shortcuts.swift` (`copyHoveredHistory`), `NotchPresenter.swift` | **MISSING** | — | Windows has no keyboard shortcut to copy hovered/current message. |
| **Unread message indicator dot** | `UnreadIndicatorView.swift`, `NotchPresenter.swift` (`showIndicator`) | **MISSING** | — | Windows peek/retract sliver replaces the concept visually but has no explicit unread blue dot. |
| **Message text ticker for long strings** | `TickerText.swift` | **MISSING** | — | Windows truncates/wraps message text; no single-line scroll teaser. |
| **Compact avatar slide-in + pulse ring** | `CompactAvatarView.swift` | **MISSING** | `src/renderer/components/Avatar.tsx` | Windows `Avatar` is static initials/gradient; no entry animation or pulse. |
| **Image album send** | `AppModel.swift` (`send(images:...)`), `GroupSession.swift` (`sendImages`) | **DONE** | `src/main/group-session.ts` (`sendImages`), `src/core/image-codec.ts`, `src/core/blob-upload.ts` | AVIF transcode, seal, upload, send pointer; up to 8 images. |
| **Image album receive (inline thumbs)** | `MessageNotchView.swift`, `AlbumCell.swift` | **DONE** | `src/renderer/components/NotchWidget.tsx` | Renders base64 AVIF thumbs at 72×72. |
| **Image full-resolution lazy load / lightbox** | `MessageNotchView.swift` (`AlbumCell.load`), `MessageDisplayModel.fullImages` | **MISSING** | — | Windows only renders inline thumbnails; never fetches/decodes full resolution from R2. |
| **Circle colors by joined-list index** | `GroupColor.swift` | **DONE** | `src/shared/group-color.ts` | Same 8-color palette, same index assignment, same green/orange exclusion. |
| **Avatar deterministic gradient + initials** | `AvatarView.swift`, `CompactAvatarView.swift` | **DONE** | `src/renderer/components/Avatar.tsx` | Same FNV-1a hash, same 6 palettes, same initials logic. |
| **Profile broadcast (display name + avatar)** | `AppModel.swift` (`broadcastProfile`), `GroupSession.swift` (`sendProfile`) | **DONE** | `src/main/session-store.ts` (`broadcastProfiles`), `src/main/group-session.ts` | Debounced profile broadcast on identity change; incoming profiles update member list. |
| **Relay client / E2E crypto** | `MunkelKit/RelayClient.swift`, `MunkelKit/MessageCrypto.swift` | **DONE** | `src/core/` (crypto, payload, relay client), `src/main/relay-client.ts` | AES-256-GCM interop, group-key derivation, wire framing. |
| **Named-pipe / Unix-socket control server for CLI** | `ControlServer.swift` | **DONE** | `src/main/control-handlers.ts`, `@munkel/shared-wire/transport` | Named pipe on Windows; `groups` and `send` (incl. image) actions implemented. |
| **CLI installer from app menu** | `CLIInstaller.swift` | **MISSING** | — | Windows README says bundling the CLI is "an optional future follow-up"; no menu item. |
| **Single-instance lock** | implicit macOS LSUIElement | **DONE** | `src/main/main.ts` (`app.requestSingleInstanceLock`) | Second instance exits; first instance shows menu. |
| **Auto-update** | `UpdaterController.swift` (Sparkle) | **DONE** | `src/main/update-service.ts` (electron-updater) | GitHub Releases feed, check on launch + 24 h, install-with-consent. |
| **Auto-update "Check Automatically" UI toggle** | `UpdaterController.swift` (`automaticallyChecksForUpdates`) | **MISSING** | — | Windows auto-checks unconditionally in packaged builds; no user-facing toggle. |
| **Capture-proof surfaces** | `CaptureExclusion.swift`, `NotchPanelWindow.swift` (`sharingType`) | **DONE** | `src/main/menu-window.ts`, `src/main/notch-window.ts`, `src/main/palette-window.ts` (`setContentProtection(true)`) | All app windows call `setContentProtection(true)`. |
| **Hardware-notch integration** | `NotchPanel/NotchScreenMetrics.swift`, `NotchHostingContent.swift` | **N.A.** | `src/main/notch-window.ts`, `src/renderer/styles/global.css` | Windows has no hardware notch; uses a floating top-center pill. Replacement concept is the existing CSS tab. |
| **Notch dynamic resize to content** | `NotchPanel.swift` (`preferredContentSize`, full-screen canvas) | **MISSING** | `src/main/notch-window.ts:11-12`, `src/renderer/styles/global.css:499` | Window is hardcoded `NOTCH_WIDTH = 360`, `NOTCH_HEIGHT = 260` and CSS `.notch-widget { width: 360px }`; no dynamic resize to content exists. The bug doc `docs/bugs/windows-notch-ux-2026-06-30.md` claims WIN-NOTCH-001 was fixed, but current code does not reflect that. |
| **NSIS installer + Start-Menu/Desktop shortcuts** | macOS `.app`/DMG/Homebrew | **DONE** | `electron-builder.yml`, `README.md` | `bun run pack:installer` produces `Munkel-Setup-<version>.exe` with shortcuts. |
| **Dev-only "Echo my broadcasts" toggle** | `AppModel.swift` (`devEchoBroadcasts`) | **MISSING** | — | No Windows equivalent; Windows dev builds do not echo own sends to the notch. |
| **Dev-only "Allow in screenshots" toggle** | `CaptureExclusion.swift` (`CaptureScreenshotPreference`) | **MISSING** | — | Windows has no runtime toggle to relax capture exclusion. |

## Status summary

- **DONE:** 20 features (core messaging, notch basics, palette, tray, crypto, CI/packaging, auto-update).
- **PARTIAL:** 3 features (settings menu completeness, recipient picker fidelity, notch copy message).
- **MISSING:** 17 features (autostart, CLI installer, image full-res view, clipboard image paste, rebindable hotkey, hover-C copy, unread indicator, ticker, compact avatar animation, history expand/collapse, notch dynamic resize, auto-update toggle, dev echo/screenshot toggles, copy circle code button, message character limit, reply-sent confirmation).
- **N.A. / product decision:** 2 items (hardware notch → replacement pill, GitHub login optional on Windows vs mandatory on macOS).

## Prioritized phases

### P1 — Open bugs before features (~1 session) — ✅ DONE (2026-07-10)

Address the Phase-E UI bugs and re-verify the notch sizing claim before shipping any new functionality.

> **Status:** P1 komplett inkl. Review-Härtung (2026-07-10), **227 pass / 2 skip / 0 fail**. Code-seitig PR-reif. Verbleibendes Gate: manuelles QA. Siehe [P1 implementation notes](#p1-implementation-notes-2026-07-10) unten.

| # | Task | Windows files | Estimate | Verification |
|---|---|---|---|---|
| P1.1 | **Dropdown white-on-white (E1).** The recipient `<select>` uses `.frosted-field` which sets `color: var(--munkel-text)` (white) but the native Windows select popup may render with a light system background. Add explicit `<select>` styling or replace with a custom dropdown so options remain readable. | `src/renderer/components/MenuWindow.tsx`, `src/renderer/styles/global.css` | S | `bun run typecheck`; add/extend `src/renderer/components/__tests__/MenuWindow.test.tsx` to assert that the rendered `<select>`/custom dropdown has a dark background or explicit `option` color that is readable against the popup background; manual QA: open recipient dropdown in menu on Windows. |
| P1.2 | **Display-name Enter bug (E2).** The settings popover input has `onBlur={updateName}` and `onKeyDown` Enter → `updateName()` (`MenuWindow.tsx:120-123`). Determine why Enter sometimes fails to persist (likely the popover closes before blur fires, or Enter triggers a form/button conflict). Fix the event ordering and add an explicit save. | `src/renderer/components/MenuWindow.tsx` | S | `bun run typecheck`; extend `src/renderer/components/__tests__/MenuWindow.test.tsx` with a test that opens the settings popover, types a name, presses Enter, and asserts `updateProfile` is called exactly once with the new name (and is not called again on blur); manual QA. |
| P1.3 | **Re-verify notch vertical oversize (E3 / WIN-NOTCH-004).** `notch-window.ts:11-12` hardcodes `NOTCH_WIDTH = 360`, `NOTCH_HEIGHT = 260` and `global.css:499` hardcodes `.notch-widget { width: 360px }`. The bug doc and `STATE.md` claim this was fixed, but the evidence is not present in current code. Measure the live Windows notch at 100 % / 125 % / 150 % scaling, compare to the macOS reference (~250 pt content width in `MessageNotchContainer.swift:163`), and either document that it is acceptable or implement dynamic resize to content. | `src/main/notch-window.ts`, `src/renderer/components/NotchWidget.tsx`, `src/renderer/styles/global.css` | M | Manual HITL + screenshot overlay at 100 % / 125 % / 150 % scaling; `bun run typecheck`; extend `src/main/__tests__/notch-window.test.ts` to assert that the created `BrowserWindow` width/height match the content size (or that a dynamic-size helper returns dimensions ≤ the previous hardcoded values); `bun run test`. |
| P1.4 | **Update bug docs / STATE.md status.** If P1.1–P1.3 resolve the issues, update `docs/bugs/windows-notch-ux-2026-06-30.md` and `.planning/STATE.md` with verified status. (No code changes otherwise.) | `docs/bugs/windows-notch-ux-2026-06-30.md`, `.planning/STATE.md` | S | No new automated test required (docs-only); verify by reading the updated docs and confirming they match the code state after P1.1–P1.3. |

#### P1 implementation notes (2026-07-10)

Implemented on `platform/windows/macos-parity-p1` (off `platform/windows/tray-click-fix`). Verification per commit: `bun run typecheck` clean; final `bun test` in `apps/windows`: **207 pass / 2 skip / 0 fail** (604 expect calls, 24 files).

- **P1.1 — Dropdown white-on-white (done).** Root cause: the native Windows `<select>` popup ignores the translucent `.frosted-field` background, so white `--munkel-text` rendered on the light system popup. Fix: explicit `.frosted-field option { background-color: #1c1c1e; color: var(--munkel-text) }` in `global.css` (Chromium on Windows honors option-level colors). New test: `src/renderer/styles/__tests__/global.css.test.ts` asserts the option rule exists, is non-white, and sets an explicit color.
- **P1.2 — Display-name Enter bug (done).** Root cause: Enter and the subsequent blur both called `updateName()` with no idempotence guard, and Enter did not commit/close deterministically. Fix in `MenuWindow.tsx`: `commitNameOnEnter` prevents default, commits, and blurs the input (macOS behavior: Enter commits); a `lastSavedNameRef` guard makes `updateName()` idempotent so blur-after-Enter and unchanged names never re-submit. New tests (3) in `MenuWindow.test.tsx`: Enter commits exactly once with the new name; blur after Enter does not re-submit; Enter without change is a no-op.
- **P1.3 — Notch oversize / WIN-NOTCH-004 (done, measured fix).** Confirmed: code still had `NOTCH_WIDTH = 360`, `NOTCH_HEIGHT = 260`, CSS `width: 360px`, `min-height: 100%` — the bug doc's "fixed 2026-07-04" claim did not match the code. Fix: widget/window width reduced to **280 px** (macOS `tickerWindow = 250` pt reference + padding), padding tightened, `min-height: 100%` removed so the widget sizes to content, and a new sender-guarded `notch-resize` IPC lets the renderer (ResizeObserver on `.notch-widget`, `offsetHeight` so slide transforms are ignored) drive the window height, clamped to `[40, 480]` via exported `clampNotchHeight`. Width/position never change — like macOS, the notch only grows downward. New tests (8) in `src/main/__tests__/notch-window.test.ts` cover compact width (< 360, ≤ 280), default height ≤ 260, clamp behavior, resize-only-height, resizable-state restore, and no-op paths. IPC contract doc updated (`docs/ipc-contract.md`).
- **P1.4 — Doc status sync (done).** `docs/bugs/windows-notch-ux-2026-06-30.md` corrected (WIN-NOTCH-001 sizing claim was premature; actual fix landed 2026-07-10), `.planning/STATE.md` E1/E2/E3 statuses updated (untracked private notes, not committed), plans index updated.
- **Test hardening pass (2026-07-10, no production code changes).** Closed coverage gaps left after P1.1–P1.3: `notch-window.test.ts` gained exact-boundary clamp tests (`40`/`480` pass through unchanged) and `resizeNotchToContent` tests for a sub-minimum "retracted sliver" report and NaN/negative renderer input; a new `NotchWidget.test.tsx` exercises the `ResizeObserver` wiring itself (initial report on mount, observer fires → re-report, `disconnect()` on unmount, safe no-op when `ResizeObserver` is undefined) — none of this had a component-level test before; `MenuWindow.test.tsx` gained whitespace-only-name and non-Enter-key Enter-handler cases. Found but did not fix a real bug: `updateName()` in `MenuWindow.tsx` sets `lastSavedNameRef.current` synchronously *before* `updateProfile()`'s promise settles, so a rejected save (relay/main-process error) permanently blocks retrying the same name — documented as a skipped regression test (`it.skip(...)`, see comment above it in `MenuWindow.test.tsx`). Final `bun test`: 216 pass / 3 skip / 0 fail (624 expect calls, 25 files); `bun run typecheck` clean.

**Follow-ups (not closed by this session):**
- Manual HITL screenshot QA of the notch at 100 % / 125 % / 150 % display scaling (P1.3 verification row) — code fix landed, live measurement pending.
- Manual QA: recipient dropdown readability and Enter-name-commit in the running app.
- **Optional (INFO aus Re-Review):** Testabdeckung für „Blur mit anderem Namen während ein anderer Name in-flight ist" ergänzen.
- **Optional (INFO aus Re-Review):** `inFlightNameRef`-Reset-Verhalten prüfen, falls `updateProfile` jemals synchron wirft (theoretisch, aktuell nicht beobachtbar).
- ~~Bug (MAJOR): `updateName()`'s optimistic `lastSavedNameRef` update...~~ **Fixed (2026-07-10):** `updateName()` now only commits `lastSavedNameRef` inside `updateProfile(name).then(...)`, leaving it untouched on rejection so the same name can be retried. Regression test un-skipped in `MenuWindow.test.tsx`.
- ~~Bug (MAJOR): P1.1 CSS fix `.frosted-field option`...~~ **Fixed (2026-07-10):** added `color-scheme: dark` on `:root` so Chromium themes native popups (including the `<select>` list) dark regardless of the OS theme; the `.frosted-field option` rule remains as a fallback. Manual QA on a light-theme Windows box is still recommended to close the loop.
- ~~Bug (MAJOR): `notch-resize` in `NotchWidget.tsx:26-34` / `notch-window.ts:36-47` has no debounce/throttle...~~ **Fixed (2026-07-10):** renderer debounces `notch-resize` reports by 80 ms, and `resizeNotchToContent` now tolerates a ±1px difference before calling `setSize`, so display-scaling rounding no longer causes an IPC/resize oscillation loop.
- Untested: the `notch-resize` IPC handler's sender-guard in `main.ts` (`BrowserWindow.fromWebContents(event.sender) !== notchWindow`) has no direct test — `main.ts`'s `app.whenReady()` wiring isn't unit-tested anywhere in this codebase (same gap pre-existed for the other notch channels), so this was left as a known risk rather than introducing a new test-harness pattern.
- The reduced horizontal padding (18 → 14 px) and 280 px width may need visual fine-tuning against the macOS reference once screenshots exist; image albums with many thumbnails (up to 8) may wrap/overlap in the narrower notch.
- ~~Bug (MAJOR): `updateName()` in `MenuWindow.tsx:83-98` serialisiert parallele `updateProfile`-Aufrufe nicht...~~ **Fixed (2026-07-10):** `updateName()` now stamps each submit with a monotonic `nameSaveGenerationRef` and only lets the settle whose generation matches the latest submit update `lastSavedNameRef`, so a late resolve for a stale submit can no longer clobber a newer one. Regression test in `MenuWindow.test.tsx` (out-of-order A/B resolve).
- ~~Bug (MAJOR): Abgelehnte `updateProfile`-Aufrufe in `MenuWindow.tsx:90-97` geben kein UI-Feedback...~~ **Fixed (2026-07-10):** a rejected save now shows a "Saving failed — press Enter to retry" hint under the display-name field for a few seconds (auto-clears, or clears immediately on the next submit/success); the field stays editable throughout. New tests in `MenuWindow.test.tsx`.

### P2 — High-value parity gaps (~2–3 sessions)

Once P1 bugs are closed, land the missing features that materially affect day-to-day parity or discoverability.

| # | Task | Windows files | Estimate | Verification |
|---|---|---|---|---|
| P2.1 | **Launch at Login / autostart.** Add an `app.setLoginItemSettings` call and expose a toggle in the settings popover. Persist the choice; default to `false` (respect user agency, unlike macOS release which auto-registers once). | `src/main/main.ts`, `src/renderer/components/MenuWindow.tsx`, `src/main/identity-store.ts` | M | `bun run typecheck`; manual QA: relog and verify app starts; test toggle persistence. |
| P2.2 | **CLI installer from menu.** Add a menu item that symlinks or copies the existing `apps/cli` build artifact onto PATH (e.g. `%LOCALAPPDATA%\Microsoft\WindowsApps` or a user-writable fallback), mirroring `CLIInstaller.swift`. | `src/main/main.ts`, `src/renderer/components/MenuWindow.tsx`, new `src/main/cli-installer.ts` | M | `bun run typecheck`; manual QA: install, open fresh PowerShell, run `munkel circles`. |
| P2.3 | **Image full-resolution view / lightbox.** Implement lazy fetch of full-res sealed blobs from R2 (reuse `downloadBlob` if present, else add it), decrypt with `messageKey`, and show a lightbox when a notch thumbnail is clicked. Add an R2 download helper to `src/core/blob-upload.ts` or a new `src/core/blob-download.ts`. | `src/core/blob-upload.ts` (or new file), `src/renderer/components/NotchWidget.tsx`, `src/renderer/styles/global.css` | L | `bun run typecheck`; add unit test for download+decrypt; manual QA: send album, click thumb, verify full image. |
| P2.4 | **Replace native recipient `<select>` with avatar chips.** Match macOS `TargetChip`: globe for "All", avatar + name chips for each member, horizontal scroll, hover tooltip. Keeps the existing `onChange` contract. | `src/renderer/components/MenuWindow.tsx`, `src/renderer/styles/global.css` | M | `bun run typecheck`; renderer test for chip selection; manual QA. |

### P3 — Polish and nice-to-haves (~2 sessions)

Lower-priority UX refinements that improve parity but are not blockers.

| # | Task | Windows files | Estimate | Verification |
|---|---|---|---|---|
| P3.1 | **Rebindable global hotkey UI.** Store the shortcut in `state.json`, read it at startup, expose a recorder in settings. Default remains `Ctrl+Shift+M`. | `src/main/shortcuts.ts`, `src/renderer/components/MenuWindow.tsx`, `src/main/identity-store.ts` | M | `bun run typecheck`; manual QA: change shortcut, verify palette toggles. |
| P3.2 | **Hover-"C" copy in notch.** Enable a bare `c` key listener only while the notch is hovered and no reply field is focused, copying the hovered history row or newest message. | `src/renderer/components/NotchWidget.tsx` | S | `bun run typecheck`; manual QA. |
| P3.3 | **Unread indicator dot.** Show a blue dot in the retracted notch when a message arrives and the user has not interacted; hide on hover/click/send. | `src/renderer/components/NotchWidget.tsx`, `src/renderer/styles/global.css`, `src/main/notch-window.ts` | S | `bun run typecheck`; manual QA. |
| P3.4 | **Clipboard image paste in palette and menu.** Add `Ctrl+V` handling that attaches a clipboard image (PNG/TIFF/Bitmap) if present, falling through to text paste otherwise. | `src/renderer/components/PaletteWindow.tsx`, `src/renderer/components/MenuWindow.tsx`, new `src/renderer/lib/clipboard-image.ts` | M | `bun run typecheck`; manual QA: copy image, paste into palette/menu. |
| P3.5 | **Compact avatar entry animation + pulse.** Add CSS keyframes to `Avatar` for slide-in and a one-time pulse ring when a new message appears. | `src/renderer/components/Avatar.tsx`, `src/renderer/styles/global.css` | S | `bun run typecheck`; visual QA. |
| P3.6 | **History expand/collapse toggle.** Render history rows in a one-line collapsed state by default; clicking a row expands it to full text. Add per-row copy. | `src/renderer/components/NotchWidget.tsx`, `src/renderer/styles/global.css` | M | `bun run typecheck`; manual QA. |
| P3.7 | **Auto-update "Check Automatically" toggle.** Expose a checkbox in settings that controls whether `UpdateServiceImpl` starts periodic checks. Persist the choice. | `src/main/update-service.ts`, `src/renderer/components/MenuWindow.tsx` | S | `bun run typecheck`; manual QA. |

## Out of scope

- **Swift/TypeScript shared core unification** (`packages/core/` rewrite) — deferred per Ponytail audit (#1).
- **MSIX / Windows Store distribution** — NSIS installer is the current target.
- **Authenticode code signing** — tracked as a public-release human gate, not a feature-parity item.
- **macOS-specific behaviors with no Windows equivalent:** native About panel, NSPopover anchor arrow, AppKit Edit menu wiring, `LSUIElement` activation policy.
- **Network-level relay hardening / defense-in-depth** — backlog, not parity.

## Open questions (human product decisions)

1. **GitHub login mandatory or optional on Windows?** macOS gates all functionality on GitHub sign-in; Windows currently works without it. Should Windows keep optional manual identity, or align with macOS and require GitHub before joining circles?
2. **Default autostart behavior:** macOS release auto-registers once on first launch. Should Windows mirror that, or stay opt-in (current P2.1 proposal)?
3. **Notch sizing:** Is the current 360 × 260 px fixed window acceptable as the Windows replacement for the hardware-notch tab, or should it dynamically size to content and shrink closer to the macOS ~310 pt reference?
4. **Image album full-resolution view:** Should clicking a thumbnail open a lightbox inside the notch, a separate always-on-top window, or the system default image viewer?
5. **CLI distribution model:** Should the Windows app bundle the CLI in `extraResources` and install from the menu (P2.2), or keep CLI as a separate manual/installer step?
6. **Missing `docs/bugs/windows-notch-regression-2026-07-06.md`:** The user referenced this file but it does not exist. Should it be created retroactively, or is the existing `docs/bugs/windows-notch-ux-2026-06-30.md` the canonical bug tracker?
