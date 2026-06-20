# @munkel/matrix-gateway

A WebSocket server that speaks Munkel's **exact** relay protocol
(`apps/server/src/protocol.ts`, imported directly — no drift) and bridges each
connection to a `MunkelMatrixSession` from `@munkel/matrix`. This is what lets the
**unchanged** Swift app and CLI run over Matrix:

```bash
MUNKEL_RELAY_URL=ws://localhost:8787 open -b dev.uq.munkel
```

It mirrors `apps/server/src/group-room.ts` semantics: `welcome` lists the *other*
members, a `message` is never echoed to its sender, `peer-left` fires on
disconnect, `ping` → `pong` is answered locally, and `send`+`to` does
gateway-enforced targeted delivery (with the `unknown-recipient` error). It also
serves the same-origin `PUT/GET /blob/<group>/<key>` endpoints (backed by Matrix
media) that `BlobClient` derives from the relay origin, so images work too.

**Runs on Node 24** (because `@munkel/matrix` uses rust-crypto WASM).

## Run / test

```bash
bun run matrix:gateway        # start on ws://localhost:8787 (reads infra/matrix/dev.env)
bun run matrix:test           # includes this package's live e2e
cd apps/matrix-gateway && node --test test/gateway.e2e.test.ts
```

## Known PoC simplifications

- The gateway **terminates Megolm** — it holds the inner Munkel ciphertext (never
  plaintext, never the circle code) on localhost. A production build would embed
  matrix-rust-sdk in the app to remove the gateway from the E2E path.
- Presence maps to room membership, so a brief reconnect produces
  `peer-left`+`peer-joined` (the bespoke relay suppresses that on
  reconnect-replace). See the ADR.
- The `(group,key)→mxc` blob index and crypto store are in-memory: a gateway
  restart forgets blob pointers and Megolm sessions (acceptable under Munkel's
  offline-means-missed model).
