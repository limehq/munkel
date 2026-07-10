# @munkel/windows

## Packaging

- `assets/logo.svg` is the canonical brand logo source for the Windows app.
- `bun run render-ico` regenerates `assets/icon.ico` (multi-size, 16×16 through 256×256) from `assets/logo.svg`. Run it after SVG changes.
- `bun run render-tray-icon` regenerates the tray PNGs (`tray-icon.png`, `tray-icon-24.png`, `tray-icon-32.png`, `tray-icon-48.png`) from `assets/logo.svg`.
- `bun run pack:installer` produces `apps/windows/release/Munkel-Setup-<version>.exe` — **recommended for end users**. One-click NSIS installer: installs to `%LOCALAPPDATA%\Programs\@munkelwindows\` (electron-builder folder name from `@munkel/windows`), creates Start Menu + Desktop shortcuts (searchable as “Munkel” in Windows Search), and launches the app when done.
- `bun run pack:dir` produces `apps/windows/release/win-unpacked/`, which contains the portable directory build including `Munkel.exe` (for dev/QA).
- `bun run pack` produces the NSIS installer, zip, and portable dir in one run.
- Fork beta builds are currently unsigned. SmartScreen may warn on first run — click **More info** → **Run anyway**.

For v1, the Windows Electron app is a standalone bundle. The `munkel` CLI is installed separately and communicates with the app over the named pipe. Bundling the CLI via `extraResources` is an optional future follow-up.

## Logo assets

`assets/logo.svg` is the single source of truth for the app icon, tray icon, and installer icon. The checked-in file is a placeholder copy of the old `tray-icon.svg`; replace it with the official brand SVG when available, then rerun:

```bash
cd apps/windows
bun run render-ico
bun run render-tray-icon
bun run build
bun run pack:dir
```

No other asset files need to be edited when the official logo arrives.

## Open packaging tasks

- Authenticode code-signing: deferred; fork beta ships unsigned. For public release, obtain a code-signing certificate (`.pfx`), store it in GitHub secrets such as `WINDOWS_CERTIFICATE_PFX` and `WINDOWS_CERTIFICATE_PASSWORD`, and configure `win.certificateFile` / `win.certificatePassword` in `electron-builder.yml`. SmartScreen reputation still builds over time; EV certificates help but cost more. Rationale: an unsigned fork beta is acceptable; signing is a public-release concern.
[![CI](https://github.com/rodgi040/munkel/actions/workflows/ci.yml/badge.svg)](https://github.com/rodgi040/munkel/actions/workflows/ci.yml)

Munkel for Windows — Electron + Vite + React + TypeScript client.

## Auto-updates

The Windows app uses `electron-updater` with a GitHub Releases feed
(`rodgi040/munkel`).

- Packaged builds automatically check for updates on launch and every 24 hours
  by default. A "Check Automatically" checkbox in the settings popover lets
  the user disable this; manual **Check for Updates…** always works
  regardless of the toggle.
- When an update finishes downloading, the menu shows an **Install** button.
- The app never installs an update without user consent.
- Dev mode (`bun run dev`) skips auto-checks to avoid updater noise.

Fork beta builds are currently unsigned, so `electron-builder.yml` disables
update signature verification (`verifyUpdateCodeSignature: false`) with a clear
TODO to re-enable once Authenticode signing is configured.

To create a release-ready installer locally:

```bash
cd apps/windows
bun run pack:release
```

This produces `release/Munkel-Setup-<version>.exe` and `release/latest.yml`.
The release workflow uploads these (plus blockmap files) to the GitHub release.

## Status

Phase 1 is feature-complete for day-to-day messaging:

- Join/create circles with human-readable codes (`blue-table-42`).
- Send/receive text chats and image albums (up to 8 images per message).
- System-tray menu, frosted quick-send palette, and top-center notch.
- Inline notch replies (direct or broadcast).
- `munkel` CLI integration over a Windows named pipe.
- Cross-platform crypto interop with the macOS app and server reference.
- Menu: leaving a circle now shows a confirmation dialog to prevent accidental exits.
- Menu: recipient picker uses avatar chips (globe = everyone, one chip per member), matching the macOS `TargetChip` design.
- Menu: opt-in "Launch at login" toggle in Settings (default off; never auto-registers, unlike the macOS release).
- Menu: "Check Automatically" toggle in Settings for auto-update checks (default on).
- Notch: hover-"C" keyboard shortcut copies the hovered history row (or the newest message) while the notch is hovered.
- Notch: a blue unread-indicator dot appears in the retracted sliver for a message the user hasn't hovered or replied to.
- Palette and menu: `Ctrl+V` attaches a clipboard image (PNG/JPEG/Bitmap) when present, falling through to normal text paste otherwise.
- Avatars slide/fade in on mount, with a one-time pulse-ring for the notch's newest message on arrival.
- Notch: history rows (once reopened via hover) default to a single ellipsized line with a per-row chevron to expand/collapse and a per-row copy button; click-to-reply is unaffected.
- Menu: the quick-send hotkey is rebindable in Settings via a key-combo recorder (default `Ctrl+Shift+M`), with a reset-to-default button and rollback if the new combo can't be registered.
- Menu: each circle card has a "Copy code" button that copies the circle's code to the clipboard, with a brief checkmark confirmation.
- Menu and notch: messages are capped at 2048 characters (matching the macOS app and the CLI), enforced on typed/pasted text and applied to incoming text as well.
- Notch: sending an inline reply shows a brief "Sent to …" confirmation chip before the reply field closes.

GitHub login is optional. The app still works with a manual display name and
joined circles even when no GitHub account is connected. A real
device-flow-enabled OAuth app is a later human gate: `github-device-auth.ts` uses
the public macOS client ID by default, and production verification can later
override it with `MUNKEL_GITHUB_CLIENT_ID`.

## Agent execution plans

Sequential feature plans for coding agents live in
[`docs/plans/README.md`](./docs/plans/README.md). Each plan maps to a
`platform/windows/<feature>` branch off `platform/windows/v2-clean`.

## Development

```bash
# From the workspace root
bun install

