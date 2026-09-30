"use client";

import type { InvoiceStatus, StatusSummary } from "@tubo/backend/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api-client";
import type { InvoiceListState } from "@/lib/merge-invoices";
import { currentMonth, monthBounds } from "@/lib/month";
import { useApp } from "@/providers/providers";
import { useToast } from "./toast";
import { Navbar } from "./navbar";
import { DashboardStats } from "./dashboard-stats";
import { InvoiceTable } from "./invoice-table";
import { CreateInvoiceModal } from "./create-invoice-modal";
import { InvoiceDetailModal } from "./invoice-detail-modal";
import { MonthBar } from "./month-bar";
import { AuditTrail } from "./audit-trail";

const EMPTY_SUMMARY: StatusSummary = { pending: 0, processing: 0, submitted: 0, failed: 0, rejected: 0, total: 0 };
const EMPTY_LIST: InvoiceListState = { rows: [], nextCursor: null };
const POLL_INTERVAL = 5_000;

type Tab = "invoices" | "audit";

export function Dashboard() {
  const { api } = useApp();
  const { toast } = useToast();

  const [tab, setTab] = useState<Tab>("invoices");
  const [month, setMonth] = useState<string>(currentMonth());
  const [summary, setSummary] = useState<StatusSummary>(EMPTY_SUMMARY);
  const [list, setList] = useState<InvoiceListState>(EMPTY_LIST);
  const [filter, setFilter] = useState<InvoiceStatus | null>(null);
  const [search, setSearch] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Each load gets a sequence number; only the newest applies its result.
  // This fixes fast tab/month switching showing stale data (no request is dropped).
  const loadSeq = useRef(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const debouncedSearch = useRef("");

  const loadData = useCallback(async (opts?: { cursor?: string }) => {
    const seq = ++loadSeq.current;
    const { from, to } = monthBounds(month);

    try {
      const [summaryResult, listResult] = await Promise.all([
        opts?.cursor ? null : api.getSummary().catch(() => null),
        api.listInvoices({
          status: filter ?? undefined,
          invoiceNumber: debouncedSearch.current || undefined,
          dateFrom: from,
          dateTo: to,
          cursor: opts?.cursor,
        }),
      ]);

      // A newer load started while we awaited — discard this stale result.
      if (seq !== loadSeq.current && !opts?.cursor) return;

      if (summaryResult) setSummary(summaryResult);
      setList((prev) =>
        opts?.cursor
          ? { rows: [...prev.rows, ...listResult.data], nextCursor: listResult.next_cursor }
          : { rows: listResult.data, nextCursor: listResult.next_cursor },
      );
    } catch (err) {
      if (err instanceof ApiError && !err.isConnectionProblem) toast("error", err.message);
    } finally {
      if (seq === loadSeq.current) setInitialLoading(false);
    }
  }, [api, filter, month, toast]);

  // Reload when the filter or month changes.
  useEffect(() => {
    setList(EMPTY_LIST);
    setInitialLoading(true);
    loadData();
  }, [filter, month, loadData]);

  // Debounced search (does not reload the whole cache — just re-queries).
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      debouncedSearch.current = search;
      loadData();
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search, loadData]);

  // Poll only while something is in flight; refresh data without wiping state.
  useEffect(() => {
    if (tab !== "invoices") return;
    const hasInFlight = summary.pending > 0 || summary.processing > 0;
    if (!hasInFlight) return;
    const interval = setInterval(async () => {
      await fetch("/api/worker", { method: "POST" }).catch(() => {});
      loadData();
    }, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [tab, summary.pending, summary.processing, loadData]);

  const refresh = useCallback(() => loadData(), [loadData]);

  const totalCount = summary.pending + summary.processing + summary.submitted + summary.failed + summary.rejected;

  return (
    <>
      <Navbar onCreateInvoice={() => setCreating(true)} />

      <main className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Invoices</h1>
          <p className="text-sm text-slate-500 mt-0.5">Create, track, and manage customer billing and payment statuses with Ventaja.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-200">
          <TabButton active={tab === "invoices"} onClick={() => setTab("invoices")}>This month</TabButton>
          <TabButton active={tab === "audit"} onClick={() => setTab("audit")}>Audit trail</TabButton>
        </div>

        {tab === "invoices" ? (
          <>
            <MonthBar month={month} onChange={setMonth} />
            <DashboardStats summary={summary} activeFilter={filter} onFilter={setFilter} />
            <InvoiceTable
              rows={list.rows}
              totalCount={totalCount}
              loading={initialLoading}
              hasMore={!!list.nextCursor}
              search={search}
              filter={filter}
              onFilterChange={setFilter}
              onSearchChange={setSearch}
              onLoadMore={() => loadData({ cursor: list.nextCursor! })}
              onSelect={setSelectedId}
              summary={summary}
            />
          </>
        ) : (
          <AuditTrail />
        )}
      </main>

      <footer className="border-t border-slate-100 py-4 mt-auto">
        <p className="text-center text-xs text-slate-400">Ventaja &middot; Accounts Receivable &amp; Invoicing</p>
      </footer>

      <CreateInvoiceModal open={creating} onClose={() => setCreating(false)} onCreated={refresh} />
      <InvoiceDetailModal invoiceId={selectedId} onClose={() => setSelectedId(null)} onRetried={refresh} />
    </>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
        active ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}
