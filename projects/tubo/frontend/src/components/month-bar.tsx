"use client";

import { ChevronLeft, ChevronRight, FileText, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import type { MonthlyReport } from "@/lib/api-client";
import { ApiError } from "@/lib/api-client";
import { monthLabel, shiftMonth } from "@/lib/month";
import { useApp } from "@/providers/providers";
import { useToast } from "./toast";
import { Spinner } from "./spinner";
import { MonthlyReportModal } from "./monthly-report-modal";

// The month selector plus this month's totals and the report actions.
export function MonthBar({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const { api } = useApp();
  const { toast } = useToast();
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [preview, setPreview] = useState(false);
  const [emailing, setEmailing] = useState(false);

  useEffect(() => {
    let active = true;
    api.monthlyReport(month).then((r) => { if (active) setReport(r); }).catch(() => { if (active) setReport(null); });
    return () => { active = false; };
  }, [api, month]);

  async function emailReport() {
    setEmailing(true);
    try {
      const res = await api.emailMonthlyReport(month);
      toast("success", `Report sent to ${res.to}`);
    } catch (err) {
      toast("error", err instanceof ApiError ? err.message : "Could not send the report.");
    } finally {
      setEmailing(false);
    }
  }

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
              {report.totalCount} invoice{report.totalCount === 1 ? "" : "s"} · {report.totalAmount}
            </p>
          )}
        </div>
        <button type="button" onClick={() => onChange(shiftMonth(month, 1))}
          className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50" aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setPreview(true)} disabled={!report}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          <FileText className="h-4 w-4" /> Generate report
        </button>
        <button type="button" onClick={emailReport} disabled={emailing || !report}
          className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50">
          {emailing ? <Spinner className="h-4 w-4" /> : <Mail className="h-4 w-4" />} Email me
        </button>
      </div>

      {preview && report && <MonthlyReportModal report={report} onClose={() => setPreview(false)} />}
    </div>
  );
}
