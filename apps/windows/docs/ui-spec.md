# Munkel Windows UI Specification — Phase 1

This document translates the macOS Munkel UI (`apps/macos/Sources/MunkelApp/`)
to a Windows-native Electron implementation.

## Design principles

- **Always dark.** The app never presents a light chrome; all surfaces are
  black or dark translucent.
- **Frosted glass.** Translucent panels with `backdrop-filter: blur(20px)` sit
  on top of the desktop so wallpaper color shows through subtly.
- **Rounded, pill-shaped containers.** The notch is a floating rounded tab; the
  menu is a rounded popover; the palette is a rounded spotlight.
- **White text hierarchy.** Primary text at ~96% white, secondary at ~65%,
  tertiary at ~45%.
- **Stable, deterministic colors.** Avatars and circle dots derive colors
  deterministically so every sender/circle looks the same across sessions.

## Color palette

### Surfaces

| Token | Value | Usage |
|-------|-------|-------|
| `--munkel-bg` | `#0b0b0d` | App background (rarely visible) |
| `--munkel-surface` | `rgba(22, 22, 24, 0.86)` | Frosted panel fill |
| `--munkel-border` | `rgba(255, 255, 255, 0.10)` | Hairline borders |
| `--munkel-accent` | `#0a84ff` | Primary action, selection |
| `--munkel-accent-soft` | `rgba(10, 132, 255, 0.25)` | Selected row fill |

### Text

| Token | Value | Usage |
|-------|-------|-------|
| `--munkel-text` | `#ffffff` | Headlines, message text |
| `--munkel-text-primary` | `rgba(255,255,255,0.96)` | Body text |
| `--munkel-text-secondary` | `rgba(255,255,255,0.65)` | Metadata, captions |
| `--munkel-text-tertiary` | `rgba(255,255,255,0.45)` | Disabled, hint text |

### Circle dots (from `GroupColor.swift`)

The macOS palette deliberately excludes green/orange because those already
mean "online"/"offline" in the menu. Windows uses the same fixed palette:

```
blue (#3b82f6), purple (#a855f7), pink (#ec4899),
teal (#14b8a6), yellow (#eab308), indigo (#6366f1),
mint (#10b981), brown (#92400e)
```

Windows uses Tailwind `amber-900` (`#92400e`) for the brown slot rather
than SwiftUI's semantic `.brown` (`#a87132`) so the palette stays in the
Tailwind vocabulary the rest of the design system uses; the 8-color
ordering and the green/orange exclusion are otherwise identical.

Circle colors are assigned by index in the joined list.

### Avatar gradients (from `AvatarView.swift`)

Avatars use a deterministic FNV-1a hash into six gradients:

```
[#f56a6a → #d93069]
[#5ba6fa → #3857eb]
[#66d99e → #1a9376]
[#fab74f → #ea6b2e]
[#bf84fa → #7a3fe0]
[#57d6dc → #2980b8]
```

Initials are the first letter of the first two whitespace-separated words,
uppercased.

## Typography

- Font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, ...`
- Menu title: 15px / 600
- Circle code: 13px / 600 / monospace
- Message body: 14px / 500
- Message meta: 11px / 600 (sender), 11px / 400 (rest)
- Palette query: 22px / 400
- Captions: 11px / 400
- Avatar initials: `size * 0.38` / 700

All text uses `-webkit-font-smoothing: antialiased`.

## Window behaviors

### Menu window

- **Size:** 320px wide, height grows with content (max ~520px before scroll).
- **Position:** bottom-right of primary screen, near the system tray area
  (Electron cannot read tray bounds on Windows, so the position is a fixed
  offset from the work-area edges).
- **Frame:** none; transparent background.
- **Style:** rounded 12px frosted popover with 1px hairline border.
- **Interaction:** tray left-click toggles visibility; right-click shows a
  context menu with Show Menu, Quick send, Quit.

### Notch widget

- **Size:** 360px wide; height adapts to content.
- **Position:** horizontally centered at the very top of the primary screen
  (`y = 0`).
- **Frame:** none; transparent background outside the pill.
- **Style:** black translucent pill (`rgba(10,10,12,0.96)`), `blur(20px)`,
  rounded bottom corners ~20px, rendered shadow.
- **Shadow strategy:** because `transparent + frameless` windows on Windows do
  not get a native DWM shadow, the notch shadow is rendered via an internal
  `::before` pseudo-element with `filter: blur(12px)`.
- **Animation:** simple CSS enter animation (slide down + fade). Full
  teaser/expanded morph is reserved for Phase 2; Phase 1 shows a static
  expanded view.
- **Demo:** the notch is shown briefly on launch so the Phase 1 scaffold is
  visible.

### Palette window

- **Size:** 640 × 440px.
- **Position:** centered on primary screen.
- **Frame:** none; transparent background.
- **Style:** rounded 16px frosted spotlight.
- **Interaction:** `Ctrl + Shift + M` toggles visibility. Phase 1 supports
  recipient selection; selecting a recipient switches to a compose view.

### Window shadow flags

All frameless windows are created with `hasShadow: true` and `thickFrame: true`
in their Electron `BrowserWindow` options. This is done for correctness, but
Windows DWM typically ignores native shadows for transparent frameless windows,
so the visual shadow is rendered in CSS instead.

## Components

### Frosted field

A translucent input with a hairline border and an accent focus ring:

```
background: rgba(255,255,255,0.08);
border: 1px solid rgba(255,255,255,0.10);
border-radius: 7px;
focus: background 0.12 + shadow 0 0 0 3px rgba(10,132,255,0.5)
```

### Icon button

Transparent circular-ish button for action icons. Hover lightens the
background.

### Avatar

Circular initials on a deterministic gradient. Supports a special "everyone"
state using the 👥 glyph on a neutral background.

### Status dot

8px circle. Green (`#34c759`) = connected, orange (`#ff9f0a`) = disconnected.

