// Everything the browser and the server both use. It must stay free of server-only code
// (no database, no Node built-ins), so the frontend can import it safely.
// Sharing the totals calculator and the validation rules means the form and the API can never disagree.
export { INVOICE_STATUSES } from "./domain/invoice.ts";
export type {
  InvoiceDetail,
  InvoiceItem,
  InvoiceStatus,
  InvoiceSummary,
  ProcessingJob,
  ProcessingLogEntry,
  StatusSummary,
} from "./domain/invoice.ts";
export type { Company, Invitation, Profile } from "./domain/company.ts";
export { InvoiceTotalsCalculator } from "./domain/invoice-totals.ts";
export { createInvoiceSchema, parseCreateInvoice } from "./validation/create-invoice-schema.ts";
export type { CreateInvoiceInput } from "./validation/create-invoice-schema.ts";
export { parseRegisterCompany } from "./validation/register-company-schema.ts";
export type { RegisterCompanyInput } from "./validation/register-company-schema.ts";
export { ValidationError } from "./domain/errors.ts";
