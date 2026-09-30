import { createBackend, type Backend } from "@tubo/backend";

// Created on first use, so building the app does not require the secrets to be present.
let backend: Backend | undefined;

// Runs a route handler with the backend. If the server is not configured (for example a missing
// secret), the caller gets a clear JSON error instead of an HTML crash page.
export async function withBackend(handler: (backend: Backend) => Promise<Response>): Promise<Response> {
  try {
    backend ??= createBackend();
  } catch (error) {
    console.error("Backend is not configured", error);
    const message = error instanceof Error ? error.message : "The server is not configured";
    return Response.json({ error: { code: "server_not_configured", message } }, { status: 500 });
  }
  return handler(backend);
}
