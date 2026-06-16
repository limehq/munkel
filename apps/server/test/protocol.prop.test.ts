import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { clientMessageSchema, MAX_PAYLOAD_CHARS, MEMBER_ID_REGEX } from '../src/protocol';

// Property-based ("fuzz") tests for the wire-protocol parser. clientMessageSchema
// runs on every untrusted client frame before any routing, so it is the relay's
// first line of defense against malformed or hostile input. Unit tests pin down
// specific cases; these properties feed the parser large random/adversarial inputs
// and assert invariants that hold for *all* of them.

const MEMBER_ID_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'.split('');

/** Strings that always satisfy MEMBER_ID_REGEX (`^[A-Za-z0-9_-]{1,64}$`). */
const memberIdArb = fc
  .array(fc.constantFrom(...MEMBER_ID_ALPHABET), { minLength: 1, maxLength: 64 })
  .map((chars) => chars.join(''));

describe('clientMessageSchema (property-based)', () => {
  it('safeParse is total — it never throws on arbitrary input', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const result = clientMessageSchema.safeParse(input);
        expect(typeof result.success).toBe('boolean');
      }),
    );
  });

  it('accepts any in-bounds payload with an optional valid recipient, and round-trips it', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 512 }),
        fc.option(memberIdArb, { nil: undefined }),
        (payload, to) => {
          const frame = to === undefined ? { type: 'send', payload } : { type: 'send', payload, to };
          const result = clientMessageSchema.safeParse(frame);
          expect(result.success).toBe(true);
          if (result.success && result.data.type === 'send') {
            expect(result.data.payload).toBe(payload);
            expect(result.data.to).toBe(to);
          }
        },
      ),
    );
  });

  it('accepts a recipient if and only if it matches MEMBER_ID_REGEX', () => {
    fc.assert(
      fc.property(fc.string(), (to) => {
        const result = clientMessageSchema.safeParse({ type: 'send', payload: 'aGVsbG8=', to });
        expect(result.success).toBe(MEMBER_ID_REGEX.test(to));
      }),
    );
  });

  it('rejects oversized payloads regardless of contents', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 16 }), (filler) => {
        const payload = filler.repeat(Math.ceil((MAX_PAYLOAD_CHARS + 1) / filler.length));
        expect(payload.length).toBeGreaterThan(MAX_PAYLOAD_CHARS);
        expect(clientMessageSchema.safeParse({ type: 'send', payload }).success).toBe(false);
      }),
    );
  });
});
