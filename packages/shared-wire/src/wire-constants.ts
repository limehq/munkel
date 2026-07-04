/**
 * Wire-format caps and regexes that must stay in sync across clients and
 * server.
 *
 * See {@link ../PROTOCOL.md} for the full Munkel wire protocol v1 spec.
 */

/** Client-generated per-image object id: URL-safe, 16–128 chars. */
export const BLOB_KEY_REGEX = /^[A-Za-z0-9_-]{16,128}$/;

/** Max ciphertext bytes accepted per blob (3 MiB). */
export const MAX_BLOB_BYTES = 3 * 1024 * 1024;

/** Base64 ciphertext cap — keeps relay frames well under the 64 KiB budget. */
export const MAX_PAYLOAD_CHARS = 48 * 1024;
