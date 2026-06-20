# ADR 0001: Matrix as Munkel's backend — proof-of-concept spike

- Status: **Proposed (proof-of-concept / spike)**
- Date: 2026-06-20
- Deciders: Lead architect (Munkel)
- Scope: A development PoC on branch `spike/matrix-backend`. **Not** a production
  hosting decision and **not** a commitment to migrate off the Cloudflare Durable
  Object relay.

## Context

Munkel is an ephemeral, accountless macOS messaging app. A circle is derived
on-device from a human code (e.g. `blue-table-42`) via HKDF-SHA256 into a 32-hex
`groupId` and a 32-byte AES-256-GCM `messageKey`; the code never leaves the
client. Transport is one WebSocket per circle to a Cloudflare Durable Object that
routes opaque base64 ciphertext between online members and stores nothing.
Clients are an unchanged Swift/SwiftUI menu-bar app (MunkelKit) and a
Bun/TypeScript CLI; both honour a `MUNKEL_RELAY_URL` override.

Issue [#89](https://github.com/) previously evaluated Matrix and landed on **"do
not adopt"**, on the grounds that Matrix mandates accounts, persists history, and
needs a stateful homeserver — all of which collide with Munkel's core promises.
We are revisiting that recommendation deliberately: the brief is to **try Matrix
using its best practices, and bend Munkel's philosophy where the two conflict**,
to find out what such a backend actually looks like and costs.

The architecture we built and verified:

- a real Matrix client package **`@munkel/matrix`** (matrix-js-sdk based);
- a thin **`@munkel/matrix-gateway`** WebSocket server that speaks Munkel's
  *exact* existing ws protocol to the clients and bridges each connection to a
  Matrix session;
- a closed dev **Synapse** in Docker (`infra/matrix/`).

The unchanged Swift app and CLI run against Matrix purely by setting
`MUNKEL_RELAY_URL=ws://localhost:8787` (the gateway).

A load-bearing discovery during design: the Swift app derives its image-blob base
URL from the **same origin** as the ws URL
(`BlobClient.baseURL(fromRelay:)` → `http(s)://host/blob/<group>/<key>`).
The gateway therefore must also expose a same-origin `/blob/<group>/<key>`
PUT/GET endpoint bridged to Matrix media, or the image feature breaks against
Matrix.

### What the live spike proved

A standalone spike against the dev homeserver verified, end to end (~2.7s):

- Synapse **v1.151.0** (`ghcr.io/element-hq/synapse`) runs closed and
  loopback-only on `http://localhost:8008`, `server_name munkel.localhost`, no
  federation, no TLS.
- **Shared-secret provisioning works**: two users auto-provisioned through the
  admin register HMAC flow (and a manual `@smoke:munkel.localhost`).
- **Join by alias with no invite**: user B joins an *encrypted* room knowing only
  the 32-hex `groupId` alias — **no invite, no out-of-band coordination**. This
  is achieved with `join_rules: public` **plus** private directory visibility
  (the room is *not* in the published directory). The 128-bit `groupId` alias is
  therefore the *only* access control, mirroring Munkel v1 exactly.
- **Megolm round-trips both directions** and decrypts; the wire event type on the
  homeserver is `m.room.encrypted` (the operator sees ciphertext, not plaintext).

## Decision

Run the unchanged Munkel clients over a real, best-practice Matrix backend via a
WS gateway, with these decisions:

1. **Homeserver.** Self-hosted `ghcr.io/element-hq/synapse:v1.151.0` (the
   maintained Element HQ image), SQLite, `SERVER_NAME=munkel.localhost`, bound to
   `127.0.0.1:8008`, plain HTTP. Closed island: no federation listener,
   `federation_domain_whitelist: []`, `trusted_key_servers: []`. **MAS/MSC3861
   left disabled** (the shared-secret password path depends on it being off).
2. **Provisioning.** Synapse **shared-secret admin register API**
   (`registration_shared_secret` + HMAC-SHA1 nonce flow), public signup off.
   Dramatically simpler than an application service for a spike; the appservice
   is documented as the production successor. The identity layer is abstracted so
   the swap does not touch app logic.
3. **Identity.** Deterministic per-install MXID, derived from `memberId`:
   `localpart = munkel_ + sha256('munkel:user:'+memberId)[:24]`,
   `password = HMAC-SHA256(PW_PEPPER, 'munkel:pw:'+memberId)`. A new install
   shared-secret-registers (which mints a device); a known install logs in with a
   **fresh, server-assigned device**. We deliberately do **not** reuse a derived
   `deviceId`: with the in-memory crypto store a session can't re-adopt a device
   that already holds identity keys on the homeserver — the key upload conflicts,
   the live device ends up keyless, and peers then *withhold* the Megolm key
   (UTD). So each session is a fresh ephemeral device; the prior device becomes an
   offline ghost (peers withhold to it, harmlessly, and share to the live one).
   The `PW_PEPPER` is a gateway-only secret — never the circle code/key. Megolm
   continuity across reconnects is thus a non-goal here (it needs a persisted
   crypto store — a production concern).
4. **Room mapping.** Alias `#munkel_<groupId>:munkel.localhost`. Create-or-join is
   race-safe: resolve → join; on `M_NOT_FOUND` create; on `M_ROOM_IN_USE`
   re-resolve + join. Rooms are created **out of the published directory**
   (private directory visibility) with **`join_rules: public`** so any member who
   knows the alias joins without an invite, `guest_access: forbidden`,
   `history_visibility: joined`, and `m.room.encryption`. The 128-bit `groupId`
   alias is the sole join secret.
5. **End-to-end encryption.** **Megolm-native** (`m.megolm.v1.aes-sha2`),
   `initRustCrypto({useIndexedDB:false})`, `globalBlacklistUnverifiedDevices=false`
   (so keys reach every device in the closed circle), no cross-signing or
   key-backup. We **additionally** keep Munkel's code-derived AES-256-GCM blob as
   an **inner envelope**: the gateway terminates Megolm and so sees the event
   *body* on localhost, but that body is still the code-derived ciphertext, so the
   gateway never sees plaintext and a stranger who merely joins the Megolm room
   still cannot read content without the code (defense-in-depth).
6. **Ephemerality.** MSC1763 retention `max_lifetime: 10m`,
   `purge_jobs interval: 5m`, `history_visibility: joined`,
   `redaction_retention_period: 1d`, `forgotten_room_retention_period: 1h`. The
   gateway reinforces this with a tiny `initialSyncLimit` and by dropping
   backfilled (`toStartOfTimeline`) events. **Honest floor: a few minutes, not
   zero.**
7. **Media.** The gateway's same-origin `/blob/<group>/<key>` PUT/GET bridges to
   Matrix encrypted media: PUT → `uploadContent` of the app's *already-sealed*
   ciphertext and remember the `mxc` under the `(group, key)` tuple; GET →
   authenticated v1 media download using the gateway session's token. The Swift
   image feature works unchanged.
8. **Runtime.** `@munkel/matrix` and the gateway run on **Node 24**
   (`matrix-sdk-crypto-wasm` is verified there; Bun is unverified for the WASM
   crypto path). Bun stays for the CLI and the build. The integration test is
   gated behind its own script and a live Synapse — never part of default
   `bun test` / turbo.

## Philosophy reconciliation

The brief's hard requirement is to keep what we can and concede what Matrix
genuinely forces. Severity is one of *kept* / *softened* / *conceded*.

| Munkel rule | Severity | New philosophy |
| --- | --- | --- |
| **No accounts** — everything derives from the code; the server holds no identity. | conceded | Accounts exist but are **invisible and auto-provisioned**. A deterministic per-install Matrix user is derived from `memberId` and created on first connect via shared-secret registration. The human never registers, types credentials, or sees an MXID. "Accountless" becomes a **UX truth (no signup)**, not a server-side truth (an account provably exists). |
| **Code-derived pairing** — knowing the code is knowing the group; no server round-trip. | softened | `groupId` still deterministically yields the room alias, so any member joins knowing only the code; the code never leaves the client. We accept a server round-trip to resolve + join the alias and a create-or-join race on cold start. |
| **Zero history** — offline members simply miss messages; the relay buffers nothing. | conceded | **Near-ephemeral, few-minute floor**: retention + `history_visibility: joined` (no backfill before you joined). Offline-means-missed is preserved by `initialSyncLimit` + dropping backfill. Membership state, room state, and the most recent message per room persist on the homeserver until forgotten. |
| **Cloudflare-serverless, zero-storage hosting.** | conceded | The PoC runs a self-hosted, closed-island Synapse (SQLite, loopback). The serverless / zero-storage property is conceded *at the homeserver*; the gateway stays stateless. Explicitly a dev spike. |
| **Symmetric-key E2E** — one code-derived AES-256-GCM key; the server is blind. | softened | E2E becomes **Megolm-native** (Matrix best practice). We additionally keep the code-derived AES blob as an inner envelope, so even a room-joiner cannot read content and the gateway sees only inner ciphertext. Caveat: the gateway briefly holds that inner ciphertext on localhost — but **not** the code-derived key. |
| **Single-WebSocket realtime** — one ws per circle; a connection *is* membership. | kept | The single-ws contract is preserved **at the Munkel boundary**: the gateway speaks the exact existing ws protocol to the unchanged clients. Behind the curtain it runs a matrix-js-sdk client on `/sync`. |
| **Native Swift SDK for the client.** | softened | The PoC uses the **unchanged** Swift app via the gateway — no Swift SDK work. The production answer is to embed **matrix-rust-sdk** in MunkelKit, which also removes the gateway's plaintext-on-localhost caveat. Deferred, not abandoned. |
| **MIT licensing for the whole stack.** | kept | Munkel's own code stays MIT. **Synapse (AGPL-3.0) is an external service we run, not code we redistribute**, so it does not relicense Munkel. matrix-js-sdk / matrix-encrypt-attachment (Apache-2.0) are MIT-compatible deps. |
| **Low operational cost** (a Durable Object is near-free at Munkel's scale). | conceded | Dev op cost is one local Docker container (SQLite, loopback). A production Synapse is materially heavier than the Durable Object. The realistic production options are matrix-rust-sdk-in-app + a managed homeserver, or staying on the existing relay. |

## Concept mapping

How each Munkel protocol concept maps onto Matrix at the gateway.

| Munkel concept | Matrix mapping | Notes |
| --- | --- | --- |
| Circle (from human code) | One Matrix room, addressed by a derived alias | The code never leaves the client; the gateway only ever receives the 32-hex `groupId` (already HKDF-derived on-device). |
| `groupId` (32-hex HKDF output) | Room alias localpart `#munkel_<groupId>:munkel.localhost` | Lowercase hex is a valid Matrix localpart charset. Deterministic + 128-bit unguessable, so every member resolves the same room with no coordination. |
| `memberId` (per-install UUID) | A deterministic MXID (derived from `memberId`) + a fresh per-session device | Same install → same MXID; the device is fresh each session (the in-memory crypto store can't re-adopt an existing device's keys), so Megolm does not persist across reconnects. |
| ws connection == membership (`GET /ws?group=&member=`) | One `MunkelMatrixSession` per ws connection: provision → create-or-join → `startClient` → sync | The gateway owns a Matrix client per live ws connection; open/close drives join/leave. |
| `welcome{members[]}` | Authoritative `/joined_members` (`getJoinedRoomMembers`) snapshot after join, MXID→`memberId` | First frame after the room is joined; queried server-side rather than from local sync, because right after `joinRoom` the lazy-loaded sync view may not yet list peers. Reverse-mapped via the gateway's per-session MXID↔`memberId` table. |
| `peer-joined` / `peer-left` | `RoomMemberEvent` membership deltas, keyed on the **new** value | `join` → peer-joined; `leave`/`ban` → peer-left. Must key on the new value (Matrix persists `leave`); ignore the session's own MXID. |
| `send{payload}` / `message{from,payload}` | `m.room.message` (`msgtype app.munkel.blob`) carrying the base64 Munkel blob; received via timeline + `Decrypted` | On receive: drop own echoes, skip backfill, await decryption, forward as `message{from:<memberId>,payload}`. |
| `send{payload,to}` (DM) / `message{from,to,payload}` | v1: **same Megolm room**, gateway-enforced targeted delivery | Munkel v1 DMs already reuse the group key and rely on the server to enforce targeting. The gateway tags `app.munkel.to=<memberId>` and forwards only to the matching ws. Pairwise rooms deferred, exactly as Munkel defers pairwise keys to v2. |
| `profile{displayName,avatar?}` payload | Carried as an ordinary Munkel blob inside `m.room.message` (**not** `m.room.member`) | We deliberately do **not** call `setDisplayName`/`setAvatarUrl`, which would leak cleartext profile to the operator. |
| `image{...}` payload + blob at `/blob/<group>/<key>` | Same inline payload over the timeline; the same-origin `/blob` HTTP endpoint is backed by Matrix encrypted media | **Critical**: the unchanged app derives the blob base URL from the ws origin, so the gateway must serve `/blob/<group>/<key>` PUT+GET, bridged to `uploadContent` + authenticated v1 media download. The app already AES-seals the blob, so Matrix media stores opaque ciphertext. |
| `ping`/`pong` keepalive | Handled entirely in the gateway ws layer; never touches Matrix | Matrix sync keepalive is independent. |
| Zero history / ephemeral by construction | Synapse MSC1763 retention + `history_visibility: joined` + redaction | Matrix cannot reach literal zero; softens to "near-ephemeral, few-minute floor, no history before you joined". |
| Durable Object per group (serverless, stores nothing) | Self-hosted Synapse (stateful) + a stateless Bun ws gateway | Serverless / zero-state conceded at the homeserver; the gateway itself stays stateless. |

## E2E trust caveat (explicit)

The WS gateway **terminates Megolm**: it runs the Matrix client with rust crypto,
so to translate Matrix events into Munkel ws frames it decrypts the Megolm layer
and holds the event body on localhost. Stated precisely: **the gateway sees
exactly what the v1 Cloudflare relay saw** — the opaque, app-AES-sealed payload
plus the `from`/`to` routing metadata — and never the circle code or the app
plaintext. Megolm additionally blinds **only the homeserver**, not the gateway
(the gateway is the Megolm endpoint). So "the gateway only ever sees inner
ciphertext" is true, but it is *not* because Megolm hides the payload from the
gateway — it is because Munkel's inner AES envelope does. Treat the gateway host
as a **trusted relay** (no payload logging, minimal retention), not a
zero-knowledge party.

This is still a **real trust reduction** versus the bespoke relay, which is also
blind but never holds Matrix device keys. The production fix is to embed
**matrix-rust-sdk** directly in the Swift app so Megolm is device-to-device with
no gateway in the trust path; the gateway exists only because the PoC keeps the
client unchanged.

## Consequences

### Positive

- The **unchanged** Swift app + CLI run against Matrix by setting
  `MUNKEL_RELAY_URL=ws://localhost:8787` — chat both directions, presence, and
  images, with no client code touched.
- We exercise real Matrix best practices end to end: Megolm, authenticated media,
  MSC1763 retention, private encrypted rooms (`m.room.encrypted` on the wire).
- The identity / provisioning layer is abstracted for a later appservice swap.

### Negative

- A **stateful AGPL homeserver** replaces a near-free serverless relay.
- The gateway **terminates Megolm and holds inner ciphertext** on localhost — a
  real trust reduction; only the matrix-rust-sdk-in-app path removes it.
- In-memory Rust crypto store → a **new Megolm session per gateway process**; on
  restart, peers must re-share keys and in-flight history is undecryptable
  (acceptable under miss-if-offline, but not crash-transparent for crypto).
- The `/blob` bridge depends on a `(group,key)→mxc` map; if it is lost on restart
  or the media is purged, GET 404s (the app treats this as "expired", but it
  differs subtly from R2 TTL semantics).
- **Ephemerality floor is a few minutes, not zero**; room/membership **state
  persists** until forgotten — a genuine weakening of "no history anywhere" that
  must be communicated to *users*, not just stakeholders.
- The crypto path **pins the gateway to Node**, splitting the runtime story
  (Bun for CLI/build, Node for the gateway).
- `SERVER_NAME` is permanent and baked into every ID; a wrong value requires
  nuking the volume.

### Neutral

- The PoC does **not** decide production hosting; it proves the protocol bridge.

## Known divergences & limitations (from adversarial review)

An adversarial review (crypto / protocol fidelity / security / completeness, each
finding independently verified against the code) surfaced these. The high-value
correctness items were fixed; the rest are documented honestly here.

**Fixed in code after review:** a send can no longer race ahead of the
`m.room.encryption` state (`open()` blocks on `waitForRoomEncryption`, and
`send`/`sendDirect` refuse to send into an unencrypted room — no silent plaintext
downgrade); blob/media ephemerality (`media_retention.local_media_lifetime: 10m`,
since message retention does **not** cover uploaded media); the room name is a
constant (no `groupId` bits leak into cleartext `m.room.name`); rooms are
`forgetRoom`-ed after leave; the gateway enforces the 64 KiB frame cap, rejects
binary frames, and reaps dead connections on a 120 s heartbeat; the shared secret
has one source of truth (`dev.env`, injected by `up.sh`).

**Documented divergences that remain (acceptable for a spike):**

- **Reconnect-replace churn.** The bespoke relay ref-counts connections per
  `memberId` and stays silent when a reconnect replaces a connection. The gateway
  maps presence to room membership and opens a fresh session per ws, so a
  transient reconnect produces `peer-left` + `peer-joined` flicker. A production
  fix ref-counts ws connections onto one session per `(group, memberId)`.
- **No Megolm continuity across sessions.** The rust crypto store is in-memory
  and each session uses a fresh ephemeral device (see Decision 3), so a reconnect
  starts a new Megolm session; the live device always decrypts, but ghost devices
  accumulate on the homeserver until forgotten/expired. Bounded by
  offline-means-missed. Production: persist the crypto store and reuse one device
  per install for real continuity.
- **Operator metadata delta.** Versus v1's zero-persistence relay, the operator
  gains a persistent, linkable MXID per install, the per-circle membership graph,
  and a timing trail (leave/forget within ~1 h). The circle code, message
  plaintext, display names and avatars stay hidden (profiles ride inside the
  encrypted blob, not `m.room.member`).
- **Provisioning credentials.** Per-`memberId` creds are process-scoped and not
  revoked on disconnect; the gateway `PW_PEPPER` is a master credential with no
  rotation path. Production: per-install random passwords in a real CredStore, or
  go passwordless via an Application Service.
- **Tested vs. reasoned.** The tests use synthetic payloads, so the inner-AES
  envelope is inherited from the unchanged client, not exercised here. Single-blob
  round-trip and the create-or-join race **are** tested; multi-image albums and
  post-restart blob-miss (404) are reasoned, not demonstrated. The **real Swift
  app / CLI were not driven through the gateway in this spike** — wire
  compatibility is proven with synthetic clients speaking the byte-identical
  protocol, imported from the same `apps/server/src/protocol.ts`.
- **Minor protocol deltas.** A direct message addressed to one's own `memberId` is
  dropped rather than echoed back (the relay echoes it); an invalid `memberId` is
  rejected at the HTTP upgrade (400) rather than accept-then-`close(1008)`. Both
  are below the app's observable surface.

## Answers to issue #89's open questions

**Can Matrix back Munkel without changing the Swift app and CLI at all?**
Yes, for the PoC. The unchanged clients point at the gateway via
`MUNKEL_RELAY_URL`. The gateway speaks Munkel's byte-identical ws protocol and
serves the same-origin `/blob/<group>/<key>` endpoint, so even the image feature
works unchanged. Honest caveat: this requires a gateway in the trust path that
terminates Megolm; the truly-no-gateway answer (matrix-rust-sdk in MunkelKit)
*does* change the app and is the production path, not the PoC.

**How do we keep "no accounts" when Matrix mandates accounts?**
We redefine "accountless" as a **UX truth, not a server truth**. The gateway
auto-provisions an invisible, deterministic per-install Matrix account derived
from `memberId` via shared-secret registration. The human never registers, types
credentials, or sees an MXID. We document honestly that an ephemeral account
provably exists server-side and the operator can see MXIDs, the per-circle
membership graph, and timing/size metadata — but **not** the circle code and
(with Megolm + the inner AES envelope) **not** the plaintext.

**What happens to Munkel's zero-history / ephemeral guarantee?**
It softens to **near-ephemeral with an honest few-minute floor**. We use MSC1763
retention (`max_lifetime ~10m`, purge `~5m`), `history_visibility: joined`, and
short redaction / forgotten-room windows. Literal zero is impossible: purge is
periodic, the redaction sweep is fixed, room **state events are never purged**,
and Synapse always keeps the most recent message per room. The gateway reinforces
ephemerality with a tiny `initialSyncLimit` and by dropping backfilled events.

**What is the production path, and what does the PoC deliberately NOT solve?**
Production path: embed **matrix-rust-sdk** in MunkelKit so Megolm is
device-to-device with no gateway terminating E2E; swap shared-secret provisioning
for an **Application Service** (passwordless, namespaced `@munkel_*`,
rate-limit-exempt, MAS-compatible); and decide hosting (self-hosted vs managed) on
real op-cost numbers. The PoC deliberately does **not** solve: true
device-to-device E2E, serverless / zero-storage hosting, literal zero history,
cross-device key backup / verification UX, or production op cost. It proves
exactly one thing: the unchanged Munkel clients can run over a real,
best-practice Matrix backend via the bridge.

## Production path vs. what the PoC does not solve

| Concern | PoC (this spike) | Production path |
| --- | --- | --- |
| Provisioning | Shared-secret admin register | Application Service (passwordless, namespaced, rate-limit-exempt, MAS-compatible) |
| E2E trust | Gateway terminates Megolm on localhost (sees inner ciphertext, not plaintext) | matrix-rust-sdk embedded in MunkelKit — device-to-device, no gateway in the trust path |
| Client | Unchanged Swift app + CLI via gateway | Native Matrix SDK in MunkelKit (gateway removed) |
| Hosting | One local Docker Synapse (SQLite, loopback) | Decided on real op-cost numbers (self-hosted vs managed) — or stay on the existing relay |
| History | Near-ephemeral, few-minute floor; state persists | Same Matrix floor (literal zero remains impossible) |
| Licensing | Synapse AGPL run as external service; Munkel stays MIT | Unchanged — the AGPL boundary holds as long as Synapse is not bundled/modified |

## Alternatives considered

- **Application service provisioning** instead of shared-secret: cleaner for
  production (passwordless, namespaced, rate-limit-exempt, MAS-compatible) but
  needs a registered callback-serving HS component — too heavy for a spike.
  Documented as the production successor.
- **Matrix as a dumb transport** (no Megolm, just carry the AES blob): violates
  the brief's "use Matrix best practices". Rejected; we enable Megolm *and* keep
  the AES blob as an inner envelope instead.
- **Embed matrix-rust-sdk in the Swift app now**: the true production
  architecture, but it changes the client and is out of scope for an
  "unchanged app" PoC. Deferred.
- **Guest accounts** for "no signup": confirmed dead (matrix.org disabled guests
  2025-01-16 during the MAS rollout). Rejected.
- **`matrixdotorg/synapse` image**: legacy mirror. Rejected in favour of the
  maintained Element HQ image.
