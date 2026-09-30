import type { AuditEvent, AuditReport, MonthlyReport, MonthlyTotals } from "../domain/audit.ts";
import type { AuditRepository } from "../repositories/audit-repository.ts";
import type { InvoiceRepository } from "../repositories/invoice-repository.ts";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  processing: "Processing",
  submitted: "Submitted",
  rejected: "Rejected",
  failed: "Failed",
};

// Reads the audit trail and builds report data. Report TEXT is fixed and formal (never AI-generated).
export class AuditService {
  private readonly audit: AuditRepository;
  private readonly invoices: InvoiceRepository;

  constructor(audit: AuditRepository, invoices: InvoiceRepository) {
    this.audit = audit;
    this.invoices = invoices;
  }

  listEvents(companyId: string, from: string | null, to: string | null, limit = 200): Promise<AuditEvent[]> {
    return this.audit.list(companyId, from, to, limit);
  }

  async monthlyReport(companyName: string, companyId: string, month: string): Promise<MonthlyReport> {
    const { from, to, label } = monthRange(month);
    const totals: MonthlyTotals = await this.invoices.monthlyTotals(companyId, from, to);
    const counts = Object.keys(STATUS_LABELS).map((status) => ({
      status,
      label: STATUS_LABELS[status]!,
      count: totals.counts[status] ?? 0,
    }));
    return {
      company: companyName,
      periodLabel: label,
      from,
      to,
      totalCount: totals.total_count,
      totalAmount: totals.total_amount,
      counts,
      generatedAt: new Date().toISOString(),
    };
  }

  async auditReport(companyName: string, companyId: string, from: string | null, to: string | null): Promise<AuditReport> {
    const events = await this.audit.list(companyId, from, to, 500);
    return {
      company: companyName,
      periodLabel: from && to ? `${from} to ${to}` : "All time",
      from,
      to,
      events,
      generatedAt: new Date().toISOString(),
    };
  }
}

// "2026-10" -> first and last day of that month, plus a formal label "October 2026".
export function monthRange(month: string): { from: string; to: string; label: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error("month must be YYYY-MM");
  const year = Number(match[1]);
  const m = Number(match[2]);
  if (m < 1 || m > 12) throw new Error("month must be 01-12");
  const from = `${match[1]}-${match[2]}-01`;
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const to = `${match[1]}-${match[2]}-${String(lastDay).padStart(2, "0")}`;
  const label = new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return { from, to, label };
}
