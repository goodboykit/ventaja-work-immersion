import { randomUUID } from "node:crypto";
import { ConflictError, NotFoundError, UnprocessableError } from "../../src/domain/errors.ts";
import type { InvoiceDetail, InvoiceStatus, InvoiceSummary } from "../../src/domain/invoice.ts";
import type {
  CreatedInvoice,
  InvoiceListQuery,
  InvoiceRepository,
  NewInvoice,
} from "../../src/repositories/invoice-repository.ts";

interface StoredInvoice {
  companyId: string;
  idempotencyKey: string;
  requestHash: string;
  detail: InvoiceDetail;
}

// A stand-in for the database that follows the same rules (unique number, idempotency, retry state).
export class InMemoryInvoiceRepository implements InvoiceRepository {
  private readonly stored: StoredInvoice[] = [];
  private clock = Date.parse("2026-09-30T00:00:00Z");

  async create(invoice: NewInvoice): Promise<CreatedInvoice> {
    const sameKey = this.stored.find((s) => s.companyId === invoice.companyId && s.idempotencyKey === invoice.idempotencyKey);
    if (sameKey) {
      if (sameKey.requestHash !== invoice.requestHash) throw new UnprocessableError("idempotency_key_reuse", "key reused");
      return { id: sameKey.detail.id, status: sameKey.detail.status, replayed: true };
    }
    if (this.stored.some((s) => s.companyId === invoice.companyId && s.detail.invoice_number === invoice.invoiceNumber)) {
      throw new ConflictError("duplicate_invoice_number", "duplicate number");
    }

    this.clock += 1000;
    const createdAt = new Date(this.clock).toISOString();
    const detail: InvoiceDetail = {
      id: randomUUID(),
      invoice_number: invoice.invoiceNumber,
      invoice_date: invoice.invoiceDate,
      customer_name: invoice.customerName,
      customer_tax_id: invoice.customerTaxId,
      customer_email: invoice.customerEmail,
      currency: invoice.currency,
      subtotal: 0,
      tax_amount: 0,
      total_amount: 0,
      status: "pending",
      external_ref: null,
      rejection_reason: null,
      created_at: createdAt,
      updated_at: createdAt,
      items: invoice.items.map((item, index) => ({
        line_number: index + 1,
        description: item.description,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        tax: Number(item.tax),
        line_total: 0,
      })),
      processing: {
        job: { status: "queued", attempts: 0, max_attempts: 8, next_attempt_at: createdAt, last_error: null },
        attempts: [],
      },
    };
    this.stored.push({ companyId: invoice.companyId, idempotencyKey: invoice.idempotencyKey, requestHash: invoice.requestHash, detail });
    return { id: detail.id, status: "pending", replayed: false };
  }

  async list(query: InvoiceListQuery): Promise<InvoiceSummary[]> {
    return this.stored
      .filter((s) => s.companyId === query.companyId)
      .map((s) => s.detail)
      .filter((d) => !query.status || d.status === query.status)
      .filter((d) => !query.invoiceNumber || d.invoice_number === query.invoiceNumber)
      .filter((d) => !query.dateFrom || d.invoice_date >= query.dateFrom)
      .filter((d) => !query.dateTo || d.invoice_date <= query.dateTo)
      .sort((a, b) => (a.created_at === b.created_at ? b.id.localeCompare(a.id) : b.created_at.localeCompare(a.created_at)))
      .filter((d) => {
        const after = query.after;
        if (!after) return true;
        return d.created_at < after.createdAt || (d.created_at === after.createdAt && d.id < after.id);
      })
      .slice(0, query.limit)
      .map(({ items: _items, processing: _processing, ...summary }) => summary);
  }

  async findById(companyId: string, invoiceId: string): Promise<InvoiceDetail | null> {
    return this.stored.find((s) => s.companyId === companyId && s.detail.id === invoiceId)?.detail ?? null;
  }

  async statusCounts(companyId: string, dateFrom?: string, dateTo?: string): Promise<Partial<Record<InvoiceStatus, number>>> {
    const counts: Partial<Record<InvoiceStatus, number>> = {};
    for (const s of this.stored.filter((x) => x.companyId === companyId)) {
      if (dateFrom && s.detail.invoice_date < dateFrom) continue;
      if (dateTo && s.detail.invoice_date > dateTo) continue;
      counts[s.detail.status] = (counts[s.detail.status] ?? 0) + 1;
    }
    return counts;
  }

  async monthlyTotals(companyId: string, from: string, to: string): Promise<import("../../src/domain/audit.ts").MonthlyTotals> {
    const rows = this.stored
      .filter((s) => s.companyId === companyId)
      .map((s) => s.detail)
      .filter((d) => d.invoice_date >= from && d.invoice_date <= to);
    const counts: Record<string, number> = {};
    let amount = 0;
    for (const d of rows) {
      counts[d.status] = (counts[d.status] ?? 0) + 1;
      amount += Number(d.total_amount);
    }
    return { counts, total_count: rows.length, total_amount: amount.toFixed(2) };
  }

  async retry(companyId: string, invoiceId: string): Promise<{ id: string; status: InvoiceStatus }> {
    const found = this.stored.find((s) => s.companyId === companyId && s.detail.id === invoiceId);
    if (!found) throw new NotFoundError();
    if (found.detail.status !== "failed") {
      throw new ConflictError("invoice_not_retryable", `Only failed invoices can be retried (this invoice is ${found.detail.status})`);
    }
    found.detail.status = "pending";
    return { id: invoiceId, status: "pending" };
  }

  // Test helper: pretend the worker moved an invoice to another status.
  forceStatus(invoiceId: string, status: InvoiceStatus): void {
    const found = this.stored.find((s) => s.detail.id === invoiceId);
    if (found) found.detail.status = status;
  }
}
