import { ValidationError } from "../domain/errors.ts";

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_\-:.]{8,128}$/;

export function readIdempotencyKey(request: Request): string {
  const key = request.headers.get("idempotency-key");
  if (!key) {
    throw new ValidationError("The Idempotency-Key header is required (8-128 characters, for example a UUID)");
  }
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new ValidationError("The Idempotency-Key must be 8-128 characters: letters, digits, _ - : .");
  }
  return key;
}
