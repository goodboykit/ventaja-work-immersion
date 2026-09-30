import { AppError, ValidationError } from "../domain/errors.ts";

const MAX_BODY_BYTES = 1_000_000;

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

// Runs a request handler and turns any error into a JSON error response.
// Expected errors (AppError) keep their status; anything else becomes a safe 500.
export async function respond(action: () => Promise<Response>): Promise<Response> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof AppError) {
      return json(error.status, { error: { code: error.code, message: error.message, details: error.details } });
    }
    console.error("Unexpected error while handling request", error);
    return json(500, { error: { code: "internal_error", message: "Something went wrong on our side" } });
  }
}

export async function readJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new AppError(413, "payload_too_large", "The request body is too large");
  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError("The request body must be valid JSON");
  }
}
