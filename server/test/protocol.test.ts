import { describe, expect, it } from 'vitest';
import { clientMessageSchema, GROUP_ID_REGEX, MAX_PAYLOAD_CHARS, MEMBER_ID_REGEX } from '../src/protocol';

describe('clientMessageSchema', () => {
  it('accepts a broadcast send', () => {
    const result = clientMessageSchema.safeParse({ type: 'send', payload: 'aGVsbG8=' });
    expect(result.success).toBe(true);
  });

  it('accepts a direct send', () => {
    const result = clientMessageSchema.safeParse({ type: 'send', payload: 'aGVsbG8=', to: 'member-1' });
    expect(result.success).toBe(true);
  });

  it('accepts a ping', () => {
    expect(clientMessageSchema.safeParse({ type: 'ping' }).success).toBe(true);
  });

  it('rejects an empty payload', () => {
    expect(clientMessageSchema.safeParse({ type: 'send', payload: '' }).success).toBe(false);
  });

  it('rejects an oversized payload', () => {
    const payload = 'x'.repeat(MAX_PAYLOAD_CHARS + 1);
    expect(clientMessageSchema.safeParse({ type: 'send', payload }).success).toBe(false);
  });

  it('rejects unknown message types', () => {
    expect(clientMessageSchema.safeParse({ type: 'join', groupId: 'x' }).success).toBe(false);
  });

  it('rejects invalid recipient ids', () => {
    const result = clientMessageSchema.safeParse({ type: 'send', payload: 'aGVsbG8=', to: 'not valid!' });
    expect(result.success).toBe(false);
  });
});

describe('id patterns', () => {
  it('groupId must be 32 lowercase hex chars', () => {
    expect(GROUP_ID_REGEX.test('a'.repeat(32))).toBe(true);
    expect(GROUP_ID_REGEX.test('A'.repeat(32))).toBe(false);
    expect(GROUP_ID_REGEX.test('a'.repeat(31))).toBe(false);
  });

  it('memberId allows UUID-style ids', () => {
    expect(MEMBER_ID_REGEX.test('8f14e45f-ceea-467f-a187-0dadf5b51b6b')).toBe(true);
    expect(MEMBER_ID_REGEX.test('has spaces')).toBe(false);
    expect(MEMBER_ID_REGEX.test('')).toBe(false);
  });
});
