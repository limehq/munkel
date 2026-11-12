# Architecture

Munkel is a system for ephemeral, end-to-end-encrypted messages between
friends ("channels") that slide out of the MacBook notch. There are no
accounts and no message storage: a channel is born from a shared,
human-readable code (for example `blue-table-42`); each client derives the
relay group ID and the message key from that code on-device, and a deliberately
dumb Cloudflare Worker relay routes opaque ciphertext between the members of a
group without ever seeing the code, the key, or the plaintext. This document is
a navigable map of the components and the data flow; it links to the source
files that are authoritative for each claim, rather than restating the code.

## System overview

```
                                  ┌────────────────────────────────────┐
                                  │             Cloudflare (limehq)             │
                                  │                                             │
  ┌──────────────────────┐  WSS  │  ┌──────────────────────────────────────┐ │
  │  macOS app (Munkel)   │◄─────►│  │  Worker  munkel-relay                  │ │
  │                       │  /ws  │  │  (Hono router)  relay.munkel.app       │ │
  │  ┌────────────────┐   │       │  │                                        │ │
  │  │   MunkelKit    │   │       │  │   GET /ws?group&member   ─┐            │ │
  │  │  GroupKey      │   │       │  │   /blob/:group/:key       │            │ │
  │  │  MessageCrypto │   │       │  │   /health                 │            │ │
  │  │  RelayClient   │   │       │  │                           ▼            │ │
  │  │  BlobClient    │   │  HTTPS│  │   ┌──────────────────────────────┐ │ │
  │  │  AppPayload    │◄──┼──────►│  │   │  Durable Object  GroupRoom       │ │ │
  │  │  GitHubDevice… │   │ /blob │  │   │  one per channel:                 │ │ │
  │  └────────────────┘   │       │  │   │  idFromName(groupId)             │ │ │
  │                       │       │  │   │  WebSocket Hibernation, NO storage│ │ │
  │  MenuBarExtra UI      │       │  │   └────────────────────────────────┘ │ │
  │  NotchPanel (notch)   │       │  └──────────────────────────────────────┘ │
  │  ControlServer (sock) │       │                                             │
  └──────────┬──────────┘       │  ┌──────────────┐    ┌────────────────────┐ │
             │ Unix domain socket│  │ R2  munkel-  │    │  Worker  munkel    │ │
             │ (control.sock)    │  │ blobs        │    │  (TanStack Start)  │ │
  ┌──────────┴───────────┐       │  │ opaque       │    │  munkel.app        │ │
  │  munkel CLI           │       │  │ ciphertext,  │    └────────────────────┘ │
  │  (Bun / TypeScript)   │       │  │ ~66 s TTL,   │                           │
  │  thin send-only client│       │  │ per-min cron │                           │
  └──────────────────────┘       │  └──────────────┘                           │
                                  └────────────────────────────────────┘
```

Solid arrows are network or IPC links. The relay and R2 see only ciphertext and
derived identifiers; the human-readable channel code and message plaintext never
leave the macOS app.

## Components

