import type { SupabaseClient } from "@supabase/supabase-js";
import type { GovernmentClient, GovernmentInvoice } from "../domain/government-client.ts";
import type { RateLimiter } from "../domain/rate-limiter.ts";

interface ClaimedJob {
  id: string;
  invoice_id: string;
  attempts: number;
  max_attempts: number;
}

export class SubmissionWorker {
  private readonly db: SupabaseClient;
  private readonly government: GovernmentClient;
  private readonly rateLimiter: RateLimiter;
  private readonly batchSize: number;
  private readonly leaseSeconds: number;

  constructor(
    db: SupabaseClient,
    government: GovernmentClient,
    rateLimiter: RateLimiter,
    batchSize = 5,
    leaseSeconds = 60,
  ) {
    this.db = db;
    this.government = government;
    this.rateLimiter = rateLimiter;
    this.batchSize = batchSize;
    this.leaseSeconds = leaseSeconds;
  }

  async tick(): Promise<number> {
    const jobs = await this.claimJobs();
    if (jobs.length === 0) return 0;

    await Promise.all(jobs.map((job) => this.processJob(job)));
    return jobs.length;
  }

  private async claimJobs(): Promise<ClaimedJob[]> {
    const { data, error } = await this.db.rpc("claim_submission_jobs", {
      p_batch: this.batchSize,
      p_lease_seconds: this.leaseSeconds,
    });
    if (error) throw new Error(`claim_submission_jobs failed: ${error.message}`);
    return (data ?? []) as ClaimedJob[];
  }

  private async processJob(job: ClaimedJob): Promise<void> {
    const invoice = await this.loadInvoice(job.invoice_id);
    if (!invoice) {
      await this.completeAttempt(job, "retryable_error", null, "Invoice not found", null, null);
      return;
    }

    await this.rateLimiter.acquire();
    const start = Date.now();
    const outcome = await this.government.submitInvoice(invoice);
    const durationMs = Date.now() - start;

    switch (outcome.result) {
      case "success":
        await this.completeAttempt(job, "success", outcome.httpStatus, null, durationMs, outcome.externalRef);
        break;
      case "rejected":
        await this.completeAttempt(job, "rejected", outcome.httpStatus, outcome.reason, durationMs, null);
        break;
      case "retryable_error":
        await this.completeAttempt(job, "retryable_error", outcome.httpStatus, outcome.error, durationMs, null);
        break;
      case "timeout":
        await this.completeAttempt(job, "timeout", null, outcome.error, durationMs, null);
        break;
    }
  }

  private async loadInvoice(invoiceId: string): Promise<GovernmentInvoice | null> {
    const { data: inv } = await this.db
      .from("invoices")
      .select("id, invoice_number, invoice_date, customer_name, customer_tax_id, customer_email, currency, subtotal, tax_amount, total_amount")
      .eq("id", invoiceId)
      .single();

    if (!inv) return null;

    const { data: items } = await this.db
      .from("invoice_items")
      .select("line_number, description, quantity, unit_price, tax, line_total")
      .eq("invoice_id", invoiceId)
      .order("line_number");

    return {
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number,
      invoiceDate: inv.invoice_date,
      customerName: inv.customer_name,
      customerTaxId: inv.customer_tax_id,
      customerEmail: inv.customer_email,
      currency: inv.currency,
      subtotal: inv.subtotal,
      taxAmount: inv.tax_amount,
      totalAmount: inv.total_amount,
      items: (items ?? []).map((it: Record<string, unknown>) => ({
        lineNumber: it.line_number as number,
        description: it.description as string,
        quantity: it.quantity as number,
        unitPrice: it.unit_price as number,
        tax: it.tax as number,
        lineTotal: it.line_total as number,
      })),
    };
  }

  private async completeAttempt(
    job: ClaimedJob,
    outcome: string,
    httpStatus: number | null,
    error: string | null,
    durationMs: number | null,
    externalRef: string | null,
  ): Promise<void> {
    const { error: rpcError } = await this.db.rpc("complete_submission_attempt", {
      p_job_id: job.id,
      p_invoice_id: job.invoice_id,
      p_attempt_no: job.attempts,
      p_outcome: outcome,
      p_http_status: httpStatus,
      p_error: error,
      p_duration_ms: durationMs,
      p_external_ref: externalRef,
    });
    if (rpcError) {
      console.error(`complete_submission_attempt failed for job ${job.id}:`, rpcError.message);
    }
  }
}
