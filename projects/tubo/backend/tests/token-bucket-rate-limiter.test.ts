import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TokenBucketRateLimiter } from "../src/services/token-bucket-rate-limiter.ts";
import { NoOpRateLimiter } from "../src/services/no-op-rate-limiter.ts";

describe("TokenBucketRateLimiter", () => {
  it("allows requests up to the capacity without waiting", async () => {
    const limiter = new TokenBucketRateLimiter(5, 5);
    const start = Date.now();

    for (let i = 0; i < 5; i++) {
      await limiter.acquire();
    }

    const elapsed = Date.now() - start;
    assert.ok(elapsed < 50, `should be near-instant but took ${elapsed}ms`);
  });

  it("makes requests wait once the bucket is empty", async () => {
    const limiter = new TokenBucketRateLimiter(2, 10);

    await limiter.acquire();
    await limiter.acquire();

    const start = Date.now();
    await limiter.acquire();
    const elapsed = Date.now() - start;

    assert.ok(elapsed >= 50, `should have waited but only took ${elapsed}ms`);
  });

  it("refills tokens over time", async () => {
    const limiter = new TokenBucketRateLimiter(2, 100);

    await limiter.acquire();
    await limiter.acquire();

    await new Promise((r) => setTimeout(r, 50));

    const start = Date.now();
    await limiter.acquire();
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 50, `tokens should have refilled but took ${elapsed}ms`);
  });

  it("never exceeds the capacity", async () => {
    const limiter = new TokenBucketRateLimiter(3, 100);
    await new Promise((r) => setTimeout(r, 100));

    const start = Date.now();
    for (let i = 0; i < 3; i++) {
      await limiter.acquire();
    }
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 50, `first 3 should be instant but took ${elapsed}ms`);

    const start2 = Date.now();
    await limiter.acquire();
    const elapsed2 = Date.now() - start2;
    assert.ok(elapsed2 >= 5, `4th should wait but took ${elapsed2}ms`);
  });
});

describe("NoOpRateLimiter", () => {
  it("never blocks", async () => {
    const limiter = new NoOpRateLimiter();
    const start = Date.now();

    for (let i = 0; i < 100; i++) {
      await limiter.acquire();
    }

    const elapsed = Date.now() - start;
    assert.ok(elapsed < 50, `should be instant but took ${elapsed}ms`);
  });
});
