import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GovernmentClient, GovernmentInvoice, SubmissionOutcome } from "../src/domain/government-client.ts";
import { SubmissionWorker } from "../src/services/submission-worker.ts";
import { NoOpRateLimiter } from "../src/services/no-op-rate-limiter.ts";
import { TokenBucketRateLimiter } from "../src/services/token-bucket-rate-limiter.ts";
import { FakeSupabase } from "./helpers/fake-supabase.ts";

class SpyGovernmentClient implements GovernmentClient {
  readonly received: GovernmentInvoice[] = [];
  private response: SubmissionOutcome = { result: "success", externalRef: "GOV-001", httpStatus: 200 };

  setResponse(r: SubmissionOutcome) { this.response = r; }

  async submitInvoice(invoice: GovernmentInvoice): Promise<SubmissionOutcome> {
    this.received.push(invoice);
    return this.response;
  }
}

describe("SubmissionWorker", () => {
  it("returns 0 when there are no queued jobs", async () => {
    const db = new FakeSupabase();
    const gov = new SpyGovernmentClient();
    const worker = new SubmissionWorker(db.asClient(), gov, new NoOpRateLimiter());

    const processed = await worker.tick();

    assert.equal(processed, 0);
    assert.equal(gov.received.length, 0);
  });

  it("processes a single job and records success", async () => {
    const db = new FakeSupabase();
    db.addInvoice("inv-1");
    const gov = new SpyGovernmentClient();
    const worker = new SubmissionWorker(db.asClient(), gov, new NoOpRateLimiter());

    const processed = await worker.tick();

    assert.equal(processed, 1);
    assert.equal(gov.received.length, 1);
    assert.equal(gov.received[0]!.invoiceId, "inv-1");
    assert.equal(db.completedAttempts.length, 1);
    assert.equal(db.completedAttempts[0]!.outcome, "success");
    assert.equal(db.completedAttempts[0]!.externalRef, "GOV-001");
  });

  it("processes multiple jobs in one tick (batch processing)", async () => {
    const db = new FakeSupabase();
    db.addInvoice("inv-1");
    db.addInvoice("inv-2");
    db.addInvoice("inv-3");
    const gov = new SpyGovernmentClient();
    const worker = new SubmissionWorker(db.asClient(), gov, new NoOpRateLimiter(), 10);

    const processed = await worker.tick();

    assert.equal(processed, 3);
    assert.equal(gov.received.length, 3);
    assert.equal(db.completedAttempts.length, 3);
  });

  it("respects the batch size limit", async () => {
    const db = new FakeSupabase();
    for (let i = 1; i <= 10; i++) db.addInvoice(`inv-${i}`);
    const gov = new SpyGovernmentClient();
    const worker = new SubmissionWorker(db.asClient(), gov, new NoOpRateLimiter(), 3);

    const processed = await worker.tick();

    assert.equal(processed, 3, "should only claim batchSize jobs per tick");
    assert.equal(gov.received.length, 3);
  });

  it("records a rejected outcome correctly", async () => {
    const db = new FakeSupabase();
    db.addInvoice("inv-1");
    const gov = new SpyGovernmentClient();
    gov.setResponse({ result: "rejected", reason: "Invalid TIN", httpStatus: 400 });
    const worker = new SubmissionWorker(db.asClient(), gov, new NoOpRateLimiter());

    await worker.tick();

    assert.equal(db.completedAttempts[0]!.outcome, "rejected");
    assert.equal(db.completedAttempts[0]!.error, "Invalid TIN");
    assert.equal(db.completedAttempts[0]!.httpStatus, 400);
  });

  it("records a retryable error correctly", async () => {
    const db = new FakeSupabase();
    db.addInvoice("inv-1");
    const gov = new SpyGovernmentClient();
    gov.setResponse({ result: "retryable_error", error: "Service unavailable", httpStatus: 503 });
    const worker = new SubmissionWorker(db.asClient(), gov, new NoOpRateLimiter());

    await worker.tick();

    assert.equal(db.completedAttempts[0]!.outcome, "retryable_error");
    assert.equal(db.completedAttempts[0]!.error, "Service unavailable");
    assert.equal(db.completedAttempts[0]!.httpStatus, 503);
  });

  it("records a timeout correctly", async () => {
    const db = new FakeSupabase();
    db.addInvoice("inv-1");
    const gov = new SpyGovernmentClient();
    gov.setResponse({ result: "timeout", error: "No response" });
    const worker = new SubmissionWorker(db.asClient(), gov, new NoOpRateLimiter());

    await worker.tick();

    assert.equal(db.completedAttempts[0]!.outcome, "timeout");
    assert.equal(db.completedAttempts[0]!.httpStatus, null);
  });

  it("handles missing invoice gracefully", async () => {
    const db = new FakeSupabase();
    db.jobs.push({ id: "job-ghost", invoice_id: "nonexistent", status: "queued", attempts: 1, max_attempts: 15 });
    const gov = new SpyGovernmentClient();
    const worker = new SubmissionWorker(db.asClient(), gov, new NoOpRateLimiter());

    const processed = await worker.tick();

    assert.equal(processed, 1);
    assert.equal(gov.received.length, 0, "should not call the government for a missing invoice");
    assert.equal(db.completedAttempts[0]!.outcome, "retryable_error");
    assert.equal(db.completedAttempts[0]!.error, "Invoice not found");
  });

  it("sends the invoiceId to the government (crash recovery key)", async () => {
    const db = new FakeSupabase();
    db.addInvoice("inv-42");
    const gov = new SpyGovernmentClient();
    const worker = new SubmissionWorker(db.asClient(), gov, new NoOpRateLimiter());

    await worker.tick();

    assert.equal(gov.received[0]!.invoiceId, "inv-42");
  });

  it("calls rateLimiter.acquire before each government submission", async () => {
    const db = new FakeSupabase();
    db.addInvoice("inv-1");
    db.addInvoice("inv-2");

    let acquireCount = 0;
    const countingLimiter = {
      async acquire() { acquireCount++; },
    };

    const gov = new SpyGovernmentClient();
    const worker = new SubmissionWorker(db.asClient(), gov, countingLimiter, 10);

    await worker.tick();

    assert.equal(acquireCount, 2, "acquire() should be called once per job");
  });

  it("rate limiter actually throttles submissions", async () => {
    const db = new FakeSupabase();
    db.addInvoice("inv-1");
    db.addInvoice("inv-2");
    db.addInvoice("inv-3");

    let acquireCalls = 0;
    let waitedMs = 0;
    const slowLimiter = {
      async acquire() {
        acquireCalls++;
        if (acquireCalls > 1) {
          await new Promise((r) => setTimeout(r, 30));
          waitedMs += 30;
        }
      },
    };

    const gov = new SpyGovernmentClient();
    const worker = new SubmissionWorker(db.asClient(), gov, slowLimiter, 5);

    await worker.tick();

    assert.equal(gov.received.length, 3);
    assert.equal(acquireCalls, 3, "acquire() called once per job");
    assert.ok(waitedMs >= 60, "rate limiter introduced waiting time");
  });
});
