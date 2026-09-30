import { withBackend } from "@/server/backend";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withBackend((b) => b.invoiceApiV2.getInvoice(request, id));
}
