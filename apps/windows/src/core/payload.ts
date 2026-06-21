export type ChatPayload = {
  kind: 'chat';
  text: string;
  sentAt: string;
};

export type ProfilePayload = {
  kind: 'profile';
  displayName: string;
  avatar?: string;
};

/**
 * One image of an album. Mirrors `MunkelKit/AppPayload.swift` `ImageItem`.
 * The full-resolution AVIF is always sealed and uploaded to R2 under
 * `r2Key`; only this pointer is relayed. `thumb` is a tiny inline AVIF
 * (base64) so the notch paints instantly while the full image lazy-loads
 * from R2. `width`/`height` are the full image's pixel size (for aspect
 * ratio); `byteLen` is the sealed blob's size (informational only —
 * never used to bound the download).
 */
export interface ImageItem {
  r2Key: string;
  mime: string;
  width: number;
  height: number;
  byteLen: number;
  thumb: string;
}

export interface ImagePayload {
  kind: 'image';
  items: ImageItem[];
  caption: string;
  sentAt: string;
}

export type AppPayload = ChatPayload | ProfilePayload | ImagePayload;

export class PayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PayloadError';
  }
}

/**
 * Thrown by `assertPayloadFits` when a sealed payload exceeds
 * `MAX_PAYLOAD_CHARS`. The renderer surfaces the `.message` to the user
 * via the inline-error pattern, so the wording is user-facing.
 *
 * Subclass of `PayloadError` so callers that catch the base class still
 * see it.
 */
export class PayloadTooLargeError extends PayloadError {}

function bytesToBase64(data: Uint8Array): string {
  return Buffer.from(data).toString('base64');
}

/**
 * Build a chat payload. `sentAt` defaults to the current time as ISO-8601.
 */
export function encodeChat(text: string, sentAt: Date = new Date()): ChatPayload {
  return { kind: 'chat', text, sentAt: sentAt.toISOString() };
}

/**
 * Build a profile payload. If `avatar` is a Uint8Array it is base64-encoded.
 */
export function encodeProfile(displayName: string, avatar?: Uint8Array | string): ProfilePayload {
  return { kind: 'profile', displayName, avatar: avatar === undefined ? undefined : typeof avatar === 'string' ? avatar : bytesToBase64(avatar) };
}

/**
 * Build an image-album payload. The full images are uploaded to R2
 * separately; only the `items[]` pointers travel through the relay.
 */
export function encodeImage(
  items: ImageItem[],
  caption: string,
  sentAt: Date = new Date(),
): ImagePayload {
  return { kind: 'image', items, caption, sentAt: sentAt.toISOString() };
}

/**
 * Server-side blob key format (URL-safe, 16–128 chars). Mirrors
 * `apps/server/src/blob.ts: BLOB_KEY_REGEX`. Exported here so the
 * `ImageItem` validation in `decodePayload` can use it.
 */
export const BLOB_KEY_REGEX = /^[A-Za-z0-9_-]{16,128}$/;

/**
 * Re-export the wire-format cap so callers don't have to import from
 * `./protocol.js` for the size guard. Mirrors `apps/server/src/protocol.ts:92`
 * and `apps/windows/src/core/protocol.ts:84` — drift across these three
 * is a silent wire-format bug; flagged in the branch plan.
 */
import { MAX_PAYLOAD_CHARS } from './protocol.js';
export { MAX_PAYLOAD_CHARS };

/**
 * Throw `PayloadTooLargeError` if the (already-sealed or pre-seal)
 * JSON payload exceeds the wire-format cap. Called from
 * `GroupSession.sendChat` / `sendProfile` so the renderer can surface a
 * clear "Message too long" error instead of a generic "Send failed".
 */
export function assertPayloadFits(json: string): void {
  if (json.length > MAX_PAYLOAD_CHARS) {
    throw new PayloadTooLargeError(
      `Message too long (${json.length} chars; max ${MAX_PAYLOAD_CHARS}).`,
    );
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string') {
    throw new PayloadError(`Expected ${field} to be a string`);
  }
}

/**
 * Parse and validate an application payload JSON string.
 */
export function decodePayload(json: string): AppPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new PayloadError('Payload is not valid JSON');
  }

  if (!isObject(parsed) || typeof parsed.kind !== 'string') {
    throw new PayloadError('Payload must be an object with a kind field');
  }

  if (parsed.kind === 'chat') {
    assertString(parsed.text, 'text');
    assertString(parsed.sentAt, 'sentAt');
    if (Number.isNaN(Date.parse(parsed.sentAt))) {
      throw new PayloadError('sentAt must be a valid ISO-8601 timestamp');
    }
    return { kind: 'chat', text: parsed.text, sentAt: parsed.sentAt };
  }

  if (parsed.kind === 'profile') {
    assertString(parsed.displayName, 'displayName');
    if (parsed.avatar !== undefined && typeof parsed.avatar !== 'string') {
      throw new PayloadError('avatar must be a base64 string when present');
    }
    return { kind: 'profile', displayName: parsed.displayName, avatar: parsed.avatar };
  }

  if (parsed.kind === 'image') {
    if (!Array.isArray(parsed.items)) {
      throw new PayloadError('image items must be an array');
    }
    assertString(parsed.caption, 'caption');
    assertString(parsed.sentAt, 'sentAt');
    if (Number.isNaN(Date.parse(parsed.sentAt))) {
      throw new PayloadError('sentAt must be a valid ISO-8601 timestamp');
    }
    if (parsed.items.length > 8) {
      // Match macOS: "senders clamp, receivers drop extras" (AppPayload.swift).
      parsed.items = parsed.items.slice(0, 8);
    }
    const items: ImageItem[] = parsed.items.map((raw: unknown, i: number) => {
      if (!isObject(raw)) {
        throw new PayloadError(`image items[${i}] must be an object`);
      }
      assertString(raw.r2Key, `image items[${i}].r2Key`);
      if (!BLOB_KEY_REGEX.test(raw.r2Key as string)) {
        throw new PayloadError(`image items[${i}].r2Key is malformed`);
      }
      assertString(raw.mime, `image items[${i}].mime`);
      if (typeof raw.width !== 'number' || raw.width <= 0 || !Number.isInteger(raw.width)) {
        throw new PayloadError(`image items[${i}].width must be a positive integer`);
      }
      if (typeof raw.height !== 'number' || raw.height <= 0 || !Number.isInteger(raw.height)) {
        throw new PayloadError(`image items[${i}].height must be a positive integer`);
      }
      if (typeof raw.byteLen !== 'number' || raw.byteLen < 0 || !Number.isInteger(raw.byteLen)) {
        throw new PayloadError(`image items[${i}].byteLen must be a non-negative integer`);
      }
      assertString(raw.thumb, `image items[${i}].thumb`);
      return {
        r2Key: raw.r2Key as string,
        mime: raw.mime as string,
        width: raw.width,
        height: raw.height,
        byteLen: raw.byteLen,
        thumb: raw.thumb as string,
      };
    });
    return { kind: 'image', items, caption: parsed.caption, sentAt: parsed.sentAt };
  }

  throw new PayloadError(`Unknown payload kind: ${parsed.kind}`);
}
