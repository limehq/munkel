# @munkel/windows

Munkel for Windows — Phase 1 scaffold (Electron + Vite + React + TypeScript).

## Development

```bash
# From the workspace root
bun install

# Start the app in development mode
bun run dev
```

`bun run dev` starts the Vite renderer dev server, builds the main/preload
processes in watch mode, and launches Electron.

## Scripts

- `bun run dev` — start the Electron app in development mode
- `bun run build` — typecheck and build the main, preload, and renderer
- `bun run typecheck` — run TypeScript checks for main and renderer
- `bun run test` — run Bun tests

## Entry points

- `src/main/main.ts` — app entry, single-instance lock, tray, windows, shortcuts
- `src/main/preload.ts` — contextBridge preload exposing the typed IPC API
- `src/renderer/main.tsx` — React entry
- `src/renderer/App.tsx` — routes between `/menu`, `/notch`, and `/palette`

## Window types

- **Menu** (`/menu`) — frosted tray popover, circles, join area, GitHub login
  placeholder
- **Notch** (`/notch`) — top-center floating pill for incoming messages
- **Palette** (`/palette`) — centered spotlight quick-send palette

## Keyboard shortcuts

- `Ctrl + Shift + M` — toggle the quick-send palette