# Start the app in development mode
bun run dev
```

`bun run dev` starts the Vite renderer dev server, builds the main/preload
processes in watch mode, and launches Electron.

The dev server binds the first free port starting at **5174** (override with
`VITE_DEV_PORT`). This avoids collisions with other local Vite apps that often
use 5173.

## Scripts

- `bun run dev` — start the Electron app in development mode
- `bun run build` — typecheck and build the main, preload, and renderer
- `bun run typecheck` — run TypeScript checks for main and renderer
- `bun run test` — run Bun tests
- `bun run test:interop` — **from repo root**: wire-level two-peer
  round-trip against the live relay. Requires the relay to be running
  (`cd apps/server && bun run dev`). Exits non-zero on any failed
  assertion. Override the code or URL with `CODE=…` / `RELAY_URL=…`.
  See `scripts/interop.ts` for details; this is a manual run, not part
  of `bun run test`.
- `bun run test:interop:vectors` — **from repo root**: regenerate and run
  the shared Swift ↔ Windows golden-vector suite (`scripts/interop-vectors/`).
  On macOS also run `cd apps/macos && swift test` to verify
  `InteropVectorsTests.swift`.

## Entry points

- `src/main/main.ts` — app entry, single-instance lock, tray, windows, shortcuts
- `src/main/preload.ts` — contextBridge preload exposing the typed IPC API
- `src/renderer/main.tsx` — React entry
- `src/renderer/App.tsx` — routes between `/menu`, `/notch`, and `/palette`

## Window types

- **Menu** (`/menu`) — frosted tray popover, circles, join area, display-name
  editing
- **Notch** (`/notch`) — top-center floating pill for incoming messages and
  inline replies; image albums render as inline AVIF thumbnails
- **Palette** (`/palette`) — centered spotlight quick-send palette with
  recipient filtering and image attachment (up to 8 images + caption)

## Keyboard shortcuts

- `Ctrl + Shift + M` — toggle the quick-send palette (default; rebindable in the menu's Settings popover)

## CLI integration

The Windows app exposes a named-pipe control server at
`\\.\pipe\Munkel-<username>-Control`. The CLI (`apps/cli`) detects Windows
and uses this pipe automatically:

```powershell
munkel circles
munkel blue-table-42 Alex "hey"
munkel blue-table-42 all "coffee?"
munkel blue-table-42 image ./photo1.png ./photo2.png --caption "weekend"
munkel dm Alex "ping"
```

If the app is not running, the CLI launches it and waits for the pipe.

## Architecture notes

- Crypto, protocol framing, and relay client live in `src/core/` and mirror
  the macOS `MunkelKit` implementation.
- Image albums are transcoded to AVIF, sealed with AES-256-GCM, uploaded to
  the relay's R2-backed blob store, and delivered as a compact `image` payload.
- The renderer ↔ main IPC contract is documented in `docs/ipc-contract.md`;
  the UI specification is in `docs/ui-spec.md`.
