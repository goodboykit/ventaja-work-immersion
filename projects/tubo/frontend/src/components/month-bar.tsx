"use client";

import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import type { MonthlyReport } from "@/lib/api-client";
import { monthLabel, shiftMonth } from "@/lib/month";
import { useApp } from "@/providers/providers";
import { MonthlyReportModal } from "./monthly-report-modal";

// Invoices can be in different currencies, so the combined total is shown as a formatted
// number with thousands separators (not a single currency symbol, which would be misleading).
function formatTotal(amount: string): string {
  const n = Number(amount);
  if (Number.isNaN(n)) return amount;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// The month selector plus this month's totals and the report actions.
export function MonthBar({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const { api } = useApp();
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    let active = true;
    api.monthlyReport(month).then((r) => { if (active) setReport(r); }).catch(() => { if (active) setReport(null); });
    return () => { active = false; };
  }, [api, month]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onChange(shiftMonth(month, -1))}
          className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50" aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="min-w-[9rem] text-center">
          <p className="text-sm font-semibold text-slate-800">{monthLabel(month)}</p>
          {report && (
            <p className="text-xs text-slate-400">
              {report.totalCount} invoice{report.totalCount === 1 ? "" : "s"} · {formatTotal(report.totalAmount)}
            </p>
          )}
        </div>
        <button type="button" onClick={() => onChange(shiftMonth(month, 1))}
          className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50" aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <button type="button" onClick={() => setPreview(true)} disabled={!report}
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
        <FileText className="h-4 w-4" /> Generate report
      </button>

      {preview && report && <MonthlyReportModal report={report} onClose={() => setPreview(false)} />}
    </div>
  );
}
