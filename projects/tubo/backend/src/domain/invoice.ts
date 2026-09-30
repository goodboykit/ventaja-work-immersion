export const INVOICE_STATUSES = ["pending", "processing", "submitted", "rejected", "failed"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

// How many invoices are in each status, plus the total.
export type StatusSummary = Record<InvoiceStatus, number> & { total: number };

export interface InvoiceItem {
  line_number: number;
  description: string;
  quantity: number;
  unit_price: number;
  tax: number;
  line_total: number;
}

export interface InvoiceSummary {
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
  status: InvoiceStatus;
  external_ref: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProcessingJob {
  status: "queued" | "processing" | "done" | "dead";
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  last_error: string | null;
}

export interface ProcessingLogEntry {
  attempt_no: number;
  outcome: "success" | "rejected" | "retryable_error" | "timeout";
  http_status: number | null;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface InvoiceDetail extends InvoiceSummary {
  items: InvoiceItem[];
  processing: {
    job: ProcessingJob | null;
    attempts: ProcessingLogEntry[];
  };
}
