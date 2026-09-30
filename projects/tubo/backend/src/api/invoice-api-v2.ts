import type { Authenticator } from "../auth/authenticator.ts";
import type { InvoiceService } from "../services/invoice-service.ts";
import { parseCreateInvoiceV2 } from "../validation/create-invoice-v2-schema.ts";
import { readIdempotencyKey } from "../validation/idempotency-key.ts";
import { json, readJsonBody, respond } from "./http.ts";
import { InvoiceApi } from "./invoice-api.ts";

// V2 inherits every endpoint from V1. The only difference is createInvoice,
// which accepts additional optional fields (due_date, notes, payment_terms,
// billing_address). All other endpoints (list, get, retry, summary) are identical.
export class InvoiceApiV2 extends InvoiceApi {
  constructor(authenticator: Authenticator, service: InvoiceService) {
    super(authenticator, service);
  }

  override createInvoice(request: Request): Promise<Response> {
    return respond(async () => {
      const auth = await this.authenticateRequest(request);
      const idempotencyKey = readIdempotencyKey(request);
      const input = parseCreateInvoiceV2(await readJsonBody(request));

      const created = await this.service.create(auth, idempotencyKey, input);
      const location = { Location: `/api/v2/invoices/${created.id}` };

      return created.replayed
        ? json(200, { data: created }, { ...location, "Idempotent-Replayed": "true" })
        : json(201, { data: created }, location);
    });
  }
}
