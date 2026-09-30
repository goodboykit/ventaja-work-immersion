"use client";

import type { MonthlyReport } from "@/lib/api-client";

export function formatTotal(amount: string): string {
  const n = Number(amount);
  if (Number.isNaN(n)) return amount;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// The printable monthly-report document. Shared by the in-dashboard modal and the
// standalone /report/monthly page (the link used in the emailed report).
export function MonthlyReportDoc({ report }: { report: MonthlyReport }) {
  const generated = new Date(report.generatedAt).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });

  return (
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
  );
}
