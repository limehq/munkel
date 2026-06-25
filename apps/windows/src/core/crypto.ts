import { normalizeCircleCode } from './normalize.js';

const encoder = new TextEncoder();

export const MUNKEL_SALT = encoder.encode('munkel-v1');

export class CryptoError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'CryptoError';
    this.cause = cause;
  }
}

/**
 * Import the normalized group code as raw HKDF input-keying material.
 */
async function importCodeMaterial(code: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(code), 'HKDF', false, ['deriveBits']);
}

async function deriveBits(material: CryptoKey, info: string, bits: number): Promise<Uint8Array> {
  const derived = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: MUNKEL_SALT, info: encoder.encode(info) },
    material,
    bits,
  );
  return new Uint8Array(derived);
}

/**
 * Derive the group identity and AES-256 message key from a human-readable
 * circle code. The returned `messageKey` can be passed to {@link seal} and
 * {@link open}.
 */
export async function deriveGroupKeys(code: string): Promise<{ groupId: string; messageKey: CryptoKey }> {
  const normalized = normalizeCircleCode(code);
  const material = await importCodeMaterial(normalized);

  const groupIdBytes = await deriveBits(material, 'group-id', 128);
  const groupId = [...groupIdBytes].map((b) => b.toString(16).padStart(2, '0')).join('');

  const messageKeyBytes = await deriveBits(material, 'message-key', 256);
  const messageKey = await crypto.subtle.importKey(
    'raw',
    messageKeyBytes.buffer as ArrayBuffer,
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  );

  return { groupId, messageKey };
}

function toUint8Array(input: string | Uint8Array): Uint8Array {
  return typeof input === 'string' ? encoder.encode(input) : input;
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const combined = new Uint8Array(a.length + b.length);
  combined.set(a);
  combined.set(b, a.length);
  return combined;
}

/**
 * Encrypt a plaintext payload with AES-256-GCM under the given message key.
 *
 * Returns `base64(nonce[12] ‖ ciphertext ‖ tag[16])`.
 */
export async function seal(plaintext: string | Uint8Array, messageKey: CryptoKey): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  return sealWithNonce(plaintext, messageKey, nonce);
}

/**
 * Deterministic seal for cross-platform interop tests (Swift ↔ Windows).
 * Production code should use {@link seal} with a random nonce.
 *
 * Returns `base64(nonce[12] ‖ ciphertext ‖ tag[16])`.
 */
export async function sealWithNonce(
  plaintext: string | Uint8Array,
  messageKey: CryptoKey,
  nonce: Uint8Array,
): Promise<string> {
  if (nonce.length !== 12) {
    throw new CryptoError('AES-GCM nonce must be exactly 12 bytes');
  }
  try {
    const iv = nonce as Uint8Array<ArrayBuffer>;
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, messageKey, toUint8Array(plaintext) as ArrayBufferView<ArrayBuffer>),
    );
    return Buffer.from(concatBytes(nonce, ciphertext)).toString('base64');
  } catch (err) {
    throw new CryptoError('Failed to seal payload', err);
  }
}

export async function sealRaw(plaintext: Uint8Array, messageKey: CryptoKey): Promise<Uint8Array> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  try {
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, messageKey, plaintext as ArrayBufferView<ArrayBuffer>),
    );
    return concatBytes(nonce, ciphertext);
  } catch (err) {
    throw new CryptoError('Failed to seal payload', err);
  }
}

/**
 * Inverse of {@link sealRaw}: takes raw `nonce ‖ ciphertext ‖ tag` bytes
 * and returns the decrypted plaintext bytes. Used for the R2 blob receive
 * path.
 */
export async function openRaw(payload: Uint8Array, messageKey: CryptoKey): Promise<Uint8Array> {
  if (payload.length < 12 + 16) {
    throw new CryptoError('Payload is too short to contain a nonce and tag');
  }
  const nonce = payload.subarray(0, 12) as Uint8Array<ArrayBuffer>;
  const ciphertextAndTag = payload.subarray(12) as Uint8Array<ArrayBuffer>;
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce },
      messageKey,
      ciphertextAndTag,
    );
    return new Uint8Array(plaintext);
  } catch (err) {
    throw new CryptoError('Failed to open payload (bad key or corrupted data)', err);
  }
}

/**
 * Decrypt a sealed payload and return the UTF-8 plaintext string.
 */
export async function open(payload: string, messageKey: CryptoKey): Promise<string> {
  let combined: Uint8Array<ArrayBuffer>;
  try {
    combined = new Uint8Array(Buffer.from(payload, 'base64')) as Uint8Array<ArrayBuffer>;
  } catch (err) {
    throw new CryptoError('Payload is not valid base64', err);
  }

  if (combined.length < 12 + 16) {
    throw new CryptoError('Payload is too short to contain a nonce and tag');
  }

  const nonce = combined.subarray(0, 12) as Uint8Array<ArrayBuffer>;
  const ciphertextAndTag = combined.subarray(12) as Uint8Array<ArrayBuffer>;

  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, messageKey, ciphertextAndTag as ArrayBufferView<ArrayBuffer>);
    return new TextDecoder().decode(plaintext);
  } catch (err) {
    throw new CryptoError('Failed to open payload (bad key or corrupted data)', err);
  }
}
