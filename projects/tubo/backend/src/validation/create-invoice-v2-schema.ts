import { z } from "zod";
import { createInvoiceSchema } from "./create-invoice-schema.ts";
import { ValidationError } from "../domain/errors.ts";

// V2 extends V1 with optional new fields that a major customer requested.
// Existing V1 fields are unchanged — any V1 payload is also a valid V2 payload.
export const createInvoiceV2Schema = createInvoiceSchema.extend({
  due_date: z
    .string()
    .refine((v) => {
      const d = new Date(`${v}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
    }, "Enter a real date (YYYY-MM-DD)")
    .optional(),
  notes: z.string().trim().max(2000, "Too long (max 2000 characters)").optional(),
  payment_terms: z.string().trim().max(100, "Too long (max 100 characters)").optional(),
  billing_address: z
    .object({
      line1: z.string().trim().max(200).optional(),
      line2: z.string().trim().max(200).optional(),
      city: z.string().trim().max(100).optional(),
      postal_code: z.string().trim().max(20).optional(),
      country: z.string().trim().max(100).optional(),
    })
    .optional(),
});

export type CreateInvoiceV2Input = z.output<typeof createInvoiceV2Schema>;

export function parseCreateInvoiceV2(body: unknown): CreateInvoiceV2Input {
  const result = createInvoiceV2Schema.safeParse(body);
  if (result.success) return result.data;

  const details = result.error.issues.map((issue) => ({
    field: issue.path.join(".") || "(body)",
    message: issue.message,
  }));
  throw new ValidationError("The invoice is not valid", details);
}
