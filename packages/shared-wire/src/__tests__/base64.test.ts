import { describe, expect, it } from 'bun:test';
import { base64ToBytes, bytesToBase64 } from '../base64.js';

describe('base64 helpers', () => {
  it('round-trips random bytes', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(256));
    const encoded = bytesToBase64(bytes);
    const decoded = base64ToBytes(encoded);
    expect(decoded).toEqual(bytes);
  });

  it('round-trips an empty array', () => {
    const bytes = new Uint8Array(0);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it('matches a known vector', () => {
    const bytes = new TextEncoder().encode('hello world');
    expect(bytesToBase64(bytes)).toBe('aGVsbG8gd29ybGQ=');
    expect(base64ToBytes('aGVsbG8gd29ybGQ=')).toEqual(bytes);
  });

  it('handles a payload larger than the chunk size', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(64 * 1024));
    const encoded = bytesToBase64(bytes);
    const decoded = base64ToBytes(encoded);
    expect(decoded).toEqual(bytes);
  });

  it('throws on invalid base64 input', () => {
    expect(() => base64ToBytes('not-valid!')).toThrow();
  });
});
