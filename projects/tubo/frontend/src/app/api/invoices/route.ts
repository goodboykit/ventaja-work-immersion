import { withBackend } from "@/server/backend";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => withBackend((b) => b.invoiceApi.listInvoices(request));
export const POST = (request: Request) => withBackend((b) => b.invoiceApi.createInvoice(request));
