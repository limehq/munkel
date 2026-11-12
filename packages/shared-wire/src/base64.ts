/**
 * Browser- and Worker-compatible Base64 helpers.
 *
 * These replace `Buffer.from(...).toString('base64')` so that `shared-wire`
 * stays usable in environments without Node's `Buffer` global.
 */

const CHUNK_SIZE = 0x8000; // 32 KiB — safely below `String.fromCharCode` arg limits.

/**
 * Encode a Uint8Array as a standard Base64 string.
 */
export function bytesToBase64(data: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.subarray(i, i + CHUNK_SIZE);
    parts.push(String.fromCharCode(...chunk));
  }
  return btoa(parts.join(''));
}

/**
 * Decode a standard Base64 string into a Uint8Array.
 */
export function base64ToBytes(input: string): Uint8Array {
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
