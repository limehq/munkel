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
