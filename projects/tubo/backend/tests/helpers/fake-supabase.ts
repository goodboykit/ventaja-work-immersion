import type { SupabaseClient } from "@supabase/supabase-js";

interface StoredInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  customer_name: string;
  customer_tax_id: string;
  customer_email: string;
  currency: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
}

interface StoredItem {
  invoice_id: string;
  line_number: number;
  description: string;
  quantity: number;
  unit_price: number;
  tax: number;
  line_total: number;
}

interface StoredJob {
  id: string;
  invoice_id: string;
  status: string;
  attempts: number;
  max_attempts: number;
}

interface CompletedAttempt {
  jobId: string;
  invoiceId: string;
  attemptNo: number;
  outcome: string;
  httpStatus: number | null;
  error: string | null;
  durationMs: number | null;
  externalRef: string | null;
}

export class FakeSupabase {
  readonly invoices: StoredInvoice[] = [];
  readonly items: StoredItem[] = [];
  readonly jobs: StoredJob[] = [];
  readonly completedAttempts: CompletedAttempt[] = [];
  claimCallCount = 0;

  addInvoice(id: string) {
    this.invoices.push({
      id,
      invoice_number: `INV-${id}`,
      invoice_date: "2026-09-30",
      customer_name: "Test Customer",
      customer_tax_id: "123-456-789",
      customer_email: "test@example.com",
      currency: "PHP",
      subtotal: 100,
      tax_amount: 12,
      total_amount: 112,
    });
    this.items.push({
      invoice_id: id,
      line_number: 1,
      description: "Test item",
      quantity: 1,
      unit_price: 100,
      tax: 12,
      line_total: 112,
    });
    this.jobs.push({
      id: `job-${id}`,
      invoice_id: id,
      status: "queued",
      attempts: 1,
      max_attempts: 15,
    });
  }

  asClient(): SupabaseClient {
    const self = this;

    const chainable = (table: string) => {
      let filters: Record<string, string> = {};
      let selectFields = "*";
      let singleMode = false;
      let orderCol = "";

      const chain: Record<string, unknown> = {
        select(fields: string) { selectFields = fields; return chain; },
        eq(col: string, val: string) { filters[col] = val; return chain; },
        order(col: string) { orderCol = col; return chain; },
        single() { singleMode = true; return chain; },
        then(resolve: (v: unknown) => void) {
          const rows = table === "invoices"
            ? self.invoices.filter((r) => (!filters.id || r.id === filters.id))
            : self.items.filter((r) => (!filters.invoice_id || r.invoice_id === filters.invoice_id));

          if (singleMode) {
            resolve({ data: rows[0] ?? null, error: null });
          } else {
            resolve({ data: rows, error: null });
          }
        },
      };
      return chain;
    };

    return {
      from: (table: string) => chainable(table),
      rpc: (fn: string, params: Record<string, unknown>) => {
        if (fn === "claim_submission_jobs") {
          self.claimCallCount++;
          const batch = params.p_batch as number;
          const claimed = self.jobs
            .filter((j) => j.status === "queued")
            .slice(0, batch)
            .map((j) => { j.status = "processing"; return { ...j }; });
          return Promise.resolve({ data: claimed, error: null });
        }
        if (fn === "complete_submission_attempt") {
          self.completedAttempts.push({
            jobId: params.p_job_id as string,
            invoiceId: params.p_invoice_id as string,
            attemptNo: params.p_attempt_no as number,
            outcome: params.p_outcome as string,
            httpStatus: params.p_http_status as number | null,
            error: params.p_error as string | null,
            durationMs: params.p_duration_ms as number | null,
            externalRef: params.p_external_ref as string | null,
          });
          return Promise.resolve({ error: null });
        }
        return Promise.resolve({ data: null, error: { message: `Unknown RPC: ${fn}` } });
      },
    } as unknown as SupabaseClient;
  }
}
