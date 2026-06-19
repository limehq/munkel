import { describe, it, expect } from 'bun:test';
import { deriveGroupKeys, seal, open, CryptoError } from '../crypto';
import { normalizeCircleCode } from '../normalize';

describe('crypto', () => {
  it('derives the golden vector groupId for blue-table-42', async () => {
    const { groupId } = await deriveGroupKeys('blue-table-42');
    expect(groupId).toBe('aaf5dc7308fe4bede46cdebc9390813d');
  });

  it('round-trips a chat message through seal/open', async () => {
    const { messageKey } = await deriveGroupKeys('red-chair-7');
    const plaintext = JSON.stringify({ kind: 'chat', text: 'hello', sentAt: new Date().toISOString() });

    const sealed = await seal(plaintext, messageKey);
    const opened = await open(sealed, messageKey);

    expect(opened).toBe(plaintext);
  });

  it('round-trips a Uint8Array payload', async () => {
    const { messageKey } = await deriveGroupKeys('green-lamp-99');
    const bytes = new TextEncoder().encode('binary data 🪑');

    const sealed = await seal(bytes, messageKey);
    const opened = await open(sealed, messageKey);

    expect(opened).toBe('binary data 🪑');
  });

  it('fails to open with the wrong key', async () => {
    const { messageKey: keyA } = await deriveGroupKeys('circle-a');
    const { messageKey: keyB } = await deriveGroupKeys('circle-b');

    const sealed = await seal('secret', keyA);
    await expect(open(sealed, keyB)).rejects.toBeInstanceOf(CryptoError);
  });

  it('fails to open malformed payloads', async () => {
    const { messageKey } = await deriveGroupKeys('lonely-mountain');
    await expect(open('not-base64!!!', messageKey)).rejects.toBeInstanceOf(CryptoError);
    await expect(open('aGVsbG8=', messageKey)).rejects.toBeInstanceOf(CryptoError);
  });

  it('matches the server dev-send normalization', async () => {
    const raw = '  Blue-Table-42  ';
    const normalized = normalizeCircleCode(raw);
    const { groupId } = await deriveGroupKeys(raw);
    expect(normalized).toBe('blue-table-42');
    expect(groupId).toBe('aaf5dc7308fe4bede46cdebc9390813d');
  });
});
