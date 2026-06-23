import { describe, it, expect } from 'bun:test';
import {
  encodeChat,
  encodeProfile,
  encodeImage,
  decodePayload,
  assertPayloadFits,
  PayloadTooLargeError,
  MAX_PAYLOAD_CHARS,
  type ImageItem,
} from '../payload';

describe('payload encoding', () => {
  it('encodes a chat payload with ISO-8601 sentAt', () => {
    const date = new Date('2024-01-15T09:30:00.000Z');
    const payload = encodeChat('hello world', date);
    expect(payload).toEqual({ kind: 'chat', text: 'hello world', sentAt: '2024-01-15T09:30:00.000Z' });
  });

  it('defaults sentAt to now', () => {
    const before = Date.now();
    const payload = encodeChat('hello');
    const after = Date.now();
    const ts = Date.parse(payload.sentAt);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('encodes a profile payload without avatar', () => {
    const payload = encodeProfile('Alex');
    expect(payload).toEqual({ kind: 'profile', displayName: 'Alex' });
  });

  it('encodes a profile payload with Uint8Array avatar', () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff]);
    const payload = encodeProfile('Alex', bytes);
    expect(payload.avatar).toBe(Buffer.from(bytes).toString('base64'));
  });

  it('encodes a profile payload with string avatar', () => {
    const payload = encodeProfile('Alex', 'aGVsbG8=');
    expect(payload.avatar).toBe('aGVsbG8=');
  });

  it('round-trips chat and profile payloads', () => {
    const chat = encodeChat('round trip', new Date('2025-06-01T12:00:00.000Z'));
    expect(decodePayload(JSON.stringify(chat))).toEqual(chat);

    const profile = encodeProfile('Sam', new Uint8Array([1, 2, 3]));
    expect(decodePayload(JSON.stringify(profile))).toEqual(profile);
  });

  it('rejects malformed payloads', () => {
    expect(() => decodePayload('not json')).toThrow('not valid JSON');
    expect(() => decodePayload('{"kind":"chat","text":"x"}')).toThrow('sentAt');
    expect(() => decodePayload('{"kind":"unknown"}')).toThrow('Unknown payload kind');
  });

  it('round-trips an image album through encodeImage + decodePayload', () => {
    const items: ImageItem[] = [
      { r2Key: 'abcdefghijklmnop', mime: 'image/avif', width: 800, height: 600, byteLen: 12345, thumb: 'AAAA' },
      { r2Key: 'qrstuvwxyz012345', mime: 'image/avif', width: 1024, height: 768, byteLen: 67890, thumb: 'BBBB' },
    ];
    const payload = encodeImage(items, 'look at this', new Date('2025-06-01T12:00:00.000Z'));
    const decoded = decodePayload(JSON.stringify(payload));
    expect(decoded).toEqual(payload);
  });

  it('rejects image items with malformed r2Key', () => {
    const bad = {
      kind: 'image',
      items: [{ r2Key: 'too-short', mime: 'image/avif', width: 1, height: 1, byteLen: 0, thumb: 'x' }],
      caption: '',
      sentAt: '2025-06-01T12:00:00.000Z',
    };
    expect(() => decodePayload(JSON.stringify(bad))).toThrow(/r2Key is malformed/);
  });

  it('rejects image items with non-integer width/height', () => {
    const bad = {
      kind: 'image',
      items: [{ r2Key: 'abcdefghijklmnop', mime: 'image/avif', width: 1.5, height: 1, byteLen: 0, thumb: 'x' }],
      caption: '',
      sentAt: '2025-06-01T12:00:00.000Z',
    };
    expect(() => decodePayload(JSON.stringify(bad))).toThrow(/width must be a positive integer/);
  });

  it('drops extras beyond 8 items, mirroring macOS receivers', () => {
    const items: ImageItem[] = Array.from({ length: 12 }, (_, i) => ({
      r2Key: `abcdefghijklmnop${i}`,
      mime: 'image/avif',
      width: 800,
      height: 600,
      byteLen: 1000,
      thumb: 't',
    }));
    const payload = encodeImage(items, 'overflow');
    const decoded = decodePayload(JSON.stringify(payload));
    if (decoded.kind !== 'image') throw new Error('expected image payload');
    expect(decoded.items.length).toBe(8);
  });
});

describe('assertPayloadFits', () => {
  it('exposes MAX_PAYLOAD_CHARS at 48 KiB (matches server relay cap)', () => {
    expect(MAX_PAYLOAD_CHARS).toBe(48 * 1024);
  });

  it('accepts a payload at exactly the cap', () => {
    const json = 'x'.repeat(MAX_PAYLOAD_CHARS);
    expect(() => assertPayloadFits(json)).not.toThrow();
  });

  it('rejects a payload one byte over the cap with PayloadTooLargeError', () => {
    const json = 'x'.repeat(MAX_PAYLOAD_CHARS + 1);
    expect(() => assertPayloadFits(json)).toThrow(PayloadTooLargeError);
    expect(() => assertPayloadFits(json)).toThrow(/too long/i);
  });
});
