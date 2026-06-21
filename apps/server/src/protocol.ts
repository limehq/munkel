import { z } from 'zod';

/**
 * Munkel wire protocol v1 — the canonical spec; the contract between this
 * relay, the macOS app (MunkelKit), and the CLI. The relay is intentionally
 * dumb: it routes opaque encrypted blobs between group members and tracks
 * who is currently online. It stores nothing.
 *
 * ## Transport
 *
 * WebSocket (WSS in production), JSON text frames. One Durable Object per
 * group (`idFromName(groupId)`, see group-room.ts) with the WebSocket
 * Hibernation API via partyserver; no DO storage is used — messages stay
 * ephemeral by construction.
 *
 * A connection IS a group membership: clients open one WebSocket per joined
 * group via `GET /ws?group=<groupId>&member=<memberId>`. There is no
 * hello/join/leave handshake; presence derives from live connections. A new
 * connection with the same `memberId` replaces the old one silently (no
 * `peer-left`/`peer-joined` churn on reconnect).
 *
 * Limits: 64 KiB per frame, {@link MAX_PAYLOAD_CHARS} per payload, 32
 * connections per group (group-room.ts). Clients send `{"type":"ping"}`
 * every ≤60 s; the server answers `pong` and closes connections idle for
 * more than 120 s.
 *
 * ## Identity and groups
 *
 * There are no accounts. Everything derives from the human-readable group
 * code (e.g. `blue-table-42`), which never leaves the clients. Code
 * normalization before derivation: Unicode NFC, trim, lowercase.
 *
 * - `groupId`    = hex(HKDF-SHA256(ikm: utf8(code), salt: "munkel-v1",
 *                  info: "group-id")), 16 bytes → 32 hex chars
 * - `messageKey` = HKDF-SHA256(ikm: utf8(code), salt: "munkel-v1",
 *                  info: "message-key"), 32 bytes
 *
 * The server only ever sees `groupId` — it cannot recover the code or the
 * key. `memberId` is a client-generated UUID, stable per installation.
 * Reference implementations: GroupKey.swift (MunkelKit) and
 * ../scripts/dev-send.ts; the derivation is pinned in CryptoTests.swift.
 *
 * ## Encryption
 *
 * All payloads are end-to-end encrypted with AES-256-GCM under `messageKey`
 * (chosen over ChaChaPoly for WebCrypto/CryptoKit interop):
 *
 *     payload = base64( nonce[12] ‖ ciphertext ‖ tag[16] )
 *
 * Random 12-byte nonce per message, empty AAD. Direct messages (`to`) use
 * the same group key in v1 — the server enforces targeted delivery, but
 * pairwise keys are deliberately deferred to v2.
 *
 * ## Application payloads (inside the encrypted blob)
 *
 * The relay never sees these. Decrypted plaintext is JSON with a `kind`
 * discriminator:
 *
 * - `chat`:    `text`, `sentAt` (ISO-8601) — the actual message.
 * - `profile`: `displayName`, `avatar?` (base64 JPEG/PNG), `status?`
 *   (`online` | `dnd` | `away`; an absent or unknown value reads as `online`)
 *   — broadcast after joining and whenever a `peer-joined` arrives, so
 *   newcomers learn who everyone is. Sending `profile` without `avatar` clears
 *   it. Byte budgets live with the codec: AvatarCodec.swift (MunkelKit).
 * - `presence`: `status` (`online` | `dnd` | `away`) only — a lightweight
 *   delta broadcast when a member's status changes, so a status flip needn't
 *   re-send the avatar bytes. The initial status still rides on `profile` for
 *   the join snapshot; clients without presence support ignore this kind.
 * - `image`:   `items` (1–8), shared `caption`, `sentAt`. Each item is
 *   `{r2Key, mime, width, height, byteLen, thumb (inline AVIF, base64)}`.
 *   The full-resolution image is AVIF, always sealed and PUT to R2 (blob.ts);
 *   only the pointer + a tiny inline AVIF thumbnail are relayed, and the full
 *   image is fetched from R2 on demand. Byte budgets live with the codec:
 *   ImageCodec.swift (MunkelKit).
 *
 * Reference implementations: AppPayload.swift and ../scripts/dev-send.ts.
 *
 * ## Guarantees and non-guarantees
 *
 * - Ephemeral by design: the relay holds no message buffer. Offline members
 *   simply never receive a message. There is no history anywhere.
 * - Presence is best-effort: derived from live connections; a crashed
 *   client disappears after the idle timeout at the latest.
 * - The server can see: group IDs (random-looking hashes), member UUIDs,
 *   message sizes and timing. It cannot see: group codes, names, avatars,
 *   message content, or who a `memberId` belongs to.
 * - Joining requires no server round-trip: knowing the code is knowing the
 *   group. Unguessable 128-bit group IDs are the only access control in v1.
 */

/** groupId = hex(HKDF-SHA256(group code, info: "group-id")) — see module doc. */
export const GROUP_ID_REGEX = /^[a-f0-9]{32}$/;
/** Client-generated installation UUID. */
export const MEMBER_ID_REGEX = /^[A-Za-z0-9_-]{1,64}$/;

/** Base64 ciphertext cap — keeps frames well under the 64 KiB budget. */
export const MAX_PAYLOAD_CHARS = 48 * 1024;

const memberId = z.string().regex(MEMBER_ID_REGEX);

/**
 * Client → server frames. `send` without `to` is a group broadcast; with
 * `to` (a memberId) the server delivers to that member only.
 */
export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('send'),
    payload: z.string().min(1).max(MAX_PAYLOAD_CHARS),
    to: memberId.optional(),
  }),
  z.object({ type: z.literal('ping') }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type ErrorCode = 'invalid-message' | 'unknown-recipient';

/**
 * Server → client frames. `welcome` is the first frame after connecting and
 * lists the other members currently online. `message` is never echoed back
 * to the sender; `peer-left` is sent on disconnect, not on reconnect-replace.
 */
export type ServerMessage =
  | { type: 'welcome'; members: string[] }
  | { type: 'peer-joined'; memberId: string }
  | { type: 'peer-left'; memberId: string }
  | { type: 'message'; from: string; to?: string; payload: string }
  | { type: 'pong' }
  | { type: 'error'; code: ErrorCode; message: string };
