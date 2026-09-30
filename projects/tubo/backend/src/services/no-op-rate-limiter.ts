import type { RateLimiter } from "../domain/rate-limiter.ts";

/**
 * A rate limiter that does nothing — every request goes through immediately.
 * Used in tests and development where we don't need throttling.
 */
export class NoOpRateLimiter implements RateLimiter {
  async acquire(): Promise<void> {}
}
