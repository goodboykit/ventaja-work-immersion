import { createHash } from "node:crypto";
import type { CalculatedTotals } from "../domain/invoice-totals.ts";
import type { CreateInvoiceInput } from "./create-invoice-schema.ts";

// A fingerprint of what the client asked for. If the same Idempotency-Key arrives with a
// different fingerprint, the client has made a mistake and we refuse instead of guessing.
export function hashInvoiceRequest(input: CreateInvoiceInput, totals: CalculatedTotals): string {
  const canonical = JSON.stringify([
    input.invoice_number,
    input.invoice_date,
    input.customer_name,
    input.customer_tax_id,
    input.customer_email.toLowerCase(),
    input.currency,
    totals.items.map((i) => [i.description, i.quantity, i.unit_price, i.tax]),
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}
