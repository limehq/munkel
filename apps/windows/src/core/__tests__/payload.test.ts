import { describe, it, expect } from 'bun:test';
import { encodeChat, encodeProfile, decodePayload } from '../payload';

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
});
