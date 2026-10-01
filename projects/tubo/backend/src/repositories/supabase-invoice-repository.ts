import type { SupabaseClient } from "@supabase/supabase-js";
import { ConflictError, NotFoundError, UnprocessableError } from "../domain/errors.ts";
import type { InvoiceDetail, InvoiceStatus, InvoiceSummary } from "../domain/invoice.ts";
import type {
  CreatedInvoice,
  InvoiceListQuery,
  InvoiceRepository,
  NewInvoice,
} from "./invoice-repository.ts";

const SUMMARY_COLUMNS =
  "id, invoice_number, invoice_date, customer_name, customer_tax_id, customer_email, currency, " +
  "subtotal, tax_amount, total_amount, status, external_ref, rejection_reason, created_at, updated_at";

const DETAIL_COLUMNS =
  `${SUMMARY_COLUMNS}, ` +
  "invoice_items(line_number, description, quantity, unit_price, tax, line_total), " +
  "submission_jobs(status, attempts, max_attempts, next_attempt_at, last_error), " +
  "processing_logs(attempt_no, outcome, http_status, error, duration_ms, created_at)";

interface DatabaseError {
  message: string;
  details?: string | null;
}

export class SupabaseInvoiceRepository implements InvoiceRepository {
  private readonly db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.db = db;
  }

  async create(invoice: NewInvoice): Promise<CreatedInvoice> {
    const { data, error } = await this.db.rpc("create_invoice", {
      p_company_id: invoice.companyId,
      p_idempotency_key: invoice.idempotencyKey,
      p_request_hash: invoice.requestHash,
      p_invoice_number: invoice.invoiceNumber,
      p_invoice_date: invoice.invoiceDate,
      p_customer_name: invoice.customerName,
      p_customer_tax_id: invoice.customerTaxId,
      p_customer_email: invoice.customerEmail,
      p_currency: invoice.currency,
      p_items: invoice.items,
    });
    if (error) throw this.translate(error);
    return data as CreatedInvoice;
  }

  async list(query: InvoiceListQuery): Promise<InvoiceSummary[]> {
    let request = this.db
      .from("invoices")
      .select(SUMMARY_COLUMNS)
      .eq("company_id", query.companyId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(query.limit);

    if (query.status) request = request.eq("status", query.status);
    if (query.invoiceNumber) request = request.eq("invoice_number", query.invoiceNumber);
    if (query.dateFrom) request = request.gte("invoice_date", query.dateFrom);
    if (query.dateTo) request = request.lte("invoice_date", query.dateTo);
    if (query.after) {
      // Rows strictly after the cursor: older, or the same time with a smaller id.
      // The cursor values were strictly validated (timestamp and uuid formats) before reaching here.
      const { createdAt, id } = query.after;
      request = request.or(`created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`);
    }

    const { data, error } = await request;
    if (error) throw this.translate(error);
    return (data ?? []) as unknown as InvoiceSummary[];
  }

  async findById(companyId: string, invoiceId: string): Promise<InvoiceDetail | null> {
    const { data, error } = await this.db
      .from("invoices")
      .select(DETAIL_COLUMNS)
      .eq("id", invoiceId)
      .eq("company_id", companyId)
      .order("line_number", { referencedTable: "invoice_items" })
      .order("attempt_no", { referencedTable: "processing_logs" })
      .maybeSingle();
    if (error) throw this.translate(error);
    if (!data) return null;

    const { invoice_items, submission_jobs, processing_logs, ...header } = data as unknown as Record<string, unknown>;
    const job = Array.isArray(submission_jobs) ? submission_jobs[0] : submission_jobs;
    return {
      ...header,
      items: invoice_items ?? [],
      processing: { job: job ?? null, attempts: processing_logs ?? [] },
    } as unknown as InvoiceDetail;
  }

  async statusCounts(companyId: string, dateFrom?: string, dateTo?: string): Promise<Partial<Record<InvoiceStatus, number>>> {
    const { data, error } = await this.db.rpc("invoice_status_counts_by_date", {
      p_company_id: companyId,
      p_from: dateFrom ?? null,
      p_to: dateTo ?? null,
    });
    if (error) throw this.translate(error);
    return (data ?? {}) as Partial<Record<InvoiceStatus, number>>;
  }

  async monthlyTotals(companyId: string, from: string, to: string): Promise<import("../domain/audit.ts").MonthlyTotals> {
    const { data, error } = await this.db.rpc("monthly_status_counts", {
      p_company_id: companyId,
      p_from: from,
      p_to: to,
    });
    if (error) throw this.translate(error);
    return data as import("../domain/audit.ts").MonthlyTotals;
  }

  async retry(companyId: string, invoiceId: string): Promise<{ id: string; status: InvoiceStatus }> {
    const { data, error } = await this.db.rpc("retry_invoice", {
      p_company_id: companyId,
      p_invoice_id: invoiceId,
    });
    if (error) throw this.translate(error);
    return data as { id: string; status: InvoiceStatus };
  }

  // The database functions raise short error names; turn them into meaningful API errors.
  private translate(error: DatabaseError): Error {
    switch (error.message) {
      case "duplicate_invoice_number":
        return new ConflictError("duplicate_invoice_number", "An invoice with this number already exists for your company");
      case "idempotency_key_reuse":
        return new UnprocessableError(
          "idempotency_key_reuse",
          "This Idempotency-Key was already used with a different invoice. Use a new key for a new invoice.",
        );
      case "invoice_not_found":
        return new NotFoundError();
      case "invoice_not_retryable":
        return new ConflictError(
          "invoice_not_retryable",
          `Only failed invoices can be retried (this invoice is ${error.details ?? "not failed"})`,
        );
      default:
        return new Error(`Database error: ${error.message}`);
    }
  }
}
