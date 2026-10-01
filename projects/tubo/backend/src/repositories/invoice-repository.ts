import type { MonthlyTotals } from "../domain/audit.ts";
import type { InvoiceDetail, InvoiceStatus, InvoiceSummary } from "../domain/invoice.ts";
import type { ItemInput } from "../domain/invoice-totals.ts";
import type { Cursor } from "../validation/cursor.ts";

export interface NewInvoice {
  companyId: string;
  idempotencyKey: string;
  requestHash: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  customerTaxId: string;
  customerEmail: string;
  currency: string;
  items: ItemInput[];
}

export interface CreatedInvoice {
  id: string;
  status: InvoiceStatus;
  replayed: boolean;
}

export interface InvoiceListQuery {
  companyId: string;
  status?: InvoiceStatus;
  invoiceNumber?: string;
  dateFrom?: string;
  dateTo?: string;
  limit: number;
  after?: Cursor;
}

// The only place that knows how invoices are stored. Every method is scoped to one company.
// Implementations throw AppError subclasses (ConflictError, NotFoundError, ...) for expected failures.
export interface InvoiceRepository {
  create(invoice: NewInvoice): Promise<CreatedInvoice>;
  list(query: InvoiceListQuery): Promise<InvoiceSummary[]>;
  findById(companyId: string, invoiceId: string): Promise<InvoiceDetail | null>;
  statusCounts(companyId: string, dateFrom?: string, dateTo?: string): Promise<Partial<Record<InvoiceStatus, number>>>;
  monthlyTotals(companyId: string, from: string, to: string): Promise<MonthlyTotals>;
  retry(companyId: string, invoiceId: string): Promise<{ id: string; status: InvoiceStatus }>;
}
