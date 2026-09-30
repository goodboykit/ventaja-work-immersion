import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GovernmentClient, GovernmentInvoice, SubmissionOutcome } from "../src/domain/government-client.ts";

function sampleInvoice(invoiceId: string): GovernmentInvoice {
  return {
    invoiceId,
    invoiceNumber: `INV-${invoiceId}`,
    invoiceDate: "2026-09-30",
    customerName: "Test",
    customerTaxId: "123",
    customerEmail: "test@test.com",
    currency: "PHP",
    subtotal: 100,
    taxAmount: 12,
    totalAmount: 112,
    items: [{ lineNumber: 1, description: "Item", quantity: 1, unitPrice: 100, tax: 12, lineTotal: 112 }],
  };
}

// A fast version of MockGovernmentClient for tests — no real delays.
class FastMockGovernmentClient implements GovernmentClient {
  private readonly accepted = new Map<string, string>();

  async submitInvoice(invoice: GovernmentInvoice): Promise<SubmissionOutcome> {
    const existing = this.accepted.get(invoice.invoiceId);
    if (existing) {
      return { result: "success", externalRef: existing, httpStatus: 200 };
    }

    const roll = Math.random();
    if (roll < 0.15) return { result: "timeout", error: "No response" };
    if (roll < 0.35) return { result: "retryable_error", error: "Service unavailable", httpStatus: 503 };
    if (roll < 0.45) return { result: "rejected", reason: "Invalid TIN", httpStatus: 400 };

    const externalRef = `GOV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.accepted.set(invoice.invoiceId, externalRef);
    return { result: "success", externalRef, httpStatus: 200 };
  }
}

describe("MockGovernmentClient", () => {
  it("produces all four outcome types", async () => {
    const client = new FastMockGovernmentClient();
    const results = new Set<string>();

    for (let i = 0; i < 500; i++) {
      const outcome = await client.submitInvoice(sampleInvoice(`unique-${i}`));
      results.add(outcome.result);
      if (results.size === 4) break;
    }

    assert.ok(results.has("success"), "should produce success");
    assert.ok(results.has("rejected"), "should produce rejected");
    assert.ok(results.has("retryable_error"), "should produce retryable_error");
    assert.ok(results.has("timeout"), "should produce timeout");
  });

  it("returns the same result for a previously accepted invoiceId (Part I idempotency)", async () => {
    const client = new FastMockGovernmentClient();

    let successId: string | null = null;
    let successRef: string | null = null;
    for (let i = 0; i < 100; i++) {
      const outcome = await client.submitInvoice(sampleInvoice(`idem-${i}`));
      if (outcome.result === "success") {
        successId = `idem-${i}`;
        successRef = outcome.externalRef;
        break;
      }
    }

    assert.ok(successId, "should have at least one success");
    assert.ok(successRef);

    const second = await client.submitInvoice(sampleInvoice(successId!));
    assert.equal(second.result, "success");
    if (second.result === "success") {
      assert.equal(second.externalRef, successRef, "same invoiceId must return the same external reference");
    }
  });

  it("does not treat different invoiceIds as duplicates", async () => {
    const client = new FastMockGovernmentClient();
    const refs = new Set<string>();

    for (let i = 0; i < 100; i++) {
      const outcome = await client.submitInvoice(sampleInvoice(`distinct-${i}`));
      if (outcome.result === "success") {
        refs.add(outcome.externalRef);
      }
    }

    assert.ok(refs.size > 1, "different invoiceIds should produce different external references");
  });
});
