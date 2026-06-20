# Munkel on Matrix — proof-of-concept spike

> Branch `spike/matrix-backend`. Tracks **issue #89**, which evaluated Matrix as
> Munkel's backend and recommended *against* it. This spike does the opposite on
> purpose: it makes Matrix **actually work** as the backend, using Matrix best
> practices, and bends Munkel's philosophy wherever the two collide. The point is
> to find out, empirically, what it costs and what it buys — not to ship it.
>
> **Result: it works.** Munkel's exact wire protocol runs over a real, encrypted,
> self-hosted Matrix homeserver — proven with synthetic clients speaking the
> byte-identical protocol — so the unchanged app/CLI need only `MUNKEL_RELAY_URL`
> and no code changes. See the trade-offs in
> [`docs/adr/0001-matrix-backend-spike.md`](docs/adr/0001-matrix-backend-spike.md).

## What this proves

The bespoke relay (one Cloudflare Durable Object per circle, routing opaque
ciphertext between live WebSocket connections, storing nothing) is replaced by:

```
  Munkel app / CLI ──ws──▶  @munkel/matrix-gateway  ──Matrix C-S API──▶  Synapse
  (UNCHANGED, via              (speaks Munkel's exact          (self-hosted,
   MUNKEL_RELAY_URL)            relay protocol; one             closed island,
                               Matrix session per ws)          Megolm E2E)
```

- **No client change.** The macOS app already honours `MUNKEL_RELAY_URL`
  (`apps/macos/.../AppModel.swift`); point it at the gateway and it speaks to
  Matrix unchanged. The gateway also serves the same-origin `/blob/<group>/<key>`
  endpoints the app derives from the relay origin, so images work too. *(This spike
  proves the wire contract with synthetic clients speaking the byte-identical
  protocol — imported from the same `protocol.ts`. Driving the GUI app end-to-end
  is a documented manual step, not run here.)*
- **Real Matrix, real Megolm.** Each circle is a Matrix room reachable by an alias
  derived from the 32-hex `groupId`; each install is an invisible, auto-provisioned
  Matrix user; messages are Megolm-encrypted (`m.room.encrypted` on the wire).
- **Munkel's blind-server guarantee survives.** Munkel's own code-derived AES-GCM
  blob is kept *inside* the Megolm payload, so the gateway — which terminates
  Megolm — still only ever holds the inner ciphertext, never plaintext and never
  the circle code.

## Layout

| Path | What |
|---|---|
| `infra/matrix/` | Closed dev Synapse (docker compose) + up/down/register scripts. [README](infra/matrix/README.md) |
| `apps/matrix/` | `@munkel/matrix` — the real matrix-js-sdk client: provisioning, rooms, crypto, media, mapping, the `MunkelMatrixSession` facade. [README](apps/matrix/README.md) |
| `apps/matrix-gateway/` | `@munkel/matrix-gateway` — WS server bridging Munkel's protocol to Matrix. [README](apps/matrix-gateway/README.md) |
| `docs/adr/0001-matrix-backend-spike.md` | The decision record + full philosophy reconciliation. |

## Run it

Requires Docker, Node 24, Bun. The Matrix client + gateway run on **Node** (the
rust-crypto WASM is verified there, not under Bun); Bun stays the package manager.

```bash
bun install
bun run matrix:up            # bring up the closed dev Synapse on :8008
bun run matrix:test          # both live test suites (the proof)
bun run matrix:gateway       # start the gateway on ws://localhost:8787
# then, in another shell, drive the UNCHANGED app/CLI:
MUNKEL_RELAY_URL=ws://localhost:8787 open -b dev.uq.munkel      # the menu-bar app
MUNKEL_RELAY_URL=ws://localhost:8787 bun apps/cli/src/munkel.ts circles
bun run matrix:down          # stop (add `--wipe` to reset the homeserver)
```

## Status

Proven green against a live homeserver (`bun run matrix:test`):

- two members in one circle, joined by the code-derived alias **with no invite**;
- Megolm broadcast that decrypts for the peer (wire type `m.room.encrypted`);
- targeted direct messages with the relay's `unknown-recipient` semantics;
- an image-blob round-trip through Matrix media;
- `welcome` / `peer-joined` / `peer-left` presence;
- the gateway answering Munkel's exact frames (`welcome`/`message`/`pong`/`error`,
  `ping`, `send`, `send`+`to`) — byte-identical to the Cloudflare relay.

What the spike deliberately does **not** solve (see the ADR): true
device-to-device E2E without the gateway, serverless/zero-storage hosting, literal
zero history, and production operational cost. The honest conclusion lives in the
ADR; this branch exists to make that conclusion evidence-based.
