import { z } from "zod";
import { ValidationError } from "../domain/errors.ts";

export const registerCompanySchema = z.strictObject({
  name: z.string().trim().min(1, "is required").max(200),
  tax_id: z
    .string()
    .trim()
    .min(3, "must be at least 3 characters")
    .max(50)
    .regex(/^[A-Za-z0-9][A-Za-z0-9\- ]*$/, "may only contain letters, digits, spaces and hyphens"),
});

export type RegisterCompanyInput = z.output<typeof registerCompanySchema>;

export function parseRegisterCompany(body: unknown): RegisterCompanyInput {
  const result = registerCompanySchema.safeParse(body);
  if (result.success) return result.data;

  const details = result.error.issues.map((issue) => ({
    field: issue.path.join(".") || "(body)",
    message: issue.message,
  }));
  throw new ValidationError("The company details are not valid", details);
}
