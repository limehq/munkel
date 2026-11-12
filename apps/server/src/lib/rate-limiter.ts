/**
 * Simple token-bucket rate limiter for per-connection relay traffic.
 *
 * The bucket starts full (`burst`). Each consumed message costs one token.
 * Tokens refill continuously at `refillPerSecond`. This allows short bursts
 * (e.g. an image series on reconnect) while capping sustained throughput.
 */

export interface RateLimitState {
  /** Tokens currently available in the bucket (can be fractional). */
  tokens: number;
  /** Last time the bucket was updated (milliseconds since epoch). */
  lastUpdate: number;
}

export interface RateLimitOptions {
  /** Maximum number of tokens the bucket can hold. */
  burst: number;
  /** Tokens added per second. */
  refillPerSecond: number;
}

/**
 * Creates an initial rate-limit state with a full bucket.
 */
export function createRateLimitState(now: number, burst: number): RateLimitState {
  return { tokens: burst, lastUpdate: now };
}

/**
 * Attempts to consume one token at `now`.
 *
 * Returns whether the request is allowed and the updated state. The state
 * always advances `lastUpdate` to `now` so that repeated calls see a
 * monotonically advancing bucket.
 */
export function consume(
  state: RateLimitState,
  now: number,
  options: RateLimitOptions,
): { allowed: boolean; state: RateLimitState } {
  const elapsedSeconds = (now - state.lastUpdate) / 1000;
  const tokens = Math.min(options.burst, state.tokens + elapsedSeconds * options.refillPerSecond);

  if (tokens < 1) {
    return { allowed: false, state: { tokens, lastUpdate: now } };
  }

  return { allowed: true, state: { tokens: tokens - 1, lastUpdate: now } };
}
