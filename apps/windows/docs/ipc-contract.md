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
| `send-images` | `(code: string, paths: string[], caption: string, to?: string) => Promise<{ ok: boolean; error?: string }>` | `session-handlers.ts` | Read, AVIF-transcode, seal, and upload up to 8 images; send the album payload. `ok: false` carries a user-facing error (codec failure, upload failure, or relay offline). |
| `select-images` | `() => Promise<string[] \| undefined>` | `session-handlers.ts` | Open the system file picker for images. Returns `undefined` when cancelled. |
| `save-clipboard-image` | `() => Promise<string \| null>` | `session-handlers.ts` (logic in `clipboard-image-save.ts`) | Plan 12 P3.4. **Sender must be the palette or menu window** (the two windows with a paste UI) — other senders are rejected with `null` and a warning log; the notch renders remote content and must never read the clipboard. Reads the OS clipboard's image via Electron's native `clipboard` module (no `navigator.clipboard.read()` permission prompt) and saves it as a `munkel-clipboard-*.png` temp file, returning its path in the same shape as `select-images`' entries — the compose rows push it into `imagePaths` and it flows through `send-images` unchanged (including its imageCodec size/type limits). **DOS guard:** images over `MAX_CLIPBOARD_PIXELS` (8 × 2048², ≈ 33.5 MP — derived from the codec's `MAX_FULL_PIXELS`, still admits an 8K screenshot) are rejected via a cheap `getSize()` probe BEFORE the expensive PNG encode and disk write. **Temp-file lifecycle:** the file is deleted by the `send-images` handler after a *successful* send (kept on failure so the renderer's retry still works); leftovers from crashed/abandoned sessions are swept at the next startup (`sweepClipboardTempFiles`). Returns `null` when the sender is rejected, the clipboard has no image, the pixel cap rejected it, or the temp-file write failed — the renderer treats every `null` as "no image" and falls back to inserting the clipboard's text manually. |
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
| `get-auto-update-check` | `() => Promise<boolean>` | `main.ts` | **Sender must be the menu window** — other windows get `true`. Returns the persisted "Check Automatically" preference (`IdentityStore#autoUpdateCheck`, default `true` — today's unconditional-check behavior). |
| `set-auto-update-check` | `(enabled: boolean) => Promise<boolean>` | `main.ts` | **Sender must be the menu window** — other windows are rejected with `false` and nothing is persisted or applied. Persists the choice and calls `UpdateServiceImpl#setAutoCheckEnabled`, which starts/stops the 24h periodic check loop. Manual "Check for Updates…" (`check-for-updates`) always works regardless of this setting. Always returns `true` on success (no OS call can fail here, unlike `set-launch-at-login`). |

## Main → Renderer (push)

Main pushes events to renderer windows via `webContents.send(...)` and the
renderer registers listeners through `window.electronAPI`.

| Channel | Payload | Purpose |
|---------|---------|---------|
| `state-update` | `{ identity, circles }` | Broadcast current app state to menu, palette, and notch windows. |
| `github-login-state` | `GitHubLoginState` | Push the GitHub login UI state to the menu window only. |
| `update-state` | `UpdateState` | Push auto-update phase/progress/errors to menu and palette windows. |
| `notch-message` | `NotchMessage` | New incoming message for the notch widget. `senderMemberId` is the relay `frame.from` UUID (required for private replies). `images?` is populated for image albums. |
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
  text: string;
  isDirect: boolean;
  group: string;
  groupColor: string;
  receivedAt: string;       // local receiver timestamp (ISO-8601), required for 60s history expiry
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
