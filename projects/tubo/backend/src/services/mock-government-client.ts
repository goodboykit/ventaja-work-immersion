import type { GovernmentClient, GovernmentInvoice, SubmissionOutcome } from "../domain/government-client.ts";

/**
 * Simulates a government invoicing service.
 *
 * Key behaviour for Part I (crash recovery):
 *   The government remembers every invoice ID it accepted. If Tubo crashes after
 *   the government said "success" but before Tubo records it, the worker will
 *   resend the same invoice. The government sees the same invoiceId and returns
 *   the SAME external reference — no duplicate is created.
 */
export class MockGovernmentClient implements GovernmentClient {
  private readonly accepted = new Map<string, string>();

  async submitInvoice(invoice: GovernmentInvoice): Promise<SubmissionOutcome> {
    const existing = this.accepted.get(invoice.invoiceId);
    if (existing) {
      await delay(100);
      return { result: "success", externalRef: existing, httpStatus: 200 };
    }

    const roll = Math.random();

    if (roll < 0.15) {
      await delay(35_000);
      return { result: "timeout", error: "The government service did not respond within 30 seconds" };
    }

    await delay(200 + Math.random() * 800);

    if (roll < 0.35) {
      return { result: "retryable_error", error: "Service temporarily unavailable", httpStatus: 503 };
    }

    if (roll < 0.45) {
      return { result: "rejected", reason: "Invalid customer TIN format", httpStatus: 400 };
    }

    const externalRef = `GOV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.accepted.set(invoice.invoiceId, externalRef);
    return { result: "success", externalRef, httpStatus: 200 };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
