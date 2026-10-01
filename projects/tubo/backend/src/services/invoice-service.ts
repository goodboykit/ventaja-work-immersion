import type { AuthContext } from "../auth/authenticator.ts";
import { NotFoundError, ValidationError } from "../domain/errors.ts";
import { INVOICE_STATUSES, type InvoiceDetail, type InvoiceStatus, type InvoiceSummary, type StatusSummary } from "../domain/invoice.ts";
import { InvoiceTotalsCalculator } from "../domain/invoice-totals.ts";
import type { CreatedInvoice, InvoiceRepository } from "../repositories/invoice-repository.ts";
import type { CreateInvoiceInput } from "../validation/create-invoice-schema.ts";
import { encodeCursor } from "../validation/cursor.ts";
import type { ListFilters } from "../validation/list-invoices-query.ts";
import { hashInvoiceRequest } from "../validation/request-hash.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface InvoicePage {
  data: InvoiceSummary[];
  next_cursor: string | null;
}

// The business rules of the invoice API. It knows nothing about HTTP or about the database.
export class InvoiceService {
  private readonly invoices: InvoiceRepository;
  private readonly calculator: InvoiceTotalsCalculator;

  constructor(invoices: InvoiceRepository, calculator = new InvoiceTotalsCalculator()) {
    this.invoices = invoices;
    this.calculator = calculator;
  }

  async create(auth: AuthContext, idempotencyKey: string, input: CreateInvoiceInput): Promise<CreatedInvoice> {
    const totals = this.calculator.calculate(input.items);
    this.assertClientTotalsMatch(input, totals);

    return this.invoices.create({
      companyId: auth.companyId,
      idempotencyKey,
      requestHash: hashInvoiceRequest(input, totals),
      invoiceNumber: input.invoice_number,
      invoiceDate: input.invoice_date,
      customerName: input.customer_name,
      customerTaxId: input.customer_tax_id,
      customerEmail: input.customer_email,
      currency: input.currency,
      items: totals.items.map(({ description, quantity, unit_price, tax }) => ({ description, quantity, unit_price, tax })),
    });
  }

  async list(auth: AuthContext, filters: ListFilters): Promise<InvoicePage> {
    // Ask for one extra row: if it comes back, there is a next page.
    const query: Parameters<InvoiceRepository["list"]>[0] = { companyId: auth.companyId, limit: filters.limit + 1 };
    if (filters.status) query.status = filters.status;
    if (filters.invoiceNumber) query.invoiceNumber = filters.invoiceNumber;
    if (filters.dateFrom) query.dateFrom = filters.dateFrom;
    if (filters.dateTo) query.dateTo = filters.dateTo;
    if (filters.after) query.after = filters.after;

    const rows = await this.invoices.list(query);
    const hasMore = rows.length > filters.limit;
    const data = hasMore ? rows.slice(0, filters.limit) : rows;
    const last = data[data.length - 1];

    return { data, next_cursor: hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null };
  }

  async summary(auth: AuthContext, dateFrom?: string, dateTo?: string): Promise<StatusSummary> {
    const counts = await this.invoices.statusCounts(auth.companyId, dateFrom, dateTo);
    const summary = { total: 0 } as StatusSummary;
    for (const status of INVOICE_STATUSES) {
      summary[status] = counts[status] ?? 0;
      summary.total += summary[status];
    }
    return summary;
  }

  async get(auth: AuthContext, invoiceId: string): Promise<InvoiceDetail> {
    this.assertValidId(invoiceId);
    const invoice = await this.invoices.findById(auth.companyId, invoiceId);
    if (!invoice) throw new NotFoundError();
    return invoice;
  }

  async retry(auth: AuthContext, invoiceId: string): Promise<{ id: string; status: InvoiceStatus }> {
    this.assertValidId(invoiceId);
    return this.invoices.retry(auth.companyId, invoiceId);
  }

  private assertValidId(invoiceId: string): void {
    if (!UUID.test(invoiceId)) throw new NotFoundError();
  }

  private assertClientTotalsMatch(input: CreateInvoiceInput, totals: ReturnType<InvoiceTotalsCalculator["calculate"]>): void {
    const mismatches: { field: string; message: string }[] = [];
    const compare = (field: "subtotal" | "tax_amount" | "total_amount") => {
      const sent = input[field];
      if (sent !== undefined && this.toCents(sent) !== this.toCents(totals[field])) {
        mismatches.push({ field, message: `does not match the calculated value ${totals[field]}` });
      }
    };
    compare("subtotal");
    compare("tax_amount");
    compare("total_amount");
    if (mismatches.length > 0) throw new ValidationError("The totals you sent do not match the items", mismatches);
  }

  // "10" and "10.00" are the same amount.
  private toCents(value: string): bigint {
    const [whole = "0", fraction = ""] = value.split(".");
    return BigInt(whole + fraction.padEnd(2, "0"));
  }
}
