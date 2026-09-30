import type { GovernmentClient, GovernmentInvoice, SubmissionOutcome } from "../domain/government-client.ts";

export class MockGovernmentClient implements GovernmentClient {
  async submitInvoice(_invoice: GovernmentInvoice): Promise<SubmissionOutcome> {
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

    return {
      result: "success",
      externalRef: `GOV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      httpStatus: 200,
    };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
