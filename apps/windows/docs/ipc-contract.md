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
| `menu-picker-state` | `(open: boolean) => Promise<void>` | `main.ts` | Menu renderer signals when a native picker (recipient `<select>`) is open, so its focus-stealing popup does not blur-dismiss the menu (Plan 06 click-away-to-dismiss). |
| `quit-app` | `() => Promise<void>` | `main.ts` | Quits the application. |
| `join-circle` | `(code: string, relayUrl?: string) => Promise<void>` | `session-handlers.ts` | Join or create a circle. |
| `leave-circle` | `(code: string) => Promise<void>` | `session-handlers.ts` | Leave a circle. |
| `send-chat` | `(code: string, text: string, to?: string) => Promise<{ ok: boolean; error?: string }>` | `session-handlers.ts` | Encrypt and send a chat message. `ok: false` carries a user-facing `error` (e.g. `"Message too long (…; max …)."` when over `MAX_PAYLOAD_CHARS`, or `"Circle offline — message not sent."` when the relay is down). |
| `send-images` | `(code: string, paths: string[], caption: string, to?: string) => Promise<{ ok: boolean; error?: string }>` | `session-handlers.ts` | Read, AVIF-transcode, seal, and upload up to 8 images; send the album payload. `ok: false` carries a user-facing error (codec failure, upload failure, or relay offline). |
| `select-images` | `() => Promise<string[] \| undefined>` | `session-handlers.ts` | Open the system file picker for images. Returns `undefined` when cancelled. |
| `update-profile` | `(displayName: string, avatar?: string) => Promise<void>` | `session-handlers.ts` | Update local identity. |
| `set-relay-url` | `(code: string, relayUrl: string) => Promise<void>` | `session-handlers.ts` | Change relay URL for a circle. |
| `get-state` | `() => Promise<StateUpdate>` | `session-handlers.ts` | Returns current identity and circles. |
| `start-github-login` | `() => Promise<void>` | `main.ts` | Starts the GitHub OAuth device flow. The renderer never receives the access token. |
| `cancel-github-login` | `() => Promise<void>` | `main.ts` | Cancels any in-flight GitHub device-flow attempt and resets the menu state to `idle`. |
| `github-logout` | `() => Promise<void>` | `session-handlers.ts` | Clears persisted `githubLogin` + avatar, keeps `displayName`, and triggers a profile broadcast. |
