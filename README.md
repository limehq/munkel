# Flüsterung

Ephemeral messages between friends at the same café table — or across the
world — that slide elegantly out of the MacBook notch.

No accounts, no history, no server-side knowledge: a group is born from a
shared human-readable code (`kaffee-falke-42`), which doubles as the
end-to-end encryption key. The relay only routes opaque blobs.

## Components

| Path | Tech | Status |
|---|---|---|
| `notch-poc/` | Swift, SwiftUI, [DynamicNotchKit](https://github.com/MrKai77/DynamicNotchKit) | ✅ working PoC |
| `PROTOCOL.md` | Wire protocol v1 (WebSocket + JSON, E2E AES-256-GCM) | ✅ v1 |
| `server/` | Cloudflare Workers + **Durable Objects** (Hono + partyserver, TypeScript) | ✅ implemented, 18 tests green |
| `app/` | Swift menu-bar app (holds the relay connection, renders the notch) | planned |
| `cli/` | Swift `fluester` CLI (talks to the app via Unix domain socket) | planned |
| MCP server | thin wrapper around the CLI/socket | planned |

## Architecture decisions

- **Server-first transport**: one WebSocket relay path for café and remote —
  no flaky local P2P, seamless everywhere.
- **One Durable Object per group** (`idFromName(groupId)`), WebSocket
  Hibernation API, no DO storage → ephemerality is enforced by design.
- **Notch is read-only**: show sender avatar + message, allow copy. No reply
  UI — that's deliberate product scope, not a TODO.
- **UI/UX first**: the notch presentation is the product. PoC before plumbing.

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

Connect with `GET /ws?group=<32-hex>&member=<uuid>` — see `PROTOCOL.md`.
