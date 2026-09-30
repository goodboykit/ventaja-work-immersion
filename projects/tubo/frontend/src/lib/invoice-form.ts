import { InvoiceTotalsCalculator, parseCreateInvoice, ValidationError } from "@tubo/backend/shared";
import type { CreateInvoiceBody } from "./api-client.ts";

// Everything in the form is text, exactly as typed. The backend's own rules turn it into numbers,
// so the form and the API can never disagree about what is valid.
export interface FormItem {
  key: string;
  description: string;
  quantity: string;
  unit_price: string;
  tax: string;
}

export interface InvoiceFormValues {
  invoice_number: string;
  invoice_date: string;
  customer_name: string;
  customer_tax_id: string;
  customer_email: string;
  currency: string;
  items: FormItem[];
}

// Error messages by field: "customer_email", "items.0.quantity", "items", or "form" for anything general.
export type FieldErrors = Record<string, string>;

export function newItem(key: string): FormItem {
  return { key, description: "", quantity: "1", unit_price: "", tax: "0" };
}

export function emptyForm(today: string, firstItemKey: string): InvoiceFormValues {
  return {
    invoice_number: "",
    invoice_date: today,
    customer_name: "",
    customer_tax_id: "",
    customer_email: "",
    currency: "PHP",
    items: [newItem(firstItemKey)],
  };
}

export function toRequestBody(values: InvoiceFormValues): CreateInvoiceBody {
  return {
    invoice_number: values.invoice_number.trim(),
    invoice_date: values.invoice_date,
    customer_name: values.customer_name.trim(),
    customer_tax_id: values.customer_tax_id.trim(),
    customer_email: values.customer_email.trim(),
    currency: values.currency,
    items: values.items.map((item) => ({
      description: item.description.trim(),
      quantity: item.quantity.trim(),
      unit_price: item.unit_price.trim(),
      tax: item.tax.trim() === "" ? "0" : item.tax.trim(),
    })),
  };
}

export function errorsFromDetails(details: unknown): FieldErrors {
  const errors: FieldErrors = {};
  if (!Array.isArray(details)) return errors;
  for (const detail of details) {
    const { field, message } = detail as { field?: string; message?: string };
    if (!message) continue;
    const key = !field || field === "(body)" ? "form" : field;
    errors[key] ??= message;
  }
  return errors;
}

export type FormCheck = { ok: true; body: CreateInvoiceBody } | { ok: false; errors: FieldErrors };

// Uses the same rules as the API, so a form that passes here will be accepted there.
export function checkForm(values: InvoiceFormValues): FormCheck {
  const body = toRequestBody(values);
  try {
    parseCreateInvoice(body);
    return { ok: true, body };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, errors: errorsFromDetails(error.details) };
    throw error;
  }
}

export interface LiveTotals {
  lineTotals: (string | null)[];
  subtotal: string;
  tax: string;
  total: string;
}

const QUANTITY = /^\d{1,9}(\.\d{1,3})?$/;
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const calculator = new InvoiceTotalsCalculator();

// Totals while typing. Rows that are not complete yet are skipped, so the numbers never flicker to errors.
export function liveTotals(values: InvoiceFormValues): LiveTotals {
  const usable = values.items.map((item) => {
    const tax = item.tax.trim() === "" ? "0" : item.tax.trim();
    const complete = QUANTITY.test(item.quantity.trim()) && MONEY.test(item.unit_price.trim()) && MONEY.test(tax);
    return complete ? { description: item.description, quantity: item.quantity.trim(), unit_price: item.unit_price.trim(), tax } : null;
  });

  try {
    const complete = usable.filter((item) => item !== null);
    const result = calculator.calculate(complete);
    let next = 0;
    return {
      lineTotals: usable.map((item) => (item ? result.items[next++]!.line_total : null)),
      subtotal: result.subtotal,
      tax: result.tax_amount,
      total: result.total_amount,
    };
  } catch {
    return { lineTotals: usable.map(() => null), subtotal: "0.00", tax: "0.00", total: "0.00" };
  }
}
