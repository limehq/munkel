# @munkel/windows

## Packaging

- `bun run render-ico` regenerates `assets/icon.ico` from `assets/tray-icon.svg`. Run it after SVG changes.
- `bun run pack:dir` produces `apps/windows/release/win-unpacked/`, which contains the portable directory build including `Munkel.exe`.
- `bun run pack` produces `apps/windows/release/Munkel-<version>-win.zip` plus the `win-unpacked` directory.
- Fork beta builds are currently unsigned.

For v1, the Windows Electron app is a standalone bundle. The `munkel` CLI is installed separately and communicates with the app over the named pipe. Bundling the CLI via `extraResources` is an optional future follow-up.

## Open packaging tasks

- NSIS installer target: deferred; zip + portable dir suffice for the fork beta. Add an `nsis` entry to `win.target` and installer config when a guided installer is needed.
- Authenticode code-signing: deferred; fork beta ships unsigned. For public release, obtain a code-signing certificate (`.pfx`), store it in GitHub secrets such as `WINDOWS_CERTIFICATE_PFX` and `WINDOWS_CERTIFICATE_PASSWORD`, and configure `win.certificateFile` / `win.certificatePassword` in `electron-builder.yml`. SmartScreen reputation still builds over time; EV certificates help but cost more. Rationale: an unsigned fork beta is acceptable; signing is a public-release concern.
[![CI](https://github.com/rodgi040/munkel/actions/workflows/ci.yml/badge.svg)](https://github.com/rodgi040/munkel/actions/workflows/ci.yml)

Munkel for Windows — Electron + Vite + React + TypeScript client.

## Status

Phase 1 is feature-complete for day-to-day messaging:

- Join/create circles with human-readable codes (`blue-table-42`).
- Send/receive text chats and image albums (up to 8 images per message).
- System-tray menu, frosted quick-send palette, and top-center notch.
- Inline notch replies (direct or broadcast).
- `munkel` CLI integration over a Windows named pipe.
- Cross-platform crypto interop with the macOS app and server reference.

GitHub login is optional. The app still works with a manual display name and
joined circles even when no GitHub account is connected. A real
device-flow-enabled OAuth app is a later human gate: `github-config.ts` uses
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

- `Ctrl + Shift + M` — toggle the quick-send palette

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
