import { describe, expect, it } from 'vitest';
import { consume, createRateLimitState } from '../src/lib/rate-limiter';

const OPTIONS = { burst: 10, refillPerSecond: 1 };

describe('rate-limiter', () => {
  it('allows messages while tokens remain', () => {
    const now = 0;
    let state = createRateLimitState(now, OPTIONS.burst);

    for (let i = 0; i < OPTIONS.burst; i++) {
      const result = consume(state, now, OPTIONS);
      expect(result.allowed).toBe(true);
      state = result.state;
    }

    expect(state.tokens).toBe(0);
  });

  it('blocks messages once the bucket is empty', () => {
    const now = 0;
    let state = createRateLimitState(now, OPTIONS.burst);

    for (let i = 0; i < OPTIONS.burst; i++) {
      const result = consume(state, now, OPTIONS);
      expect(result.allowed).toBe(true);
      state = result.state;
    }

    const blocked = consume(state, now, OPTIONS);
    expect(blocked.allowed).toBe(false);
  });

  it('refills tokens over time', () => {
    const now = 0;
    let state = createRateLimitState(now, OPTIONS.burst);

    // Exhaust the bucket.
    for (let i = 0; i < OPTIONS.burst; i++) {
      const result = consume(state, now, OPTIONS);
      state = result.state;
    }

    // Wait long enough to gain one token back.
    const later = now + 1000;
    const result = consume(state, later, OPTIONS);
    expect(result.allowed).toBe(true);
    expect(result.state.tokens).toBeCloseTo(0, 5);
  });

  it('does not exceed the burst cap after a long idle period', () => {
    const now = 0;
    let state = createRateLimitState(now, OPTIONS.burst);

    const later = now + 1_000_000;
    const result = consume(state, later, OPTIONS);
    expect(result.allowed).toBe(true);
    expect(result.state.tokens).toBe(OPTIONS.burst - 1);
  });

  it('advances lastUpdate on every call even when blocked', () => {
    const now = 0;
    let state = createRateLimitState(now, OPTIONS.burst);

    for (let i = 0; i < OPTIONS.burst; i++) {
      state = consume(state, now, OPTIONS).state;
    }

    const later = 500;
    const blocked = consume(state, later, OPTIONS);
    expect(blocked.allowed).toBe(false);
    expect(blocked.state.lastUpdate).toBe(later);
  });
});
