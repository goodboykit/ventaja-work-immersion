import { z } from "zod";
import { ValidationError } from "../domain/errors.ts";

const knownCurrencies = new Set(Intl.supportedValuesOf("currency"));

// Messages are short and stand alone, because the form shows them right under the field.
const text = (max: number) => z.string().trim().min(1, "Required").max(max, `Too long (max ${max} characters)`);

// Accepts 19.99 or "19.99" and turns both into the string "19.99" (never a float after this point).
function decimal(maxWholeDigits: number, maxFractionDigits: number) {
  const pattern = new RegExp(`^\\d{1,${maxWholeDigits}}(\\.\\d{1,${maxFractionDigits}})?$`);
  return z
    .union([z.string(), z.number()])
    .transform((value) => String(value).trim())
    .pipe(z.string().regex(pattern, `Enter a number with at most ${maxFractionDigits} decimals`));
}

const isRealDate = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const itemSchema = z.strictObject({
  description: text(500),
  quantity: decimal(9, 3).refine((v) => Number(v) > 0, "Must be greater than 0"),
  unit_price: decimal(12, 2),
  tax: decimal(12, 2).optional().default("0"),
});

export const createInvoiceSchema = z.strictObject({
  invoice_number: z.string().trim().min(1, "Required").max(50, "Too long (max 50 characters)").toUpperCase(),
  invoice_date: z.string().refine(isRealDate, "Enter a real date (YYYY-MM-DD)"),
  customer_name: text(200),
  customer_tax_id: text(50),
  customer_email: z.string().trim().max(254, "Too long (max 254 characters)").pipe(z.email("Enter a valid email address")),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .refine((code) => knownCurrencies.has(code), "Enter a valid 3-letter currency code"),
  items: z.array(itemSchema).min(1, "Add at least one item").max(500, "Too many items (max 500)"),
  // Optional: if the client sends totals, they must match what we calculate.
  subtotal: decimal(12, 2).optional(),
  tax_amount: decimal(12, 2).optional(),
  total_amount: decimal(12, 2).optional(),
});

export type CreateInvoiceInput = z.output<typeof createInvoiceSchema>;

export function parseCreateInvoice(body: unknown): CreateInvoiceInput {
  const result = createInvoiceSchema.safeParse(body);
  if (result.success) return result.data;

  const details = result.error.issues.map((issue) => ({
    field: issue.path.join(".") || "(body)",
    message: issue.message,
  }));
  throw new ValidationError("The invoice is not valid", details);
}
