# Munkel

Ephemeral messages between friends at the same café table — or across the
world — that slide elegantly out of the MacBook notch.

No accounts, no history, no server-side knowledge: a group is born from a
shared human-readable code (`kaffee-falke-42`), which doubles as the
end-to-end encryption key. The relay only routes opaque blobs.

Website: **[munkel.app](https://munkel.app)**

## Components

| Path | Tech | Status |
|---|---|---|
| `notch-poc/` | Swift, SwiftUI, [DynamicNotchKit](https://github.com/MrKai77/DynamicNotchKit) | ✅ working PoC |
| `PROTOCOL.md` | Wire protocol v1 (WebSocket + JSON, E2E AES-256-GCM) | ✅ v1 |
| `server/` | Cloudflare Workers + **Durable Objects** (Hono + partyserver, TypeScript) | ✅ implemented, 18 tests green |
| `app/` | Swift menu-bar app: `MunkelKit` (crypto, protocol, relay client, GitHub login) + MenuBarExtra UI + notch display | ✅ working, 39 Kit tests green |
| `cli/` | `munkel` CLI (Bun/TypeScript, talks to the app via Unix domain socket) | ✅ working |
| `landing/` | Landing page: TanStack Start (React) on Cloudflare Workers, [munkel.app](https://munkel.app) | ✅ deployed |
| MCP server | thin wrapper around the CLI/socket | planned |

Production relay: **wss://relay.munkel.app** (the app's default).

## Architecture decisions

- **Server-first transport**: one WebSocket relay path for café and remote —
  no flaky local P2P, seamless everywhere.
- **One Durable Object per group** (`idFromName(groupId)`), WebSocket
  Hibernation API, no DO storage → ephemerality is enforced by design.
- **Notch is read-only**: show sender avatar + message, allow copy. No reply
  UI — that's deliberate product scope, not a TODO.
- **UI/UX first**: the notch presentation is the product. PoC before plumbing.
- **Capture-proof surfaces**: every window showing message content or circle
  codes (notch panel, menu popover) is excluded from screen capture
  (`NSWindow.sharingType = .none`, applied frame-exactly by the
  `CaptureExclusion` view) — invisible in Teams/Zoom shares and screenshots,
  visible on the physical display. Corollary: no `.help()` tooltips in notch
  content, since tooltips get their own capturable window.

## Notch PoC

```sh
cd notch-poc
swift run notch-poc
```

A demo message appears in the notch right after launch. Then, in the
terminal:

- `⏎` — show the next demo message
- `Name: Text` — show a custom message
- `q ⏎` — quit

Hovering the notch keeps the message open (haptic feedback included); the
copy button puts the message text on the clipboard. On Macs without a notch,
DynamicNotchKit falls back to a floating panel automatically.

## Relay server

Cloudflare Worker (Hono router) + one Durable Object per group
([partyserver](https://github.com/cloudflare/partyserver) with WebSocket
hibernation). Modeled after the conventions in `wokkytokky/apps/server`.

```sh
cd server
bun install
bun run dev        # wrangler dev on :8787
bun run test       # unit + e2e (spawns a real wrangler dev)
bun run deploy     # wrangler deploy
```

The Worker is named `munkel-relay` and is reachable both as
`munkel-relay.limehq.workers.dev` and via the custom domain
**relay.munkel.app** (attached automatically on deploy through the
`routes` entry in `wrangler.toml`).

Connect with `GET /ws?group=<32-hex>&member=<uuid>` — see `PROTOCOL.md`.

## Landing page

`landing/` is a [TanStack Start](https://tanstack.com/start) (React +
Tailwind v4) app served by a Cloudflare Worker with SSR — scaffolded with
`npm create cloudflare@latest -- landing --framework=tanstack-start`.

```sh
cd landing
npm install
npm run dev        # vite dev server on :3000
npm run build      # vite build (client + ssr into dist/)
npm run deploy     # build + wrangler deploy
```

Deployment is plain `wrangler deploy`: the Worker is named `munkel` and the
custom domains **munkel.app** and **www.munkel.app** are declared as
`routes` with `custom_domain: true` in `landing/wrangler.jsonc`, so Cloudflare
creates/updates the DNS records of the `munkel.app` zone automatically on
every deploy — no manual DNS steps. Deploying requires a `wrangler login`
with access to the `limehq` account.

## macOS app

```sh
cd app
swift test            # MunkelKit unit tests (crypto, protocol, payloads)
./make-bundle.sh      # build .build/Munkel.app (LSUIElement bundle)
open .build/Munkel.app
```

Menu bar icon → create or join a group, set your display name, send to the
group or a single member. Incoming messages appear in the notch.
Settings live under the `dev.uq.munkel` defaults domain; the relay URL
defaults to the deployed Worker (override with `ws://127.0.0.1:8787` for
local development against `wrangler dev`).

### Login with GitHub

"Mit GitHub anmelden" in the menu imports your GitHub username and avatar as
your identity — still no account: the app runs the [OAuth device
flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow)
(user code is auto-copied, browser opens), requests a token with **empty
scope**, fetches `GET /user` once, downloads the avatar, and **discards the
token**. Stored locally: login name + a ≤20 KiB JPEG. The avatar travels to
peers only inside the E2E-encrypted `profile` payload — receivers never
contact GitHub, and the relay sees nothing.

Honest limits: GitHub itself sees the login happen and keeps the
authorization listed under Settings → Applications; and the imported profile
is *display-only* — peers get no cryptographic proof that a member really
owns the GitHub name they show (profiles are self-asserted, same as typed
names).

The OAuth app lives in the `limehq` org ("Munkel", device flow enabled,
no client secret — none is needed). To point a build at a different OAuth
app: create one, tick **Enable Device Flow**, then either edit
`GitHubConfig.defaultClientID` or run
`defaults write dev.uq.munkel githubClientID <CLIENT_ID>`.

## munkel CLI

```sh
cd cli
bun install
bun test                            # CLI tests against a fake app socket
bun run build                       # compile to dist/munkel (standalone binary)
cp dist/munkel ~/.local/bin/

munkel groups                       # ● yolbe  —  Anna, Ben
munkel yolbe Jurij hey              # direct message, recipient by display name
munkel yolbe all "Kaffee, jemand?"  # group broadcast
```

The CLI is a thin client: it talks to the running app over
`~/Library/Application Support/Munkel/control.sock` (newline-delimited
JSON; see `ControlProtocol.swift`, mirrored in `cli/src/munkel.ts`). The
socket path can be overridden via `MUNKEL_SOCKET` (used by the tests). The
app resolves group-code prefixes and recipient display names, and owns all
crypto and relay connections — ideal substrate for an MCP server.

### Testing without a second Mac

`server/scripts/dev-send.ts` acts as a second group member — it implements
the full PROTOCOL.md derivation + AES-GCM encryption in TypeScript, so a
message it sends arriving in the notch also proves Swift↔TS crypto interop
(the derivation is additionally pinned in `CryptoTests.swift`):

```sh
cd server
bun run dev                                        # relay
bun scripts/dev-send.ts kaffee-falke-42 Anna "Kaffee?"
```
