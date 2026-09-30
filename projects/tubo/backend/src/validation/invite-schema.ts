import { z } from "zod";
import { ValidationError } from "../domain/errors.ts";

export const inviteSchema = z.strictObject({
  email: z.string().trim().max(254, "Too long (max 254 characters)").pipe(z.email("Enter a valid email address")),
});

export type InviteInput = z.output<typeof inviteSchema>;

export function parseInvite(body: unknown): InviteInput {
  const result = inviteSchema.safeParse(body);
  if (result.success) return result.data;
  const details = result.error.issues.map((issue) => ({
    field: issue.path.join(".") || "(body)",
    message: issue.message,
  }));
  throw new ValidationError("The invitation is not valid", details);
}

const acceptSchema = z.strictObject({
  token: z.string().trim().min(16, "is required").max(128),
});

export function parseAcceptInvite(body: unknown): { token: string } {
  const result = acceptSchema.safeParse(body);
  if (result.success) return result.data;
  const details = result.error.issues.map((issue) => ({
    field: issue.path.join(".") || "(body)",
    message: issue.message,
  }));
  throw new ValidationError("The invite code is not valid", details);
}