### Menu sections

1. **Header** — app icon + name + settings gear menu.
2. **Circle list** — expandable cards with status dot, code, member avatars,
   member names, recipient picker, message field, send button.
3. **Join area** — single input for join/create, dice button for random code,
   Join button.
4. **Quick-send hotkey** — plane icon + label + `Ctrl + Shift + M`.
5. **GitHub area** — visual states for idle/requesting/awaiting/fetching/failed.

### Notch content

- Avatar + sender name + channel icon (🔒 direct / 🌐 broadcast) + circle dot +
  circle name.
- Message text. For image albums the text is the caption or a fallback like
  "Sent 3 images".
- Inline AVIF thumbnail row when `NotchMessage.images` is present. Each thumb
  is rendered as a 72 × 72 px `object-fit: cover` image from a base64 data URI.
  These previews are shown for any incoming image album, including albums sent
  via the `munkel image` CLI command.
- Copy button (copies the message text).
- Clicking the message opens an inline reply field with a channel toggle
  (🔒/🌐) and frosted input.
- `Enter` or the `➤` send button calls `useAppStore().sendChat`; on
  `false` (session offline) the field stays open with a small red
  inline error ("Circle offline — reply not sent."). A new incoming
  message (`onNotchMessage`) resets the reply state so a half-typed
  reply cannot bleed across messages.
- The reply is private by default for direct messages, broadcast by
  default for public messages (matches the incoming channel). The
  recipient `memberId` is resolved from `state.circles` by display
  name; if the sender has since renamed, the original display name
  is sent as `to` so the wire payload stays parseable.

### Palette content

- Search input with plane icon.
- Recipient list is derived live from `useAppStore().state.circles`:
  one `Everyone in <code>` row per circle plus one row per member.
  Filtered by name or circle code, case-insensitive.
- When no circles are joined yet the list shows a hint pointing the
  user to the Munkel menu; otherwise an unmatched query shows
  "No matches."
- Selected row highlighted with accent-soft background.
- Compose view with back arrow, target avatar/name/circle, image-attach
  button (🖼️), message/caption input, and a `➤` send button.
- The image-attach button calls `useAppStore().selectImages()`, which opens
  the system file picker and returns absolute paths. Up to 8 images can be
  attached; each selected file renders as a removable chip showing its
  filename.
- With no images attached, `Enter` and the send button call
  `useAppStore().sendChat`. With one or more images attached, they call
  `useAppStore().sendImages(code, paths, caption, to)`. The same image
  attach/send flow is also available from the CLI via `munkel image`
  (`imagePaths` over the named-pipe control channel).
- On `false` the field stays open with a small red inline error
  ("Circle offline — message not sent." or the codec/upload error) and
  the text/images are preserved for retry. On success the palette hides via
  `window.electronAPI.hideWindow()`.

## Live data wiring

`PaletteWindow` and `NotchWidget` read from the `useAppStore()` context
(`apps/windows/src/renderer/store/app-store.tsx`), which is fed by the
`state-update` and `notch-message` push channels from the main process.
See `docs/ipc-contract.md` for the wire shape.

The historical fixtures in `src/renderer/mock-data.ts` are deprecated
and unused by any renderer component. They should be deleted in the
next cleanup pass; left in place temporarily to keep the palette/notch
change reviewable.

## Animations

- Notch enter: `translateY(-18px) scaleY(0.92) → translateY(0) scaleY(1)`,
  opacity 0 → 1, duration 0.45s, ease-out.
- Palette enter: `scale(0.96) → scale(1)`, opacity 0 → 1, duration 0.2s.
- Frosted field focus: 0.15s box-shadow transition.
- Button active: 0.1s scale(0.97).
- Spinner: 0.8s linear rotation.

## Accessibility & platform notes

- All windows are frameless; all close/hide logic is handled by the app.
- Windows are `alwaysOnTop` so they remain usable while other apps are focused.
- The app uses a single-instance lock; launching a second instance exits
  immediately.
- No `.help`/tooltips are used inside the notch/palette because tooltip
  windows cannot inherit capture exclusion on macOS; Windows inherits the same
  precaution.
- Global shortcut `Ctrl + Shift + M` is registered on app launch and
  unregistered before quit.