The repository is a Bun-workspaces + Turborepo monorepo. See the component
table in [`README.md`](../README.md#components).

### macOS app (`apps/macos`)

A Swift/SwiftUI menu-bar app (`MenuBarExtra`, no Dock icon). It owns all crypto
and relay connections; the CLI and the UI are clients of it. Source layout under
[`apps/macos/Sources`](../apps/macos/Sources):

- **`MunkelApp`** — the application module: menu-bar UI, notch presentation,
  app state, and the CLI control socket.
  - [`AppModel.swift`](../apps/macos/Sources/MunkelApp/AppModel.swift) — central
    state: joined channels, identity, and the `handleControl` entry point that
    resolves channel/recipient names for the CLI. It also computes the local
    presence status, overlaying **Away** on an Online base after five minutes
    without keyboard or mouse input (or on screen lock, screen sleep, system
    sleep, or fast user switch). The idle guard ignores `PreventUserIdleDisplaySleep`
    assertions held *solely* by remote-desktop daemons (RustDesk, Screen Sharing,
    ARD, …) so a remote session no longer pins you Online, while genuine
    fullscreen video still suppresses auto-Away.
  - [`GroupSession.swift`](../apps/macos/Sources/MunkelApp/GroupSession.swift) —
    one joined channel: holds its `RelayClient`, seals/opens payloads, tracks
    presence and each member's status, and exchanges `profile` payloads. This is
    where send and receive are wired end-to-end.
  - [`NotchPanel/`](../apps/macos/Sources/MunkelApp/NotchPanel) +
    [`NotchPresenter.swift`](../apps/macos/Sources/MunkelApp/NotchPresenter.swift)
    — the notch display: a borderless `NotchPanelWindow` shaped to the physical
    notch, with a floating fallback panel on Macs without one.
  - [`ControlServer.swift`](../apps/macos/Sources/MunkelApp/ControlServer.swift)
    — the Unix-domain-socket server that backs the CLI.
  - [`CaptureExclusion.swift`](../apps/macos/Sources/MunkelApp/CaptureExclusion.swift)
    — the screen-capture exclusion used by every surface that shows message
    content or channel codes.
- **`MunkelKit`** — the reusable library (crypto, protocol, relay/blob clients,
  GitHub login):
  - [`GroupKey.swift`](../apps/macos/Sources/MunkelKit/GroupKey.swift) — HKDF
    derivation of `groupId` and `messageKey` from the channel code.
  - [`MessageCrypto.swift`](../apps/macos/Sources/MunkelKit/MessageCrypto.swift)
    — AES-256-GCM seal/open (base64 for relay frames, raw bytes for R2 blobs).
  - [`AppPayload.swift`](../apps/macos/Sources/MunkelKit/AppPayload.swift) — the
    `chat` / `profile` / `image` payloads that live *inside* the encrypted blob.
  - [`WireMessage.swift`](../apps/macos/Sources/MunkelKit/WireMessage.swift) —
    the `ClientMessage` / `ServerMessage` wire frames (Swift mirror of
    `protocol.ts`).
  - [`RelayClient.swift`](../apps/macos/Sources/MunkelKit/RelayClient.swift) —
    the WebSocket client (auto-reconnect with exponential backoff capped at
    30 s, 30 s pings).
  - [`BlobClient.swift`](../apps/macos/Sources/MunkelKit/BlobClient.swift) —
    the HTTP client for R2 image blobs (same origin as the relay).
  - [`ImageCodec.swift`](../apps/macos/Sources/MunkelKit/ImageCodec.swift) /
    [`AvatarCodec.swift`](../apps/macos/Sources/MunkelKit/AvatarCodec.swift) —
    AVIF/JPEG transcoding and byte budgets.
  - [`GitHubDeviceAuth.swift`](../apps/macos/Sources/MunkelKit/GitHubDeviceAuth.swift)
    — the OAuth device flow that imports a display-only name and avatar.
  - [`ControlProtocol.swift`](../apps/macos/Sources/MunkelKit/ControlProtocol.swift)
    — the CLI ↔ app control contract.

### munkel CLI (`apps/cli`)

A thin, send-only Bun/TypeScript client. It does **no** crypto and holds **no**
relay connection; it serializes a `ControlRequest` as one line of JSON over the
app's control socket and prints the `ControlResponse`. If the app is not
running, it launches it in the background and waits for the socket. See
[`apps/cli/src/munkel.ts`](../apps/cli/src/munkel.ts) and the CLI section of
[`README.md`](../README.md#munkel-cli).

### Cloudflare Worker relay (`apps/server`)

A Cloudflare Worker (Hono router, Worker name `munkel-relay`) fronting one
Durable Object per channel:

- [`index.ts`](../apps/server/src/index.ts) — the router. Mounts `/health`, the
  blob routes, and `GET /ws`, which validates the `group`/`member` query
  parameters and forwards the WebSocket upgrade to the channel's Durable Object
  via `GROUP_ROOM.idFromName(group)`. It also exports the `scheduled` handler
  for the per-minute blob sweep.
- [`group-room.ts`](../apps/server/src/group-room.ts) — the `GroupRoom` Durable
  Object (`partyserver` `Server`, `hibernate: true`). It validates frames
  against the protocol schema, routes broadcasts and `to`-targeted messages,
  derives presence from live connections, and enforces the per-group connection
  cap (32) and the idle/stale timeout (120 s). **No Durable Object storage is
  used for messages** — only a `setAlarm` to reap stale connections — so
  messages are ephemeral by construction.
- [`protocol.ts`](../apps/server/src/protocol.ts) — the authoritative wire
  protocol v1 (see below).
- [`blob.ts`](../apps/server/src/blob.ts) — the R2 image-blob routes and the
  TTL sweep.

The Worker is reachable at `munkel-relay.limehq.workers.dev` and via the custom
domain **`relay.munkel.app`**, attached on deploy through the `routes` entry in
[`apps/server/wrangler.toml`](../apps/server/wrangler.toml).

### R2 blob store (`munkel-blobs`)

A private R2 bucket bound to the relay Worker as `BLOBS`. It holds
full-resolution image blobs as **opaque ciphertext** (sealed on the client
before upload), namespaced by `groupId` and keyed by a client-generated random
id. It is the only persistence surface in the system, and only briefly: a blob
older than `BLOB_TTL_MS` (≈66 s = the 60 s notch-survival window plus 10 %
grace) is treated as gone (404) and deleted on the next `GET`, and a per-minute
cron (`crons = ["* * * * *"]` in `wrangler.toml`) physically sweeps blobs that
were never fetched. See [`blob.ts`](../apps/server/src/blob.ts).

### Landing page (`apps/landing`)

A TanStack Start (React + Tailwind v4) app served by a separate Cloudflare
Worker (Worker name `munkel`) with SSR, at the custom domains **`munkel.app`**
and **`www.munkel.app`** declared in
[`apps/landing/wrangler.jsonc`](../apps/landing/wrangler.jsonc). It is marketing
and documentation only — it has no access to relay traffic, R2, or any keys.

It emits first-party, cookieless product analytics (pageviews + download-CTA
clicks) to **PostHog EU**. Events are reverse-proxied through the same Worker at
an opaque path (`/relay-Hk2p`) so the browser makes no third-party request; the
client runs in memory-only mode (no cookies, no `localStorage`, no `identify()`,
no session recording, autocapture, or web vitals) and honours DNT/GPC. This is
the landing site only — it stays isolated from the relay, R2, and all keys.

## Windows app (`apps/windows`)

The Windows client is an Electron app. It speaks the same wire protocol and uses
the same crypto as the macOS app, but it links the shared TypeScript code in
[`packages/shared-wire`](../packages/shared-wire) instead of the Swift
`MunkelKit` library. The trust model is unchanged: keys are derived on-device,
payloads are sealed in the main process, and the relay sees the same ciphertext
and derived identifiers. Packaging is declared in
[`apps/windows/package.json`](../apps/windows/package.json). The renderer
↔ main contract is documented in
[`apps/windows/docs/ipc-contract.md`](../apps/windows/docs/ipc-contract.md), and
the UI spec is in [`apps/windows/docs/ui-spec.md`](../apps/windows/docs/ui-spec.md).

### Processes

- **Main process** — [`main.ts`](../apps/windows/src/main/main.ts) creates the
  menu, notch, and palette windows, the tray icon
  ([`tray.ts`](../apps/windows/src/main/tray.ts)), the palette hotkey
  ([`palette-hotkey.ts`](../apps/windows/src/main/palette-hotkey.ts)), the update
  service ([`update-service.ts`](../apps/windows/src/main/update-service.ts)),
  and the control server. It holds the single `AppState`.
- **Session layer** — [`session-store.ts`](../apps/windows/src/main/session-store.ts)
  (`AppState`) keeps one [`GroupSession`](../apps/windows/src/main/group-session.ts)
  per joined circle. A session seals and opens payloads and holds one
  [`RelayClient`](../apps/windows/src/main/relay-client.ts), a reconnecting
  WebSocket client.
- **Preload** — [`preload.ts`](../apps/windows/src/main/preload.ts) exposes a
  typed allowlist as `window.electronAPI`; renderers never receive `ipcRenderer`.
- **Renderer** — a React app routed by URL hash in
  [`App.tsx`](../apps/windows/src/renderer/App.tsx): `#/menu`, `#/notch`, and
  `#/palette`. Shared state lives in
  [`app-store.tsx`](../apps/windows/src/renderer/store/app-store.tsx).
- **Control server** — [`control-handlers.ts`](../apps/windows/src/main/control-handlers.ts)
  answers the `munkel` CLI over a named pipe. `main.ts` starts the server with a
  random per-launch pipe name from `generatePipeName` and writes it to the
  control-pipe file via `writeControlPipeName`
  ([`control.ts`](../packages/shared-wire/src/control.ts)). The fixed-name form
  `\\.\pipe\Munkel-<user>-Control` shown in the IPC contract comes from
  `buildPipeName`, which `main.ts` does not call.

### IPC boundary

- Channel names are defined once in
  [`ipc-channels.ts`](../apps/windows/src/shared/ipc-channels.ts). Every invoke
  and push channel, its sender guard, and its payload are listed in
  [`ipc-contract.md`](../apps/windows/docs/ipc-contract.md).
- Privileged handlers check the sender window, for example
  `set-last-palette-target` accepts only the palette window
  ([`main.ts`](../apps/windows/src/main/main.ts)).
- Raw `messageKey` values and the GitHub access token never cross IPC (see the
  security notes in the IPC contract).

### Notch lifecycle

- An incoming message reaches the notch through `showNotchMessage` in
  [`main.ts`](../apps/windows/src/main/main.ts), which updates and shows the notch
  window and pushes `notch-message` to it. Private own echoes are the exception
  (see [Own messages](#own-messages-dev-only-echo)).
- Messages are flagged `silent` while the local user is not Online (Do Not
  Disturb or Away). A silent message skips the full phase: the renderer goes
  straight to `peek` and retracts after 30 s
  ([`useNotchLifecycle.ts`](../apps/windows/src/renderer/lib/useNotchLifecycle.ts)).
- Otherwise the display phase comes from local receive time in
  [`notch-phase.ts`](../apps/windows/src/renderer/lib/notch-phase.ts): full for
  5 s, peek until 35 s, then retracted.
- History is kept in renderer memory by
  [`useNotchLifecycle.ts`](../apps/windows/src/renderer/lib/useNotchLifecycle.ts).
  Entries older than 60 s (`NOTCH_HISTORY_MS`, measured from `receivedAt`) are
  pruned by [`prune-notch-history.ts`](../apps/windows/src/renderer/lib/prune-notch-history.ts).
- Ordering is newest-first by `(min(sentAt, receivedAt), receivedAt)` in
  [`notch-order.ts`](../apps/windows/src/renderer/lib/notch-order.ts). An
  unparseable `sentAt` uses `receivedAt` as its sort key, so such a message sorts
  by arrival time and, as the latest arrival, lands at the top.
- Reply draft: while a reply is open, an incoming message keeps the draft and
  does not collapse the field (`onNotchMessage` in `useNotchLifecycle.ts`
  collapses only when `replyingTo === null`). Without an open reply,
  [`NotchWidget.tsx`](../apps/windows/src/renderer/components/NotchWidget.tsx)
  clears the reply text on an incoming message.

### Palette and last target

- The palette is shown through `showPalette`
  ([`palette-window.ts`](../apps/windows/src/main/palette-window.ts)), which
  pushes `palette-show` so the renderer re-resolves the pre-selected recipient.
- Each navigation calls `rememberRecipient` in
  [`PaletteWindow.tsx`](../apps/windows/src/renderer/components/PaletteWindow.tsx),
  which invokes `set-last-palette-target`. The target is saved even without a
  send. The "Everyone" row is stored as `member: null`.
- The start index comes from
  [`resolve-palette-start-index.ts`](../apps/windows/src/renderer/lib/resolve-palette-start-index.ts):
  exact channel and member match first, then the first row of the same channel,
  then index 0.
- Storage: `lastPaletteChannel` and `lastPaletteMember` in `state.json`
  ([`identity-store.ts`](../apps/windows/src/main/identity-store.ts)).

### Own messages (dev-only echo)

On macOS the sender always surfaces its own message locally (see
[Sending a message](#sending-a-message)). On Windows this is gated, and the
behavior differs:

- The echo is dev-only. The build flag is `isDev = !app.isPackaged`
  ([`main.ts`](../apps/windows/src/main/main.ts)). The effective value is
  `isDev && persisted devEchoBroadcasts`, and the persisted default is `false`
  ([`session-store.ts`](../apps/windows/src/main/session-store.ts),
  [`identity-store.ts`](../apps/windows/src/main/identity-store.ts)). A release
  build therefore never echoes, even if `state.json` says `true`. The toggle is
  menu-only (`set-dev-echo-broadcasts`).
- In a dev build with the echo on, every successful send from any surface (notch,
  menu, palette, or CLI) is dispatched as a message with `isOwn: true` through
  `onNotch` in [`group-session.ts`](../apps/windows/src/main/group-session.ts).
  - Direct echo: `main.ts` pushes it to the hidden notch window without calling
    `showNotch`, and the renderer appends it to history
    (`appendOwnMessage` in `useNotchLifecycle.ts`). A direct send from the menu,
    palette, or CLI therefore gets a notch history entry in a dev build.
  - Broadcast echo: `main.ts` calls `showNotch`, which makes the window visible
    (`showInactive` and `NOTCH_SHOW`). The renderer then discards the echo in
    `onNotchMessage` without a phase change or a history entry. The notch opens
    with no new content, in its current phase. The `NOTCH_UPDATE` listener also
    sets the reply target to broadcast (`setReplyPrivate(data.isDirect)` in
    [`NotchWidget.tsx`](../apps/windows/src/renderer/components/NotchWidget.tsx)).
- Only the notch reply field appends its own sent message itself, and only when
  the send result is not `echoed`
  ([`NotchWidget.tsx`](../apps/windows/src/renderer/components/NotchWidget.tsx)).
  In a release build this means replies typed in the notch appear in history,
  both broadcast and direct. In a release build, menu, palette, and CLI sends
  leave no notch entry, because nothing echoes them. In a dev build, broadcasts
  from those surfaces still leave no entry, because the broadcast echo is
  discarded.
- macOS behavior is unchanged by this section.

### Persistence

- Main-process state is one JSON file, `state.json`, in `%APPDATA%\munkel`
  (the userData path is pinned in [`main.ts`](../apps/windows/src/main/main.ts)).
  [`identity-store.ts`](../apps/windows/src/main/identity-store.ts) reads and
  writes it. It holds the member ID, display name, avatar, GitHub login name,
  presence status, circles (code, relay URL, join time), settings, and the last
  palette target.
- Circle codes are stored in plaintext in `state.json` (`circles[].code`). The
  Windows source does not use `safeStorage`, so the channel code, which is the
  only credential, is not encrypted at rest. Node applies only the read-only bit
  on Windows, so confidentiality relies on the user-profile ACL.
- Message text and notch history are not written to disk.
- Documented exception: clipboard images pasted in the palette or menu are written
  as plaintext PNG temp files into a private per-instance directory
  (`munkel-clipboard-dir-XXXXXX` under the system temp directory, `mkdtemp`;
  [`clipboard-image-save.ts`](../apps/windows/src/main/clipboard-image-save.ts),
  `createClipboardTempDir` and `saveClipboardImageToTemp`). The 0o700/0o600 modes
  have no effect on Windows, so the directory is not an access boundary there;
  it only keeps the files out of the shared temp root. Files stay if a send
  fails (retry). They are deleted after a successful send, at app quit
  (`will-quit` hook in [`session-handlers.ts`](../apps/windows/src/main/session-handlers.ts),
  `removeOwnedClipboardTempFilesSync`), and leftovers older than one hour from
  crashed sessions are swept at the next startup (`sweepClipboardTempFiles`; see
  the `save-clipboard-image` row in
  [`ipc-contract.md`](../apps/windows/docs/ipc-contract.md)).

### Relay and crypto

- Protocol, normalization, sealing, payload encoding, control, and transport
  code live in [`packages/shared-wire`](../packages/shared-wire). The Windows
  [`core/index.ts`](../apps/windows/src/core/index.ts) re-exports them and adds
  avatar, image codec, and blob helpers
  ([`blob-upload.ts`](../apps/windows/src/core/blob-upload.ts),
  [`blob-download.ts`](../apps/windows/src/core/blob-download.ts)).
- `GroupSession` seals with the message key and checks the sealed size before
  sending (`assertPayloadFits`).
- The default relay is `wss://relay.munkel.app`. It can be overridden with
  `MUNKEL_RELAY_URL` and per circle through `relayUrl`
  ([`session-store.ts`](../apps/windows/src/main/session-store.ts)).
- Swift–TypeScript interop is tested in
  [`swift-interop.test.ts`](../apps/windows/src/core/__tests__/swift-interop.test.ts).

### Capture exclusion and presence

- Menu, notch, and palette windows share one content-protection setting, applied
  through [`content-protection.ts`](../apps/windows/src/main/content-protection.ts).
  Windows has no `.readOnly` equivalent of the macOS DEBUG path, as the IPC
  contract notes.
- Away is set after 5 minutes without input, polled every 30 s
  ([`presence-monitor.ts`](../apps/windows/src/main/presence-monitor.ts)).

## Identity, keys, and groups

There are no accounts. Everything derives on-device from the human-readable
channel code, which never leaves the client. Derivation is pinned identically in
Swift ([`GroupKey.swift`](../apps/macos/Sources/MunkelKit/GroupKey.swift)) and
documented in [`protocol.ts`](../apps/server/src/protocol.ts):

1. **Normalize** the code: Unicode NFC, trim, lowercase.
2. **`groupId`** = `hex(HKDF-SHA256(ikm = utf8(code), salt = "munkel-v1",
   info = "group-id", 16 bytes))` → a 32-hex-char, 128-bit identifier. This is
   the only thing the relay ever sees for a channel.
3. **`messageKey`** = `HKDF-SHA256(ikm = utf8(code), salt = "munkel-v1",
   info = "message-key", 32 bytes)` → the AES-256-GCM key.

HKDF-SHA256 → AES-256-GCM was chosen for clean CryptoKit ↔ WebCrypto interop;
the Swift/TS cross-implementation is exercised by
[`apps/server/scripts/dev-send.ts`](../apps/server/scripts/dev-send.ts), an
independent TypeScript reference sender. `memberId` is a client-generated UUID,
stable per installation
([`Identity.swift`](../apps/macos/Sources/MunkelApp/Identity.swift)).

## End-to-end data flow

### Sending a message

1. The app builds an `AppPayload` (`chat`, `profile`, or `image`) and
   JSON-encodes it
   ([`AppPayload.swift`](../apps/macos/Sources/MunkelKit/AppPayload.swift)).
2. It seals the JSON with `messageKey`:
   `payload = base64(nonce[12] ‖ ciphertext ‖ tag[16])`, random 12-byte nonce,
   empty AAD ([`MessageCrypto.swift`](../apps/macos/Sources/MunkelKit/MessageCrypto.swift)).
3. It sends a `{"type":"send", payload, to?}` frame over the channel's WebSocket
   (`GET /ws?group=<32-hex>&member=<uuid>`). With `to` set to a `memberId` the
   relay delivers to that member only; without it the relay broadcasts to the
   rest of the group
   ([`RelayClient.swift`](../apps/macos/Sources/MunkelKit/RelayClient.swift),
   [`GroupSession`](../apps/macos/Sources/MunkelApp/GroupSession.swift)).
4. The `GroupRoom` Durable Object validates the frame against the Zod schema and
   relays the opaque `payload` to the target(s) as a `{"type":"message", from,
   to?, payload}` frame — never echoing it back to the sender and never storing
   it ([`group-room.ts`](../apps/server/src/group-room.ts)).

For images, the full-resolution AVIF is sealed and `PUT` to R2 *before* the
relay frame goes out; the relayed `image` payload carries only a tiny inline
AVIF thumbnail plus an `r2Key` pointer per image (see
[`GroupSession.sendImages`](../apps/macos/Sources/MunkelApp/GroupSession.swift)
and [`blob.ts`](../apps/server/src/blob.ts)).

On macOS the sender also surfaces its own message locally: `AppModel.send` shows it in
the sender's own notch, with the lock for a direct message (`to` set), so you
see what you sent. The relay still never echoes (point 4), this is a purely
local render. On Windows the echo is dev-only and works differently; see [Own messages](#own-messages-dev-only-echo).

### Receiving a message

1. On connect the relay sends a `welcome` frame listing the other members
   currently online; `peer-joined` / `peer-left` track presence thereafter.
2. An incoming `message` frame's `payload` is opened with `messageKey`. A
   payload that fails to decrypt or decode is dropped, not surfaced.
3. The decoded `AppPayload` is dispatched: `chat` text and `image` albums are
   shown in the notch via `NotchPanel` / `NotchPresenter`; `profile` payloads
   update the sender's display name and presence status locally, and the avatar
   is fetched from the sender's GitHub avatar URL directly (not via the relay).
   When
   the local user's own status is Do Not Disturb or Away, the proactive notch
   preview is suppressed and the message lands silently in the 60 s history.
   Full-resolution images are fetched and decrypted from R2 lazily, on demand,
   keyed by `r2Key`.
4. Messages live only in memory and only for the notch-survival window
   (~60 s); there is no history and nothing is written to disk. See
   [`GroupSession.handleIncoming`](../apps/macos/Sources/MunkelApp/GroupSession.swift).

Ephemerality is enforced by the relay's design (no Durable Object storage of
messages, no message buffer) rather than by a retention policy: an offline
member simply never receives a message.

## Wire protocol v1

The protocol is specified where it is enforced:
[`apps/server/src/protocol.ts`](../apps/server/src/protocol.ts) is the
**authoritative source**. Swift mirrors it in
[`WireMessage.swift`](../apps/macos/Sources/MunkelKit/WireMessage.swift); the
TypeScript reference sender is
[`dev-send.ts`](../apps/server/scripts/dev-send.ts). Summary:

- **Transport.** WebSocket (WSS in production), JSON text frames. A connection
  *is* a group membership — there is no hello/join/leave handshake; presence
  derives from live connections. Reconnecting with the same `memberId` silently
  replaces the old connection.
- **Connect.** `GET /ws?group=<32-hex>&member=<uuid>`. `group` must match
  `GROUP_ID_REGEX`; `member` must match `MEMBER_ID_REGEX`.
- **Client → server frames.** `{"type":"send", payload, to?}` and
  `{"type":"ping"}`.
- **Server → client frames.** `welcome` (with the online member list),
  `peer-joined`, `peer-left`, `message` (`from`, optional `to`, `payload`),
  `pong`, and `error` (`invalid-message` | `unknown-recipient`).
- **Limits.** 64 KiB per WebSocket frame; `MAX_PAYLOAD_CHARS` = 48 KiB of
  base64 ciphertext per payload; 32 connections per group. Clients ping
  every ≤60 s (the macOS client every 30 s); the server answers `pong` and
  closes connections idle for more than 120 s.
- **Application payloads** (inside the encrypted blob, invisible to the relay):
  a `kind`-discriminated JSON object — `chat` (`text`, `sentAt`), `profile`
  (`displayName`, optional `avatarURL` that peers fetch from GitHub directly —
  not via the relay, optional `status` of
  `online` | `dnd` | `away`), `presence` (`status` only — a lightweight delta
  sent when a member's status changes, so a flip needn't re-send the avatar),
  or `image` (1–8 `items`, shared `caption`, `sentAt`; each item is an `r2Key`
  pointer plus an inline AVIF `thumb`). See
  [`AppPayload.swift`](../apps/macos/Sources/MunkelKit/AppPayload.swift).

### Image blobs (R2)

Full-resolution images never fit a 48 KiB relay frame, so they travel
out-of-band over HTTP on the relay's own origin
(`http(s)://host/blob/<group>/<key>`):

- `PUT /blob/:group/:key` — store opaque ciphertext. Bounded to `MAX_BLOB_BYTES`
  (3 MiB) per object. The only access control is knowing the unguessable
  `groupId` *and* the random per-image `key`.
- `GET /blob/:group/:key` — serve the ciphertext, or `404` (and delete) once it
  is past `BLOB_TTL_MS` (~66 s).
- A per-minute cron runs `sweepExpiredBlobs` to physically delete blobs that
  were never fetched.

Clients seal with `messageKey` before upload, so R2 only ever holds ciphertext.
See [`blob.ts`](../apps/server/src/blob.ts) and
[`BlobClient.swift`](../apps/macos/Sources/MunkelKit/BlobClient.swift).

## CLI ↔ app control socket

The CLI talks to the running app over a Unix domain socket at
`~/Library/Application Support/Munkel/control.sock` (the `Munkel Dev` directory
for debug builds), using **newline-delimited JSON**, one request/response per
connection. The contract is
[`ControlProtocol.swift`](../apps/macos/Sources/MunkelKit/ControlProtocol.swift),
mirrored in [`apps/cli/src/munkel.ts`](../apps/cli/src/munkel.ts); the server is
[`ControlServer.swift`](../apps/macos/Sources/MunkelApp/ControlServer.swift),
dispatched by
[`AppModel.handleControl`](../apps/macos/Sources/MunkelApp/AppModel.swift):

- `ControlRequest`: `action`, optional `group`, `to`, `text`, and `imagePaths`
  (absolute paths to images to send as one album — the app reads, encodes,
  seals, and uploads them, so image bytes never cross the socket or argv).
- `ControlResponse`: `ok`, optional `error`, optional `groups`
  (`code` / `connected` / `members`).

The app resolves channel-code prefixes and recipient display names (or `memberId`
prefixes) before sending, which is what makes the one-call `munkel dm <name>`
path and agent skills possible. The socket path can be overridden with
`MUNKEL_SOCKET` (used by the tests). The CLI is **send-only** by design; it can
list channels and send, but cannot read message history (there is none).

## Capture-proof UI surfaces

Every window that shows message content or a channel code is excluded from screen
capture by setting `NSWindow.sharingType` (`.none` in release builds), applied
by the `CaptureExclusion` view in the same SwiftUI update pass that mounts the
content. This makes those surfaces invisible in Teams/Zoom shares and
screenshots while remaining visible on the physical display. The exclusion
covers the notch panel
([`NotchPanelWindow`](../apps/macos/Sources/MunkelApp/NotchPanel/NotchPanelWindow.swift),
[`NotchPresenter`](../apps/macos/Sources/MunkelApp/NotchPresenter.swift)), the
menu popover
([`MenuView`](../apps/macos/Sources/MunkelApp/MenuView.swift)), the command
palette
([`CommandPalettePanel`](../apps/macos/Sources/MunkelApp/CommandPalettePanel.swift)),
the GitHub auth-code notch
([`AuthCodeNotchView`](../apps/macos/Sources/MunkelApp/AuthCodeNotchView.swift)),
and the image preview overlay
([`ImagePreviewOverlay`](../apps/macos/Sources/MunkelApp/ImagePreviewOverlay.swift)).

Honest limits, documented in
[`CaptureExclusion.swift`](../apps/macos/Sources/MunkelApp/CaptureExclusion.swift):
the exclusion reliably hides the window from the legacy CoreGraphics path
(system screenshot tools, older recorders) and from ScreenCaptureKit on
macOS ≤ 15.3, but on macOS 15.4+ ScreenCaptureKit *full-display* capture can
ignore `sharingType = .none`. It is therefore best-effort against modern SCK
display recorders. A corollary the code enforces: notch content uses no
`.help()` tooltips, because AppKit draws tooltips in a separate window that
cannot inherit the exclusion. A DEBUG-only "Allow in screenshots" toggle switches
these surfaces to `.readOnly` so the notch can be captured for docs; release
builds have no such path.

## Trust boundaries

The channel code is the only credential. It never leaves the client, and the
relay cannot derive the `messageKey` from anything it sees.

**What the relay can see:** the derived `groupId` (a random-looking 128-bit
hash), `memberId` UUIDs, message sizes, and timing. For blobs it additionally
sees ciphertext size and the `groupId`/`key` pair used to address an object.

**What the relay cannot see:** the channel code, the message key, message
content, display names, avatars, image bytes (all ciphertext), or which human a
`memberId` belongs to. Joining requires no server round-trip — knowing the code
is knowing the group — so unguessable 128-bit group IDs are the only access
control in v1.

Honest non-goals and limitations (see also
[`README.md`](../README.md#security-model),
[`SECURITY.md`](../SECURITY.md), and
[`PRIVACY.md`](../PRIVACY.md)):

- **Generated channel codes are convenience-grade shared secrets**, optimized
  for being spoken at a table. Any current member with the code shares the same
  message key.
- **Direct messages are relay-targeted in v1, not pairwise-encrypted.** Pairwise
  keys are deferred to v2.
- **GitHub login is display identity only.** It runs the OAuth device flow with
  empty scope, fetches `GET /user` once, downloads the avatar, and discards the
  token; the imported name/avatar are self-asserted, with no cryptographic proof
  that a member controls the GitHub account, and travel to peers only inside the
  E2E-encrypted `profile` payload.

Munkel is designed for lightweight, ephemeral messages, not high-risk secret
sharing.

## Deployment topology

- **Relay** (`apps/server`) → Cloudflare Worker `munkel-relay` + the `GroupRoom`
  Durable Object + the `munkel-blobs` R2 bucket + the per-minute cron, all
  declared in [`apps/server/wrangler.toml`](../apps/server/wrangler.toml).
  Custom domain **`relay.munkel.app`**. The R2 bucket must be created once
  before the first deploy that includes the binding
  (`wrangler r2 bucket create munkel-blobs`); see
  [`README.md`](../README.md#development).
- **Landing** (`apps/landing`) → Cloudflare Worker `munkel`, custom domains
  **`munkel.app`** / **`www.munkel.app`**, configured in
  [`apps/landing/wrangler.jsonc`](../apps/landing/wrangler.jsonc).
- **macOS app + CLI** → distributed as a signed, notarized DMG and via the
  Homebrew cask `limehq/tap/munkel`. Sparkle delivers signed (EdDSA) auto-updates
  with the appcast at `munkel.app/appcast.xml`.

Both Cloudflare Workers deploy automatically from GitHub Actions on pushes to
`main` that touch their paths
([`deploy-server.yml`](../.github/workflows/deploy-server.yml),
[`deploy-landing.yml`](../.github/workflows/deploy-landing.yml)),
authenticating with the `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`
secrets (the `limehq` account); the R2 binding, the cron trigger, and the custom
domains all apply from the wrangler config on deploy. The app release pipeline
is [`release.yml`](../.github/workflows/release.yml), driven by Release Please
([`release-please.yml`](../.github/workflows/release-please.yml)). Quality gates
run in [`ci.yml`](../.github/workflows/ci.yml),
[`codeql.yml`](../.github/workflows/codeql.yml),
[`codeql-swift.yml`](../.github/workflows/codeql-swift.yml), and
[`scorecard.yml`](../.github/workflows/scorecard.yml). All workflows run on
GitHub-hosted runners. See [`RELEASING.md`](../RELEASING.md) for the release
process.

## Related documents

- [`README.md`](../README.md) — overview, install, components.
- [`SECURITY.md`](../SECURITY.md) — security model and vulnerability reporting.
- [`PRIVACY.md`](../PRIVACY.md) — what data exists and for how long.
- [`docs/ACCESSIBILITY.md`](ACCESSIBILITY.md) — accessibility of the macOS UI.
- [`docs/INTERNATIONALIZATION.md`](INTERNATIONALIZATION.md) — i18n status.
- [`RELEASING.md`](../RELEASING.md) — release and deploy process.
