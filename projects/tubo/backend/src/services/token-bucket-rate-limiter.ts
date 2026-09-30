import type { RateLimiter } from "../domain/rate-limiter.ts";

/**
 * Token bucket algorithm — the classic way to limit how fast you send requests.
 *
 * How it works (imagine a bucket of tokens):
 *   - The bucket holds up to `capacity` tokens (e.g. 100).
 *   - Every second, `refillRate` new tokens are added (e.g. 100/second).
 *   - Each request costs 1 token.
 *   - If the bucket is empty, the request waits until a token appears.
 *
 * Why this is good:
 *   - Short bursts are fine (the bucket starts full).
 *   - Sustained traffic is smoothed to the limit.
 *   - Simple, predictable, and widely used in production systems.
 */
export class TokenBucketRateLimiter implements RateLimiter {
  private tokens: number;
  private lastRefillTime: number;
  private readonly capacity: number;
  private readonly refillRate: number;
  private readonly waitQueue: (() => void)[] = [];

  constructor(capacity: number, refillRate: number) {
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.tokens = capacity;
    this.lastRefillTime = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    await new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
      const waitMs = Math.ceil((1 / this.refillRate) * 1000);
      setTimeout(() => this.drainQueue(), waitMs);
    });
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefillTime) / 1000;
    const newTokens = elapsedSeconds * this.refillRate;

    if (newTokens >= 1) {
      this.tokens = Math.min(this.capacity, this.tokens + newTokens);
      this.lastRefillTime = now;
    }
  }

  private drainQueue(): void {
    this.refill();
    while (this.waitQueue.length > 0 && this.tokens >= 1) {
      this.tokens -= 1;
      const next = this.waitQueue.shift()!;
      next();
    }
  }
}
