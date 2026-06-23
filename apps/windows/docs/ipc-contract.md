# `apps/windows` IPC contract

This document describes the renderer ↔ main-process contract for the Munkel
Windows Electron app.

## Renderer → Main (invokable)

All renderer-to-main calls go through `window.electronAPI` and are handled in
the main process by `ipcMain.handle(...)`.

| Channel | Signature | Handler location | Notes |
|---------|-----------|------------------|-------|
| `get-window-type` | `() => Promise<'menu' \| 'notch' \| 'palette'>` | `main.ts` | Identifies which window sent the request. |
| `hide-window` | `() => Promise<void>` | `main.ts` | Hides the window that sent the request. |
| `show-palette` | `() => Promise<void>` | `main.ts` | Shows the quick-send palette. |
| `toggle-menu` | `() => Promise<void>` | `main.ts` | Toggles the tray menu window. |
| `quit-app` | `() => Promise<void>` | `main.ts` | Quits the application. |
| `join-circle` | `(code: string, relayUrl?: string) => Promise<void>` | `session-handlers.ts` | Join or create a circle. |
| `leave-circle` | `(code: string) => Promise<void>` | `session-handlers.ts` | Leave a circle. |
| `send-chat` | `(code: string, text: string, to?: string) => Promise<{ ok: boolean; error?: string }>` | `session-handlers.ts` | Encrypt and send a chat message. `ok: false` carries a user-facing `error` (e.g. `"Message too long (…; max …)."` when over `MAX_PAYLOAD_CHARS`, or `"Circle offline — message not sent."` when the relay is down). |
| `send-images` | `(code: string, paths: string[], caption: string, to?: string) => Promise<{ ok: boolean; error?: string }>` | `session-handlers.ts` | Read, AVIF-transcode, seal, and upload up to 8 images; send the album payload. `ok: false` carries a user-facing error (codec failure, upload failure, or relay offline). |
| `select-images` | `() => Promise<string[] \| undefined>` | `session-handlers.ts` | Open the system file picker for images. Returns `undefined` when cancelled. |
| `update-profile` | `(displayName: string, avatar?: string) => Promise<void>` | `session-handlers.ts` | Update local identity. |
| `set-relay-url` | `(code: string, relayUrl: string) => Promise<void>` | `session-handlers.ts` | Change relay URL for a circle. |
| `get-state` | `() => Promise<StateUpdate>` | `session-handlers.ts` | Returns current identity and circles. |
| `derive-group-id` | `(code: string) => Promise<string>` | `crypto-channel.ts` | Returns the 32-char hex `groupId`. |
| `seal-chat` | `(code: string, text: string, sentAt?: string) => Promise<string>` | `crypto-channel.ts` | Returns a base64 sealed payload. |
| `open-chat` | `(code: string, payload: string) => Promise<{ kind: 'chat'; text: string; sentAt: string } \| null>` | `crypto-channel.ts` | Decrypts and decodes a chat payload. |
| `test-notch` | `() => Promise<void>` | `main.ts` | Shows a demo notch message for 5 seconds. |

## Main → Renderer (push)

Main pushes events to renderer windows via `webContents.send(...)` and the
renderer registers listeners through `window.electronAPI`.

| Channel | Payload | Purpose |
|---------|---------|---------|
| `state-update` | `{ identity, circles }` | Broadcast current app state. |
| `notch-message` | `NotchMessage` | New incoming message for the notch widget. `images?` is populated for image albums. |
| `notch-show` | *none* | Tell the notch window to animate in. |
| `notch-hide` | *none* | Tell the notch window to animate out. |
| `notch-update` | `NotchMessage` | Update the message shown by the notch widget. |
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
}

interface StateUpdate {
  identity: IdentityState;
  circles: CircleState[];
}

interface IncomingImage {
  id: string;       // = r2Key
  thumb: string;    // base64 AVIF thumbnail
  width: number;
  height: number;
}

interface NotchMessage {
  sender: string;
  text: string;
  isDirect: boolean;
  group: string;
  groupColor: string;
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
- The preload script exposes a typed allowlist (`window.electronAPI`) and does
  not expose `ipcRenderer` directly.
- Renderer code must use `window.electronAPI` only.
