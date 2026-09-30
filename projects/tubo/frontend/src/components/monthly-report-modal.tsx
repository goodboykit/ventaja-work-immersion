"use client";

import { Printer, X } from "lucide-react";
import type { MonthlyReport } from "@/lib/api-client";
import { MonthlyReportDoc } from "./monthly-report-doc";

// A formal, printable monthly report shown inside the dashboard. "Save as PDF" is the
// browser's own print dialog, so no PDF library is needed and it works on every platform.
export function MonthlyReportModal({ report, onClose }: { report: MonthlyReport; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-slate-900/40 px-4 py-8 print:static print:bg-white print:p-0" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl print:max-w-none print:shadow-none" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-3 print:hidden">
          <h2 className="text-lg font-semibold text-slate-900">Monthly report</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark">
              <Printer className="h-4 w-4" /> Print / Save as PDF
            </button>
            <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
          </div>
        </div>

        <MonthlyReportDoc report={report} />
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
