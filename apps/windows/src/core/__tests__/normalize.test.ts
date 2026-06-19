import { describe, it, expect } from 'bun:test';
import { normalizeCircleCode } from '../normalize';

describe('normalizeCircleCode', () => {
  it('trims whitespace and lowercases', () => {
    expect(normalizeCircleCode('  Blue-Table-42  ')).toBe('blue-table-42');
  });

  it('applies Unicode NFC normalization', () => {
    // é as e + combining acute accent → precomposed é
    expect(normalizeCircleCode('blue-\u0065\u0301-table')).toBe('blue-é-table');
  });

  it('throws for empty input', () => {
    expect(() => normalizeCircleCode('   ')).toThrow('empty after normalization');
  });
});
