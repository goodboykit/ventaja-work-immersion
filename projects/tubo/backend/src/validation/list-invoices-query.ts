import { z } from "zod";
import { ValidationError } from "../domain/errors.ts";
import { INVOICE_STATUSES, type InvoiceStatus } from "../domain/invoice.ts";
import { decodeCursor, type Cursor } from "./cursor.ts";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

const listQuerySchema = z.object({
  status: z.enum(INVOICE_STATUSES).optional(),
  invoice_number: z.string().trim().min(1).max(50).optional(),
  date_from: date.optional(),
  date_to: date.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(300).optional(),
});

export interface ListFilters {
  status?: InvoiceStatus;
  invoiceNumber?: string;
  dateFrom?: string;
  dateTo?: string;
  limit: number;
  after?: Cursor;
}

export function parseListQuery(params: URLSearchParams): ListFilters {
  const result = listQuerySchema.safeParse(Object.fromEntries(params));
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
    throw new ValidationError("The query parameters are not valid", details);
  }

  const q = result.data;
  if (q.date_from && q.date_to && q.date_from > q.date_to) {
    throw new ValidationError("date_from must not be after date_to");
  }

  const filters: ListFilters = { limit: q.limit };
  if (q.status) filters.status = q.status;
  if (q.invoice_number) filters.invoiceNumber = q.invoice_number;
  if (q.date_from) filters.dateFrom = q.date_from;
  if (q.date_to) filters.dateTo = q.date_to;
  if (q.cursor) filters.after = decodeCursor(q.cursor);
  return filters;
}
