"use client";

import { Printer, X } from "lucide-react";
import type { MonthlyReport } from "@/lib/api-client";

// A formal, printable monthly report. "Save as PDF" is the browser's own print dialog,
// so no PDF library is needed and it works on every platform. The wording is fixed and
// professional — written to be clear to a non-technical reader.
function formatTotal(amount: string): string {
  const n = Number(amount);
  if (Number.isNaN(n)) return amount;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function MonthlyReportModal({ report, onClose }: { report: MonthlyReport; onClose: () => void }) {
  const generated = new Date(report.generatedAt).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });

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

        {/* The printable document */}
        <div className="report-doc px-10 py-8 text-slate-800">
          <div className="mb-6 border-b border-slate-200 pb-4">
            <h1 className="text-xl font-bold text-slate-900">Monthly Invoicing Report</h1>
            <p className="mt-1 text-sm text-slate-500">{report.company}</p>
            <p className="text-sm text-slate-500">Reporting period: {report.periodLabel}</p>
          </div>

          <p className="mb-5 text-sm leading-relaxed">
            This report summarises the invoices issued by {report.company} during {report.periodLabel}.
            It sets out the total number of invoices, their current delivery status with the government
            invoicing service, and the total value of the invoices for the period.
          </p>

          <table className="mb-6 w-full text-sm">
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="py-2 font-medium">Total invoices issued</td>
                <td className="py-2 text-right">{report.totalCount}</td>
              </tr>
              {report.counts.map((c) => (
                <tr key={c.status} className="border-b border-slate-100">
                  <td className="py-2 pl-4 text-slate-600">{c.label}</td>
                  <td className="py-2 text-right">{c.count}</td>
                </tr>
              ))}
              <tr>
                <td className="py-2 font-semibold">Total value</td>
                <td className="py-2 text-right font-semibold">{formatTotal(report.totalAmount)}</td>
              </tr>
            </tbody>
          </table>

          <p className="text-xs text-slate-400">
            Report generated on {generated}. This document was produced automatically by the Tubo invoicing platform
            and reflects the recorded status of each invoice at the time of generation.
          </p>
        </div>
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
