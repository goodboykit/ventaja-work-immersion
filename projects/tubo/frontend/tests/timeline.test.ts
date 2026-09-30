import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { InvoiceDetail, ProcessingLogEntry } from "@tubo/backend/shared";
import { buildTimeline, describeFailure } from "../src/lib/timeline.ts";

function detail(overrides: Partial<InvoiceDetail> = {}, attempts: ProcessingLogEntry[] = []): InvoiceDetail {
  return {
    id: "i1",
    invoice_number: "INV-1",
    invoice_date: "2026-09-30",
    customer_name: "C",
    customer_tax_id: "T",
    customer_email: "c@d.co",
    currency: "PHP",
    subtotal: 10,
    tax_amount: 0,
    total_amount: 10,
    status: "pending",
    external_ref: null,
    rejection_reason: null,
    created_at: "2026-09-30T00:00:00.000000+00:00",
    updated_at: "2026-09-30T00:05:00.000000+00:00",
    items: [],
    processing: {
      job: { status: "queued", attempts: attempts.length, max_attempts: 8, next_attempt_at: "2026-09-30T00:10:00.000000+00:00", last_error: null },
      attempts,
    },
    ...overrides,
  };
}

const attempt = (n: number, outcome: ProcessingLogEntry["outcome"], extra: Partial<ProcessingLogEntry> = {}): ProcessingLogEntry => ({
  attempt_no: n,
  outcome,
  http_status: null,
  error: null,
  duration_ms: null,
  created_at: `2026-09-30T00:0${n}:00.000000+00:00`,
  ...extra,
});

describe("buildTimeline", () => {
  it("always starts with the invoice being received", () => {
    const events = buildTimeline(detail());
    assert.equal(events[0]!.title, "Invoice received");
    assert.equal(events.length, 1);
  });

  it("explains each kind of attempt", () => {
    const events = buildTimeline(
      detail({ status: "submitted" }, [
        attempt(1, "timeout", { duration_ms: 30000 }),
        attempt(2, "retryable_error", { http_status: 503, error: "Service unavailable" }),
        attempt(3, "success", { http_status: 200, duration_ms: 420 }),
      ]),
    );
    assert.deepEqual(events.slice(1).map((e) => e.tone), ["warning", "warning", "success"]);
    assert.match(events[1]!.description, /timed out in 30\.0 s/);
    assert.match(events[2]!.description, /Attempt 2 \(HTTP 503\): Service unavailable/);
    assert.match(events[3]!.description, /succeeded \(HTTP 200\) in 420 ms/);
  });

  it("shows a rejection as an error with the reason", () => {
    const events = buildTimeline(detail({ status: "rejected" }, [attempt(1, "rejected", { http_status: 422, error: "Invalid customer TIN" })]));
    assert.equal(events[1]!.tone, "error");
    assert.match(events[1]!.description, /Invalid customer TIN/);
  });

  it("orders attempts by attempt number even if they arrive shuffled", () => {
    const events = buildTimeline(detail({}, [attempt(2, "timeout"), attempt(1, "timeout")]));
    assert.match(events[1]!.description, /Attempt 1/);
    assert.match(events[2]!.description, /Attempt 2/);
  });

  it("announces the next scheduled attempt for a queued invoice that already tried", () => {
    const events = buildTimeline(detail({}, [attempt(1, "retryable_error")]));
    const last = events[events.length - 1]!;
    assert.equal(last.title, "Next attempt scheduled");
    assert.equal(last.description, "Attempt 2 of 8.");
  });

  it("says when delivery failed for good", () => {
    const events = buildTimeline(detail({ status: "failed" }, [attempt(1, "timeout")]));
    assert.equal(events[events.length - 1]!.title, "Delivery failed");
  });
});

describe("describeFailure", () => {
  it("prefers the job's last error", () => {
    const invoice = detail({ status: "failed" }, [attempt(1, "timeout", { error: "attempt error" })]);
    invoice.processing.job!.last_error = "Gateway timeout";
    assert.equal(describeFailure(invoice), "Gateway timeout");
  });

  it("falls back to the latest attempt's error", () => {
    const invoice = detail({ status: "failed" }, [attempt(1, "timeout", { error: "old" }), attempt(2, "retryable_error", { error: "newest" })]);
    assert.equal(describeFailure(invoice), "newest");
  });

  it("has a sensible default", () => {
    assert.match(describeFailure(detail({ status: "failed" })), /could not be reached/);
  });
});
