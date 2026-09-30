"use client";

import { Printer } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { Logo } from "@/components/logo";
import { MonthlyReportDoc } from "@/components/monthly-report-doc";
import { Spinner } from "@/components/spinner";
import { ApiError, type MonthlyReport } from "@/lib/api-client";
import { currentMonth } from "@/lib/month";
import { useApp } from "@/providers/providers";

// Standalone printable monthly report — the page the emailed "View full report" link opens.
export default function MonthlyReportPage() {
  return (
    <AuthGuard>
      <Suspense fallback={<Centered><Spinner className="h-6 w-6 text-brand" /></Centered>}>
        <ReportView />
      </Suspense>
    </AuthGuard>
  );
}

function ReportView() {
  const { api } = useApp();
  const params = useSearchParams();
  const month = params.get("month") ?? currentMonth();
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.monthlyReport(month)
      .then(setReport)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load this report."));
  }, [api, month]);

  if (error) return <Centered><p className="text-sm text-rose-600">{error}</p></Centered>;
  if (!report) return <Centered><Spinner className="h-6 w-6 text-brand" /></Centered>;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Logo />
        <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark">
          <Printer className="h-4 w-4" /> Print / Save as PDF
        </button>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white print:border-0">
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

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 items-center justify-center py-20">{children}</div>;
}
