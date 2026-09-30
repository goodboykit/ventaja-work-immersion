"use client";

import type { InvoiceStatus, StatusSummary } from "@tubo/backend/shared";
import { STATUS_ORDER, STATUS_STYLES } from "@/lib/status";

interface DashboardStatsProps {
  summary: StatusSummary;
  activeFilter: InvoiceStatus | null;
  onFilter: (status: InvoiceStatus | null) => void;
}

const DESCRIPTIONS: Record<"all" | InvoiceStatus, (count: number) => string> = {
  all: (n) => `${n} total records`,
  pending: (n) => n === 0 ? "All sent" : `${n} awaiting send`,
  processing: (n) => n === 0 ? "Queue empty" : `${n} in clearing queue`,
  submitted: (n) => `${n} invoices accepted`,
  failed: (n) => n === 0 ? "All clear" : `${n} need attention`,
  rejected: (n) => n === 0 ? "None refused" : `${n} refused`,
};

export function DashboardStats({ summary, activeFilter, onFilter }: DashboardStatsProps) {
  const total = STATUS_ORDER.reduce((sum, s) => sum + summary[s], 0);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {/* All */}
      <button
        type="button"
        onClick={() => onFilter(null)}
        className={`rounded-xl border bg-white p-4 text-left shadow-sm transition ${
          activeFilter === null ? "border-brand ring-2 ring-brand/20" : "border-slate-200 hover:border-slate-300"
        }`}
      >
        <p className="text-xs font-medium text-slate-500">All Invoices</p>
        <p className="mt-1 text-2xl font-bold text-slate-900">{total}</p>
        <p className="mt-0.5 text-[11px] text-slate-400">{DESCRIPTIONS.all(total)}</p>
      </button>

      {STATUS_ORDER.map((status) => {
        const style = STATUS_STYLES[status];
        const isActive = activeFilter === status;
        const count = summary[status];
        return (
          <button
            key={status}
            type="button"
            onClick={() => onFilter(isActive ? null : status)}
            className={`rounded-xl border bg-white p-4 text-left shadow-sm transition ${
              isActive ? `${style.active} ring-2 ring-opacity-20` : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className={`inline-block h-2 w-2 rounded-full ${style.dot}`} />
              <p className="text-xs font-medium text-slate-500">{style.label}</p>
            </div>
            <p className="mt-1 text-2xl font-bold text-slate-900">{count}</p>
            <p className="mt-0.5 text-[11px] text-slate-400">{DESCRIPTIONS[status](count)}</p>
          </button>
        );
      })}
    </div>
  );
}
