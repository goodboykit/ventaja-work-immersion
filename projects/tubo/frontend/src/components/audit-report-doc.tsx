"use client";

import type { AuditReport } from "@/lib/api-client";

export const AUDIT_EVENT_LABELS: Record<string, string> = {
  invoice_created: "Invoice created",
  invoice_submitted: "Invoice submitted",
  invoice_rejected: "Invoice rejected",
  invoice_failed: "Invoice failed",
  invoice_retried: "Invoice retried",
  teammate_invited: "Teammate invited",
  teammate_joined: "Teammate joined",
};

// The printable audit-trail document. Shared by the in-dashboard modal and the
// standalone /report/audit page, so both render identically.
export function AuditReportDoc({ report }: { report: AuditReport }) {
  return (
    <div className="report-doc px-10 py-8 text-slate-800">
      <div className="mb-6 border-b border-slate-200 pb-4">
        <h1 className="text-xl font-bold text-slate-900">Audit Trail Report</h1>
        <p className="mt-1 text-sm text-slate-500">{report.company}</p>
        <p className="text-sm text-slate-500">Period: {report.periodLabel}</p>
      </div>

      <p className="mb-5 text-sm leading-relaxed">
        This report provides a chronological record of the significant activities carried out on the
        {" "}{report.company} account, including the creation of invoices, their delivery outcomes, and changes
        to the team. It is intended to support review and verification of account activity.
      </p>

      {report.events.length === 0 ? (
        <p className="text-sm text-slate-500">No activity was recorded for the selected period.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-left text-xs uppercase text-slate-400">
              <th className="py-2 pr-3">Date</th>
              <th className="py-2 pr-3">Activity</th>
              <th className="py-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {report.events.map((e) => (
              <tr key={e.id} className="border-b border-slate-100 align-top">
                <td className="py-2 pr-3 whitespace-nowrap text-slate-500">
                  {new Date(e.created_at).toLocaleDateString("en-US", { dateStyle: "medium" })}
                </td>
                <td className="py-2 pr-3 whitespace-nowrap">{AUDIT_EVENT_LABELS[e.event_type] ?? e.event_type}</td>
                <td className="py-2">{e.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="mt-6 text-xs text-slate-400">
        Report generated on {new Date(report.generatedAt).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}.
        Produced automatically by the Tubo invoicing platform.
      </p>
    </div>
  );
}
