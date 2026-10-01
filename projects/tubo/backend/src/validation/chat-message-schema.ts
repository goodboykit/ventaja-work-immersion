import { z } from "zod";
import { ValidationError } from "../domain/errors.ts";

export const chatMessageSchema = z.strictObject({
  message: z.string().trim().min(1, "Message is required").max(500, "Message is too long (max 500 characters)"),
});

export type ChatMessageInput = z.output<typeof chatMessageSchema>;

export function parseChatMessage(body: unknown): ChatMessageInput {
  const result = chatMessageSchema.safeParse(body);
  if (result.success) return result.data;

  const details = result.error.issues.map((issue) => ({
    field: issue.path.join(".") || "(body)",
    message: issue.message,
  }));
  throw new ValidationError("Invalid chat message", details);
}
