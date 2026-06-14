import { describe, it, expect } from 'vitest';
import { deriveGroupKeys, seal, open } from '../src/crypto.js';
import { encodeChat, encodeProfile } from '../src/payload.js';

/**
 * Mirror of apps/server/scripts/dev-send.ts decryption logic. Proves a
 * payload sealed by @munkel/core can be opened by the server reference.
 */
async function devSendOpen(payload: string, messageKey: CryptoKey): Promise<unknown> {
  const combined = Buffer.from(payload, 'base64');
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: combined.subarray(0, 12) },
    messageKey,
    combined.subarray(12),
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}

describe('interop with apps/server/scripts/dev-send.ts', () => {
  it('core-sealed chat payload can be opened by dev-send logic', async () => {
    const { messageKey } = await deriveGroupKeys('interop-circle');
    const chat = encodeChat('can you hear me?', new Date('2026-06-14T12:00:00.000Z'));
    const sealed = await seal(JSON.stringify(chat), messageKey);

    const decrypted = await devSendOpen(sealed, messageKey);
    expect(decrypted).toEqual(chat);
  });

  it('dev-send style payload can be opened by core', async () => {
    const { messageKey } = await deriveGroupKeys('interop-circle-2');
    const profile = encodeProfile('Core Bot');
    const sealed = await seal(JSON.stringify(profile), messageKey);

    const decrypted = await open(sealed, messageKey);
    expect(JSON.parse(decrypted)).toEqual(profile);
  });
});
