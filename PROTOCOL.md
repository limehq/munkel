# Flüsterung Wire Protocol (v1)

The contract between the relay server (`server/`), the macOS app, and the CLI.
The relay is intentionally dumb: it routes opaque encrypted blobs between group
members and tracks who is currently online. It stores nothing.

## Transport

- WebSocket (WSS in production), JSON text frames.
- Relay implementation: Cloudflare Worker + one **Durable Object per group**
  (`idFromName(groupId)`), using the WebSocket Hibernation API via
  [partyserver](https://github.com/cloudflare/partyserver). No DO storage is
  used — messages stay ephemeral by construction.
- **A connection IS a group membership**: clients open one WebSocket per
  joined group via `GET /ws?group=<groupId>&member=<memberId>`. There is no
  hello/join/leave handshake; presence derives from live connections.
- A new connection with the same `memberId` replaces the old one silently
  (no `peer-left`/`peer-joined` churn on reconnect).
- Limits: 64 KiB per frame, 48 KiB per payload, 32 connections per group.
- Clients send `{"type":"ping"}` every ≤60 s; the server answers `pong` and
  closes connections idle for more than 120 s.

## Identity and groups

There are no accounts. Everything derives from the human-readable **group
code** (e.g. `kaffee-falke-42`), which never leaves the clients.

Code normalization before derivation: Unicode NFC, trim, lowercase.

| Value | Derivation | Length |
|---|---|---|
| `groupId` | `HKDF-SHA256(ikm = utf8(code), salt = "fluesterung-v1", info = "group-id")`, hex-encoded | 16 bytes → 32 hex chars |
| `messageKey` | `HKDF-SHA256(ikm = utf8(code), salt = "fluesterung-v1", info = "message-key")` | 32 bytes |

The server only ever sees `groupId` — it cannot recover the code or the key.

`memberId` is a client-generated UUID, stable per installation
(`[a-zA-Z0-9_-]`, max 64 chars).

## Encryption

All payloads are end-to-end encrypted with **AES-256-GCM** under `messageKey`
(chosen over ChaChaPoly for WebCrypto/CryptoKit interop):

```
payload = base64( nonce[12] ‖ ciphertext ‖ tag[16] )
```

Random 12-byte nonce per message, empty AAD. Direct messages (`to`) use the
same group key in v1 — the server enforces targeted delivery, but pairwise
keys are deliberately deferred to v2.

## Client → Server messages

| Type | Fields | Notes |
|---|---|---|
| `send` | `payload`, `to?` | `to` (a `memberId`) makes it a direct message; omitted = group broadcast |
| `ping` | | Keepalive |

## Server → Client messages

| Type | Fields | Notes |
|---|---|---|
| `welcome` | `members` | First frame after connecting; other members currently online |
| `peer-joined` | `memberId` | |
| `peer-left` | `memberId` | Sent on disconnect (not on reconnect-replace) |
| `message` | `from`, `to?`, `payload` | Never echoed back to the sender |
| `pong` | | |
| `error` | `code`, `message` | Codes: `invalid-message`, `unknown-recipient` |

## Application payloads (inside the encrypted blob)

The relay never sees these. Decrypted plaintext is JSON:

| Kind | Fields | Notes |
|---|---|---|
| `chat` | `text`, `sentAt` (ISO-8601) | The actual message |
| `profile` | `displayName`, `avatar?` (base64 JPEG/PNG, ≤32 KiB) | Broadcast after joining and whenever a `peer-joined` arrives, so newcomers learn who everyone is |

## Guarantees and non-guarantees

- **Ephemeral by design**: the relay holds no message buffer. Offline members
  simply never receive a message. There is no history anywhere.
- **Presence is best-effort**: derived from live connections; a crashed client
  disappears after the idle timeout at the latest.
- **The server can see**: group IDs (random-looking hashes), member UUIDs,
  message sizes and timing. **It cannot see**: group codes, names, avatars,
  message content, or who a `memberId` belongs to.
- **Joining requires no server round-trip**: knowing the code is knowing the
  group. Unguessable 128-bit group IDs are the only access control in v1.
