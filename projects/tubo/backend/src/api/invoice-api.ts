import type { Authenticator } from "../auth/authenticator.ts";
import type { InvoiceService } from "../services/invoice-service.ts";
import { parseCreateInvoice } from "../validation/create-invoice-schema.ts";
import { readIdempotencyKey } from "../validation/idempotency-key.ts";
import { parseListQuery } from "../validation/list-invoices-query.ts";
import { json, readJsonBody, respond } from "./http.ts";

// Turns HTTP requests into service calls and results into HTTP responses.
// Uses the standard web Request/Response, so it works in Next.js and in plain tests.
export class InvoiceApi {
  private readonly authenticator: Authenticator;
  private readonly service: InvoiceService;

  constructor(authenticator: Authenticator, service: InvoiceService) {
    this.authenticator = authenticator;
    this.service = service;
  }

  // POST /api/invoices
  createInvoice(request: Request): Promise<Response> {
    return respond(async () => {
      const auth = await this.authenticator.authenticate(request);
      const idempotencyKey = readIdempotencyKey(request);
      const input = parseCreateInvoice(await readJsonBody(request));

      const created = await this.service.create(auth, idempotencyKey, input);
      const location = { Location: `/api/invoices/${created.id}` };

      return created.replayed
        ? json(200, { data: created }, { ...location, "Idempotent-Replayed": "true" })
        : json(201, { data: created }, location);
    });
  }

  // GET /api/invoices
  listInvoices(request: Request): Promise<Response> {
    return respond(async () => {
      const auth = await this.authenticator.authenticate(request);
      const filters = parseListQuery(new URL(request.url).searchParams);
      return json(200, await this.service.list(auth, filters));
    });
  }

  // GET /api/invoices/summary: how many invoices are in each status (for the dashboard cards)
  getSummary(request: Request): Promise<Response> {
    return respond(async () => {
      const auth = await this.authenticator.authenticate(request);
      return json(200, { data: await this.service.summary(auth) });
    });
  }

  // GET /api/invoices/{id}
  getInvoice(request: Request, invoiceId: string): Promise<Response> {
    return respond(async () => {
      const auth = await this.authenticator.authenticate(request);
      return json(200, { data: await this.service.get(auth, invoiceId) });
    });
  }

  // POST /api/invoices/{id}/retry
  retryInvoice(request: Request, invoiceId: string): Promise<Response> {
    return respond(async () => {
      const auth = await this.authenticator.authenticate(request);
      return json(202, { data: await this.service.retry(auth, invoiceId) });
    });
  }
}
