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

export type AppPayload = ChatPayload | ProfilePayload;

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

  throw new PayloadError(`Unknown payload kind: ${parsed.kind}`);
}
