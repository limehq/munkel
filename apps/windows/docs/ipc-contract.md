# `apps/windows` IPC contract

This document describes the renderer ↔ main-process contract for the Munkel
Windows Electron app.

> **Single source of truth:** the actual channel name strings live in
> `apps/windows/src/shared/ipc-channels.ts` (`IPC_CHANNELS` for renderer→main
> invokes, `PUSH_CHANNELS` for main→renderer pushes). This document mirrors
> those constants; when adding or renaming a channel, update both.

## Renderer → Main (invokable)

All renderer-to-main calls go through `window.electronAPI` and are handled in
the main process by `ipcMain.handle(...)`.

| Channel | Signature | Handler location | Notes |
|---------|-----------|------------------|-------|
| `get-window-type` | `() => Promise<'menu' \| 'notch' \| 'palette'>` | `main.ts` | Identifies which window sent the request. |
| `hide-window` | `() => Promise<void>` | `main.ts` | Hides the window that sent the request. |
| `show-palette` | `() => Promise<void>` | `main.ts` | Shows the quick-send palette. |
| `toggle-menu` | `() => Promise<void>` | `main.ts` | Toggles the tray menu window. |
| `menu-picker-state` | `(open: boolean) => Promise<void>` | `main.ts` | Menu renderer signals when a native picker (recipient `<select>`) is open, so its focus-stealing popup does not blur-dismiss the menu (Plan 06 click-away-to-dismiss). |
| `quit-app` | `() => Promise<void>` | `main.ts` | Quits the application. |
| `join-circle` | `(code: string, relayUrl?: string) => Promise<void>` | `session-handlers.ts` | Join or create a circle. |
| `leave-circle` | `(code: string) => Promise<void>` | `session-handlers.ts` | Leave a circle. |
| `send-chat` | `(code: string, text: string, to?: string) => Promise<{ ok: boolean; error?: string }>` | `session-handlers.ts` | Encrypt and send a chat message. `ok: false` carries a user-facing `error` (e.g. `"Message too long (…; max …)."` when over `MAX_PAYLOAD_CHARS`, or `"Circle offline — message not sent."` when the relay is down). |
| `send-images` | `(code: string, paths: string[], caption: string, to?: string) => Promise<{ ok: boolean; error?: string }>` | `session-handlers.ts` | **Sender must be the palette or menu window** (the channel reads arbitrary renderer-supplied file paths off disk) — other senders get `{ ok: false }` and a warning log. Read, AVIF-transcode, seal, and upload up to 8 images; send the album payload. `ok: false` carries a user-facing error (codec failure, upload failure, or relay offline). After a *successful* send, deletes any clipboard temp files among the sent paths — but only paths registered in the main-side owned-paths set that also lie inside this instance's private clipboard directory (see `save-clipboard-image` below). After a failed send the files stay for the renderer's retry. |
| `select-images` | `() => Promise<string[] \| undefined>` | `session-handlers.ts` | Open the system file picker for images. Returns `undefined` when cancelled. |
| `save-clipboard-image` | `() => Promise<string \| null>` | `session-handlers.ts` (logic in `clipboard-image-save.ts`) | Plan 12 P3.4. **Sender must be the palette or menu window** (the two windows with a paste UI) — other senders are rejected with `null` and a warning log; the notch renders remote content and must never read the clipboard. Reads the OS clipboard's image via Electron's native `clipboard` module (no `navigator.clipboard.read()` permission prompt) and saves it as a `munkel-clipboard-*.png` temp file inside a private per-instance directory (`munkel-clipboard-dir-XXXXXX` under the OS tmpdir, created lazily via `mkdtemp`; POSIX modes 0o700/0o600 — on Windows Node ignores these, so the directory only separates our files from the shared tmpdir and does not restrict access beyond the user-profile ACL), returning its path in the same shape as `select-images`' entries — the compose rows push it into `imagePaths` and it flows through `send-images` unchanged (including its imageCodec size/type limits). **DOS guard:** images over `MAX_CLIPBOARD_PIXELS` (8 × 2048², ≈ 33.5 MP — derived from the codec's `MAX_FULL_PIXELS`, still admits an 8K screenshot) are rejected via a cheap `getSize()` probe BEFORE the expensive PNG encode and disk write. **Temp-file lifecycle:** every path this handler returns is registered in a main-side **owned-paths set**; the `send-images` handler deletes a sent path ONLY if it is in that set (plus basename + containment-in-the-private-directory checks) — a renderer-invented path with a matching basename (e.g. `...\Documents\munkel-clipboard-evidence.png`) is never deleted, since only paths this instance itself wrote are ever in the set. Files are kept on a failed send so the renderer's retry still works. At app quit (`will-quit`) every still-owned file is deleted synchronously and the private directory is removed (`removeOwnedClipboardTempFilesSync`). Leftovers from crashes/forced kills are swept at the next startup by `sweepClipboardTempFiles`, which only touches schema files inside `munkel-clipboard-dir-*` directories of the tmpdir (plus legacy files directly in the tmpdir) that are older than `SWEEP_MIN_AGE_MS` (1 h — a concurrently running second instance's files and directory are fresh and thus protected; a directory is removed only if it was itself older than that). Removing an attachment by hand in the renderer does not delete its file immediately; it is removed at quit or by the sweep. Returns `null` when the sender is rejected, the clipboard has no image, the pixel cap rejected it (incl. NaN/∞ dimensions), or the temp-file write failed — the renderer treats every `null` as "no image" and inserts the synchronously captured clipboard text at the caret instead. |
| `update-profile` | `(displayName: string, avatar?: string) => Promise<void>` | `session-handlers.ts` | Update local identity. |
| `set-relay-url` | `(code: string, relayUrl: string) => Promise<void>` | `session-handlers.ts` | Change relay URL for a circle. |
| `get-state` | `() => Promise<StateUpdate>` | `session-handlers.ts` | Returns current identity and circles. |
| `start-github-login` | `() => Promise<void>` | `main.ts` | Starts the GitHub OAuth device flow. The renderer never receives the access token. |
| `cancel-github-login` | `() => Promise<void>` | `main.ts` | Cancels any in-flight GitHub device-flow attempt and resets the menu state to `idle`. |
| `github-logout` | `() => Promise<void>` | `session-handlers.ts` | Clears persisted `githubLogin` + avatar, keeps `displayName`, and triggers a profile broadcast. |
| `check-for-updates` | `() => Promise<void>` | `main.ts` | Triggers an update check via `electron-updater`. No-op in development. |
| `install-update` | `() => Promise<void>` | `main.ts` | Quits and installs a previously downloaded update. No-op unless an update is in the `downloaded` phase. |
| `get-launch-at-login` | `() => Promise<boolean>` | `main.ts` | **Sender must be the menu window** — other windows get `false`. Returns the persisted opt-in autostart preference (`IdentityStore#launchAtLogin`, default `false`). |
| `set-launch-at-login` | `(enabled: boolean) => Promise<boolean>` | `main.ts` (logic in `login-item.ts`) | **Sender must be the menu window** — other windows are rejected with `false` and nothing is applied or persisted. Applies `app.setLoginItemSettings({ openAtLogin: enabled })` via `setLaunchAtLoginPreference` and, only on success, persists the choice; returns `false` (without persisting) if Electron threw, so the renderer can snap the toggle back. In unpackaged (dev) builds the OS call is skipped but reported as success, so the preference persists without registering the bare `electron.exe` dev shell; the packaged build applies the persisted choice at startup. The sender guard lives in the untested `main.ts` wiring (same pre-existing gap as the `notch-*` guards); the handler logic below the guard is unit-tested in `login-item.test.ts`. |
| `notch-begin-reply` | `() => Promise<void>` | `main.ts` | Promotes the notch window to focusable and focuses it so the inline reply field accepts keyboard input. **Sender must be the notch window** — other windows are ignored. |
| `notch-end-reply` | `() => Promise<void>` | `main.ts` | Blurs the notch and restores `focusable: false` after reply closes. **Sender must be the notch window.** |
| `notch-set-interactive` | `(interactive: boolean) => Promise<void>` | `main.ts` | **Sender must be the notch window.** Toggles `win.setIgnoreMouseEvents(!interactive, { forward: true })` so the renderer can switch between passthrough and interactive states. The `false` (click-through) transition also force-disarms the hover-copy shortcut (`handleNotchSetInteractive`), since the renderer may never receive a mouseleave for the pointer that armed it. |
| `notch-empty` | `() => Promise<void>` | `main.ts` | **Sender must be the notch window.** Debounced renderer signal that history is empty, triggering `requestNotchHide` / `hideNotch`. |
| `notch-resize` | `(contentHeight: number) => Promise<void>` | `main.ts` | **Sender must be the notch window.** Reports the rendered widget height (ResizeObserver) so the main process resizes the notch window to its content, clamped to `[NOTCH_MIN_HEIGHT, NOTCH_MAX_HEIGHT]`. Width never changes. |
| `notch-set-hover-copy` | `(active: boolean) => Promise<boolean>` | `main.ts` (controller in `hover-copy-shortcut.ts`) | **Sender must be the notch window** — other senders are rejected with `false` and a warning log. Hint channel for the OS-level "C" `globalShortcut` (Plan 12 P3.2): `true` arms it (and, while already armed, acts as a throttled mousemove **activity ping**), `false` requests disarm. The notch window is `focusable: false` outside of an active reply, so a page-level `keydown` listener would never see the key. **The main process owns the disarm lifecycle** and force-disarms independently of this channel on: idle timeout (`HOVER_COPY_IDLE_MS` = 15 s without an activity ping — bounds how long a resting pointer can capture "C" system-wide; an actual "C" press also resets the deadline), notch window `hide`, the `notch-set-interactive(false)` click-through transition, renderer `render-process-gone`/`destroyed`, and app quit. Fresh arms are additionally gated on the notch being visible **and** interactive (`canArm`) plus a short post-disarm re-arm cooldown (`HOVER_COPY_REARM_COOLDOWN_MS` = 300 ms), so a stale ping already in flight on the IPC channel cannot re-arm a just-disarmed shortcut. Resolves `false` ONLY when an arm attempt failed OS registration — the renderer latches the feature off for the session on `false`, so transient gate/cooldown rejections resolve `true` while leaving the shortcut disarmed. Fires `notch-copy-hovered` (push) when the key is pressed while armed. |
| `notch-set-preview-active` | `(active: boolean) => Promise<void>` | `main.ts` | **Sender must be the notch window.** Image Quick-Look overlay (Plan 14 / OQ4): widens the notch window to the full display work area and focuses it when `active=true`, restores compact bounds when `active=false`. The window is made focusable during preview so Escape and click-out dismiss events are received; this intentionally focuses the notch window, which will steal focus from any other field (including the inline reply input). The renderer therefore suppresses preview activation while a reply is open. The handler keeps two `previewActive` flags in sync — the bounds flag in `notch-window.ts` and the click-through flag in `notch-interactive-state.ts` — and calls `syncNotchMouseInteractiveState` even if `setNotchPreviewActive` throws. |
| `get-auto-update-check` | `() => Promise<boolean>` | `main.ts` | **Sender must be the menu window** — other windows get `true`. Returns the persisted "Check Automatically" preference (`IdentityStore#autoUpdateCheck`, default `true` — today's unconditional-check behavior). |
| `set-auto-update-check` | `(enabled: boolean) => Promise<boolean>` | `main.ts` | **Sender must be the menu window** — other windows are rejected with `false` and nothing is persisted or applied. Persists the choice and calls `UpdateServiceImpl#setAutoCheckEnabled`, which starts/stops the 24h periodic check loop. Manual "Check for Updates…" (`check-for-updates`) always works regardless of this setting. Always returns `true` on success (no OS call can fail here, unlike `set-launch-at-login`). |
| `get-palette-hotkey` | `() => Promise<string \| null>` | `main.ts` | Plan 12 P3.1. **Sender must be the menu window** — other windows get `DEFAULT_PALETTE_HOTKEY` (`"Ctrl+Shift+M"`). Returns `currentPaletteHotkey`: the accelerator whose `globalShortcut` registration is **confirmed** right now, or `null` while the hotkey is unbound (startup registration failed, or a rebind's rollback also failed — see below). Never reports a merely *intended* binding. |
| `set-palette-hotkey` | `(accelerator: string) => Promise<{ ok: boolean; accelerator: string \| null; error?: 'invalid-accelerator' \| 'registration-failed' \| 'rollback-failed' }>` | `main.ts` (logic in `palette-hotkey.ts`) | Plan 12 P3.1. **Sender must be the menu window** — other senders are rejected with `{ ok: false, accelerator: currentPaletteHotkey, error: 'registration-failed' }` and a warning log; nothing is applied or persisted. Validates the accelerator (`isValidAccelerator` — at least one **non-Shift** modifier `Ctrl`/`Alt`/`Super` plus one main key; Shift alone is rejected as a footgun, e.g. `Shift+A` would swallow every typed capital A) and, if valid and different from the current binding, unregisters the old accelerator and registers the new one via `rebindPaletteHotkey`. **Confirmed-binding invariant:** the returned `accelerator` is always the combo whose OS registration is confirmed at return time — never intent. Outcomes: (1) success → `{ ok: true, accelerator: <new> }`, persisted to `IdentityStore#paletteHotkey`; (2) invalid format → `{ ok: false, accelerator: <current>, error: 'invalid-accelerator' }`, registration untouched; (3) OS rejected the new combo and the **rollback succeeded** → `{ ok: false, accelerator: <old>, error: 'registration-failed' }`; (4) the rollback **also** failed (old combo grabbed in the unregister/re-register window) → one-shot auto-heal tries `DEFAULT_PALETTE_HOTKEY` (unless the default was itself one of the two failed combos): heal success → `{ ok: false, accelerator: 'Ctrl+Shift+M', error: 'rollback-failed' }` (default persisted, so a restart re-registers what is really bound); heal failure → `{ ok: false, accelerator: null, error: 'rollback-failed' }` — the hotkey is genuinely unbound and the renderer shows "Not bound" plus a hint; a later successful set fully heals the state without a restart. The renderer's settings-popover recorder always displays the `accelerator` the response reports, so the UI can never claim a binding that does not exist. |
| `get-last-palette-target` | `() => Promise<{ channel: string | null; member: string | null }>` | `main.ts` | Issue #125. Returns the recipient last navigated to in the quick-send palette, read from `IdentityStore#lastPaletteChannel` / `lastPaletteMember` (`member: null` = the "Everyone in" row; both `null` = nothing remembered). The palette uses it to pre-select that recipient on open, falling back to the first row of the same channel and then to index 0. |
| `set-last-palette-target` | `(target: { channel: string | null; member: string | null }) => Promise<void>` | `main.ts` (logic in `identity-store.ts#setLastPaletteTarget`) | Issue #125. **Sender must be the palette window** — other senders are rejected with a warning log. Called on every palette navigation (arrow keys, Enter, row click), not only on send, and persisted so it survives restarts. Non-string or empty values are sanitized to `null`. |
| `get-is-dev` | `() => Promise<boolean>` | `main.ts` | Plan 13 items 5–6. Backed by `!app.isPackaged` (deliberately NOT an env var like `NODE_ENV`, which a launcher could spoof to unlock the dev toggles — and the capture-protection off-switch — in a shipped release). No sender guard (read-only, identical for every window). Gates whether the two dev-only settings-popover toggles below render/query at all. |
| `get-allow-in-screenshots` | `() => Promise<boolean>` | `main.ts` | Plan 13 item 5, mirrors macOS `CaptureScreenshotPreference`. **Sender must be the menu window AND this must be a dev build** — otherwise `false`. Returns the persisted opt-in (`IdentityStore#allowInScreenshots`, default `false`). |
| `set-allow-in-screenshots` | `(enabled: boolean) => Promise<boolean>` | `main.ts` (logic in `content-protection.ts`) | Plan 13 item 5. **Sender must be the menu window AND this must be a dev build** — otherwise rejected with `false` (a warning log on the sender-guard rejection) and nothing is applied or persisted. Persists the choice and calls `applyContentProtection` across the menu, notch, and palette windows (`setContentProtection(!enabled)`). Windows has no `.readOnly` sharing-type equivalent — enabling this makes the surfaces visible in **live recordings too**, not just screenshots (the same DEBUG trade-off macOS documents). Always returns `true` on success. |
| `get-dev-echo-broadcasts` | `() => Promise<boolean>` | `main.ts` | Plan 13 item 6, mirrors macOS `AppModel.devEchoBroadcasts`. **Sender must be the menu window AND this must be a dev build** — otherwise `false`. Returns `AppState#getDevEchoBroadcasts()` — the persisted preference (`IdentityStore#devEchoBroadcasts`, default `true`) folded together with the dev-build gate, so a packaged build launched against a dev-populated userData folder can never report `true` here even if the file says so. |
| `set-dev-echo-broadcasts` | `(enabled: boolean) => Promise<boolean>` | `main.ts` (logic in `session-store.ts`) | Plan 13 item 6. **Sender must be the menu window AND this must be a dev build** — otherwise rejected with `false` and a warning log; nothing changes. Calls `AppState#setDevEchoBroadcasts`, which persists the raw value and updates the in-memory effective flag (still dev-gated). When enabled, a successful send (broadcast **or** private, #123) `send-chat`/`send-images` also dispatches the sender's own message through the same `onNotch` path used for real incoming messages — the relay only delivers a message to *other* members, so without this a solo developer never sees their own send. Every echo carries `isOwn: true`; a private echo also carries `recipientMemberId` and `isDirect: true`. The main process shows the notch window only for broadcast echoes (unchanged); a private echo is pushed to the hidden notch window without `showNotch`, and the renderer appends it as an `isOwn` history entry. Own broadcast echoes are discarded by the renderer, as before. Echoed sends return `echoed: true` in the `SendResult`, so the renderer does not append its own reply a second time. |

## Main → Renderer (push)

Main pushes events to renderer windows via `webContents.send(...)` and the
renderer registers listeners through `window.electronAPI`.

| Channel | Payload | Purpose |
|---------|---------|---------|
| `state-update` | `{ identity, circles }` | Broadcast current app state to menu, palette, and notch windows. |
| `github-login-state` | `GitHubLoginState` | Push the GitHub login UI state to the menu window only. |
| `palette-show` | `() => void` | `palette-window.ts` | Issue #125. Pushed to the palette window each time it is shown, so the renderer can reset its query and re-resolve the pre-selected recipient. |
| `update-state` | `UpdateState` | Push auto-update phase/progress/errors to menu and palette windows. |
| `notch-message` | `NotchMessage` | New incoming message for the notch widget. `senderMemberId` is the relay `frame.from` UUID (required for private replies). For the sender's own echoed sends (dev-only), `senderMemberId` is the own member id and `recipientMemberId` is the private recipient (#123). `images?` is populated for image albums. `sentAt?` is the sender's payload timestamp (ISO-8601); the notch history is ordered newest-first by `(min(sentAt, receivedAt), receivedAt)` (a missing or unparseable `sentAt` falls back to `receivedAt`; the `min` stops a sender with a fast clock from staying on top), so a late-arriving older message is inserted below the current newest and does not restart its phase. An incoming message never closes an open reply or clears its draft. |
| `notch-show` | *none* | Tell the notch window to animate in. |
| `notch-hide` | *none* | Tell the notch window to animate out. |
| `notch-update` | `NotchMessage` | Update the message shown by the notch widget. |
| `notch-reopen` | *none* | Reserved fallback channel for future cursor-polling reopen logic. Keep wired even if currently idle. |
| `notch-copy-hovered` | *none* | Fired when the hover-"C" `globalShortcut` fires while armed (Plan 12 P3.2). The renderer re-checks its own hover/reply-open state before copying (belt-and-suspenders against a race with the arm/disarm IPC call), then copies the hovered history row, or the newest message if no row is specifically hovered. |
| `relay-error` | `string` | Relay or session error message. |
| `global-shortcut` | *none* | Fired when the global hotkey is pressed. |

## Types

```ts
interface Member {
  memberId: string;
  displayName?: string;
  avatar?: string;
  joinedAt: string;
}

interface CircleState {
  code: string;
  groupId: string;
  isConnected: boolean;
  members: Member[];
  relayUrl: string;
}

interface IdentityState {
  memberId: string;
  displayName: string;
  avatar?: string;
  githubLogin?: string;
}

interface StateUpdate {
  identity: IdentityState;
  circles: CircleState[];
}

type GitHubLoginPhase = 'idle' | 'requesting' | 'awaiting' | 'fetching' | 'failed';

interface GitHubLoginState {
  phase: GitHubLoginPhase;
  userCode?: string;
  error?: string;
}

type UpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';

interface UpdateState {
  phase: UpdatePhase;
  version?: string;
  progress?: number;
  error?: string;
}

interface IncomingImage {
  id: string;       // = r2Key
  thumb: string;    // base64 AVIF thumbnail
  width: number;
  height: number;
}

interface NotchMessage {
  sender: string;
  senderMemberId?: string;  // relay member UUID (frame.from); set on real messages
  recipientMemberId?: string;  // private recipient UUID; set on own private echoes (#123)
  isOwn?: boolean;  // true for the sender's own echoed sends (dev-only, #123)
  text: string;
  isDirect: boolean;
  group: string;
  groupColor: string;
  receivedAt: string;       // local receiver timestamp (ISO-8601), required for 60s history expiry
  sentAt?: string;          // sender payload timestamp (ISO-8601); history sort key is min(sentAt, receivedAt); unparseable falls back to receivedAt
  images?: IncomingImage[];
}
```

## Control pipe contract (CLI → Main)

The `munkel` CLI connects to the Windows app over a per-user named pipe
(`\\.\pipe\Munkel-<username>-Control`). Each connection carries one
newline-delimited JSON request and one JSON response.

### `ControlRequest`

| Property | Type | Description |
|----------|------|-------------|
| `action` | `string` | Command to execute, e.g. `"send"`, `"groups"`, `"image"`. |
| `group?` | `string` | Target circle code. |
| `to?` | `string` | Recipient display name for direct messages. |
| `text?` | `string` | Message text or image caption. |
| `imagePaths?` | `string[]` | Absolute paths to image files. The app reads, seals and uploads them, so the bytes never cross the pipe. Supported formats: jpg/jpeg, png, webp, avif, heic, heif. Maximum 8 images per request. |

### `ControlResponse`

| Property | Type | Description |
|----------|------|-------------|
| `ok` | `boolean` | Whether the command succeeded. |
| `error?` | `string` | User-facing error message when `ok` is `false`. |
| `groups?` | `ControlGroupInfo[]` | List of joined circles for the `"groups"` action. |

```ts
interface ControlGroupInfo {
  code: string;
  connected: boolean;
  members: string[];
}
```

## Security notes

- Raw `messageKey` values never leave the main process.
- GitHub OAuth access tokens stay in main-process RAM only and are never sent
  over IPC. The renderer receives `GitHubLoginState`, `githubLogin`, and the
  base64 JPEG avatar only.
- The preload script exposes a typed allowlist (`window.electronAPI`) and does
  not expose `ipcRenderer` directly.
- Renderer code must use `window.electronAPI` only.
