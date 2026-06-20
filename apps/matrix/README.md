# @munkel/matrix

Munkel's circles, members and messages mapped onto a real Matrix homeserver via
[`matrix-js-sdk`](https://github.com/matrix-org/matrix-js-sdk). The gateway
(`@munkel/matrix-gateway`) consumes the `MunkelMatrixSession` facade; everything
else is exported for tests and for a future native (matrix-rust-sdk-in-app) port.

**Runs on Node 24**, not Bun — `initRustCrypto()` loads the
`@matrix-org/matrix-sdk-crypto-wasm` artifact, which is verified under Node.

## Modules

| File | Responsibility |
|---|---|
| `provision.ts` | Deterministic, invisible account provisioning (shared-secret register + login) from a per-install `memberId`. |
| `room.ts` | Circle → room alias; race-safe create-or-join; membership = presence. Rooms use **public join rules + private directory visibility** so the unguessable `groupId` alias is the only access control (join-by-code, no invite). |
| `crypto.ts` | `initRustCrypto` + Megolm; share keys to all joined devices; reliable decrypt. |
| `media.ts` | Image blobs over Matrix media (already-sealed ciphertext); a gateway-scoped `(group,key)→mxc` index so any member can fetch what another stored. |
| `mapping.ts` | Munkel blob ↔ `m.room.message` (custom msgtype `app.munkel.blob`); the one-way `MXID→memberId` registry. |
| `client.ts` | `MunkelMatrixSession` — one `(groupId, memberId)` pairing; emits `welcome`/`peer-joined`/`peer-left`/`message`. |

## Test

Needs a live homeserver (`bun run matrix:up`). Excluded from the default
`bun test`/turbo because it requires Synapse + Node:

```bash
bun run matrix:test           # or, just this package:
cd apps/matrix && node --test test/integration.test.ts
```
