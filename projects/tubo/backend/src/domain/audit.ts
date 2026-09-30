export const AUDIT_EVENT_TYPES = [
  "invoice_created",
  "invoice_submitted",
  "invoice_rejected",
  "invoice_failed",
  "invoice_retried",
  "teammate_invited",
  "teammate_joined",
] as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

// One recorded business action, shown in the audit trail.
export interface AuditEvent {
  id: string;
  event_type: AuditEventType;
  summary: string; // a formal, human-readable sentence
  metadata: Record<string, unknown>;
  created_at: string;
}

// Per-month totals behind the dashboard cards for the selected month.
export interface MonthlyTotals {
  counts: Partial<Record<string, number>>;
  total_count: number;
  total_amount: string; // exact string, e.g. "12345.00"
}

// Report shapes returned to the frontend (also used to render the printable preview).
export interface MonthlyReport {
  company: string;
  periodLabel: string;
  from: string;
  to: string;
  totalCount: number;
  totalAmount: string;
  counts: { status: string; label: string; count: number }[];
  generatedAt: string;
}

export interface AuditReport {
  company: string;
  periodLabel: string;
  from: string | null;
  to: string | null;
  events: AuditEvent[];
  generatedAt: string;
}
