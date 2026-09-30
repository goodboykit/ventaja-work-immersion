"use client";

import { Printer, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { AuditReport } from "@/lib/api-client";
import { useApp } from "@/providers/providers";
import { Spinner } from "./spinner";

const EVENT_LABELS: Record<string, string> = {
  invoice_created: "Invoice created",
  invoice_submitted: "Invoice submitted",
  invoice_rejected: "Invoice rejected",
  invoice_failed: "Invoice failed",
  invoice_retried: "Invoice retried",
  teammate_invited: "Teammate invited",
  teammate_joined: "Teammate joined",
};

// One whole formal audit report with a printable preview (Save as PDF via the browser).
export function AuditReportModal({ from, to, onClose }: { from?: string; to?: string; onClose: () => void }) {
  const { api } = useApp();
  const [report, setReport] = useState<AuditReport | null>(null);

  useEffect(() => {
    api.auditReport(from, to).then(setReport).catch(() => setReport(null));
  }, [api, from, to]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-slate-900/40 px-4 py-8 print:static print:bg-white print:p-0" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl print:max-w-none print:shadow-none" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-3 print:hidden">
          <h2 className="text-lg font-semibold text-slate-900">Audit trail report</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} disabled={!report}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50">
              <Printer className="h-4 w-4" /> Print / Save as PDF
            </button>
            <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
          </div>
        </div>

        {!report ? (
          <div className="flex items-center justify-center py-20"><Spinner className="h-6 w-6 text-brand" /></div>
        ) : (
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
                      <td className="py-2 pr-3 whitespace-nowrap">{EVENT_LABELS[e.event_type] ?? e.event_type}</td>
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
        )}
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .report-doc, .report-doc * { visibility: visible; }
          .report-doc { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}
