"use client";

import type { InvoiceStatus, InvoiceSummary, StatusSummary } from "@tubo/backend/shared";
import { Eye, Search, ChevronDown } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/format";
import { STATUS_ORDER, STATUS_STYLES } from "@/lib/status";
import { StatusPill } from "./status-pill";
import { Spinner } from "./spinner";

interface InvoiceTableProps {
  rows: InvoiceSummary[];
  totalCount: number;
  loading: boolean;
  hasMore: boolean;
  search: string;
  filter: InvoiceStatus | null;
  onFilterChange: (status: InvoiceStatus | null) => void;
  onSearchChange: (value: string) => void;
  onLoadMore: () => void;
  onSelect: (id: string) => void;
  summary: StatusSummary;
}

export function InvoiceTable({
  rows, totalCount, loading, hasMore, search, filter,
  onFilterChange, onSearchChange, onLoadMore, onSelect, summary,
}: InvoiceTableProps) {
  const total = STATUS_ORDER.reduce((sum, s) => sum + summary[s], 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-1 overflow-x-auto">
          <TabButton label="All Invoices" count={total} active={filter === null} onClick={() => onFilterChange(null)} />
          {STATUS_ORDER.map((s) => (
            <TabButton key={s} label={STATUS_STYLES[s].label} count={summary[s]} active={filter === s}
              onClick={() => onFilterChange(filter === s ? null : s)} />
          ))}
        </div>
        <div className="relative shrink-0 sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by client, email, or invoice #…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Invoice Number</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Invoice Date</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <p className="font-medium text-slate-700">No invoices found</p>
                  <p className="text-sm text-slate-400 mt-1">
                    {search ? "No invoices match your search." : filter ? `No records in the "${STATUS_STYLES[filter].label}" filter.` : "Create your first invoice to get started!"}
                  </p>
                </td>
              </tr>
            )}
            {rows.map((invoice) => (
              <tr
                key={invoice.id}
                className="border-b border-slate-50 transition hover:bg-slate-50/80"
              >
                <td className="px-4 py-3">
                  <p className="font-medium text-brand hover:underline cursor-pointer" onClick={() => onSelect(invoice.id)}>
                    {invoice.invoice_number}
                  </p>
                </td>
                <td className="px-4 py-3 text-slate-900">{invoice.customer_name}</td>
                <td className="px-4 py-3 text-slate-600">{formatDate(invoice.invoice_date)}</td>
                <td className="px-4 py-3 text-right">
                  <p className="font-semibold text-slate-900">{formatMoney(invoice.total_amount, invoice.currency)}</p>
                </td>
                <td className="px-4 py-3"><StatusPill status={invoice.status} /></td>
                <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onSelect(invoice.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                    >
                      <Eye className="h-3.5 w-3.5" /> View Details
                    </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-400">
        <span>Showing {rows.length} of {totalCount} invoices</span>
        {loading ? (
          <Spinner className="h-4 w-4 text-slate-400" />
        ) : hasMore ? (
          <button type="button" onClick={onLoadMore}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:text-brand-dark">
            Load more <ChevronDown className="h-4 w-4" />
          </button>
        ) : (
          <span className="text-slate-400">Click any invoice row or &ldquo;View Details&rdquo; to see the full item breakdown and delivery diagnostics.</span>
        )}
      </div>
    </div>
  );
}

function TabButton({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition ${
        active
          ? "bg-brand text-white shadow-sm"
          : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label} <span className={active ? "text-white/80" : "text-slate-400"}>{count}</span>
    </button>
  );
}
