import { withBackend } from "@/server/backend";

export const dynamic = "force-dynamic";

// GET is unchanged from v1 — same list endpoint
export const GET = (request: Request) => withBackend((b) => b.invoiceApiV2.listInvoices(request));
// POST uses the v2 schema (accepts due_date, notes, payment_terms, billing_address)
export const POST = (request: Request) => withBackend((b) => b.invoiceApiV2.createInvoice(request));
