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
| `send-chat` | `(code: string, text: string, to?: string) => Promise<boolean>` | `session-handlers.ts` | Encrypt and send a chat message. |
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
| `notch-message` | `NotchMessage` | New incoming message for the notch widget. |
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

interface NotchMessage {
  sender: string;
  text: string;
  isDirect: boolean;
  group: string;
  groupColor: string;
}
```

## Security notes

- Raw `messageKey` values never leave the main process.
- The preload script exposes a typed allowlist (`window.electronAPI`) and does
  not expose `ipcRenderer` directly.
- Renderer code must use `window.electronAPI` only.
