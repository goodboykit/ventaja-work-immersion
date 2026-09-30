"use client";

import type { InvoiceStatus, StatusSummary } from "@tubo/backend/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api-client";
import { isInFlight } from "@/lib/status";
import type { InvoiceListState } from "@/lib/merge-invoices";
import { useApp } from "@/providers/providers";
import { useToast } from "./toast";
import { Navbar } from "./navbar";
import { DashboardStats } from "./dashboard-stats";
import { InvoiceTable } from "./invoice-table";
import { CreateInvoiceModal } from "./create-invoice-modal";
import { InvoiceDetailModal } from "./invoice-detail-modal";

const EMPTY_SUMMARY: StatusSummary = { pending: 0, processing: 0, submitted: 0, failed: 0, rejected: 0, total: 0 };

export function Dashboard() {
  const { api } = useApp();
  const { toast } = useToast();

  const [summary, setSummary] = useState<StatusSummary>(EMPTY_SUMMARY);
  const [list, setList] = useState<InvoiceListState>({ rows: [], nextCursor: null });
  const [filter, setFilter] = useState<InvoiceStatus | null>(null);
  const [search, setSearch] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const debouncedSearch = useRef(search);

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await api.getSummary());
    } catch {}
  }, [api]);

  const loadList = useCallback(async (cursor?: string) => {
    setListLoading(true);
    try {
      const page = await api.listInvoices({
        status: filter ?? undefined,
        invoiceNumber: debouncedSearch.current || undefined,
        cursor,
      });
      setList((prev) => cursor ? { rows: [...prev.rows, ...page.data], nextCursor: page.next_cursor } : { rows: page.data, nextCursor: page.next_cursor });
    } catch (err) {
      if (err instanceof ApiError && !err.isConnectionProblem) toast("error", err.message);
    } finally {
      setListLoading(false);
    }
  }, [api, filter, toast]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      debouncedSearch.current = search;
      loadList();
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  useEffect(() => {
    const hasInFlight = list.rows.some((r) => isInFlight(r.status));
    if (!hasInFlight) return;
    const interval = setInterval(() => { loadSummary(); loadList(); }, 5000);
    return () => clearInterval(interval);
  }, [list.rows, loadSummary, loadList]);

  // Trigger the submission worker every 10 seconds so invoices get processed automatically.
  useEffect(() => {
    const interval = setInterval(() => {
      fetch("/api/worker", { method: "POST" }).catch(() => {});
    }, 10_000);
    return () => clearInterval(interval);
  }, []);

  const refresh = useCallback(() => { loadSummary(); loadList(); }, [loadSummary, loadList]);

  const totalCount = summary.pending + summary.processing + summary.submitted + summary.failed + summary.rejected;

  return (
    <>
      <Navbar onCreateInvoice={() => setCreating(true)} />

      <main className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-6 space-y-6">
        {/* Page title */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Invoices</h1>
          <p className="text-sm text-slate-500 mt-0.5">Create, track, and manage customer billing and payment statuses with Ventaja.</p>
        </div>

        <DashboardStats summary={summary} activeFilter={filter} onFilter={setFilter} />

        <InvoiceTable
          rows={list.rows}
          totalCount={totalCount}
          loading={listLoading}
          hasMore={!!list.nextCursor}
          search={search}
          filter={filter}
          onFilterChange={setFilter}
          onSearchChange={setSearch}
          onLoadMore={() => loadList(list.nextCursor!)}
          onSelect={setSelectedId}
          summary={summary}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-100 py-4 mt-auto">
        <p className="text-center text-xs text-slate-400">Ventaja &middot; Accounts Receivable &amp; Invoicing</p>
      </footer>

      <CreateInvoiceModal open={creating} onClose={() => setCreating(false)} onCreated={refresh} />
      <InvoiceDetailModal invoiceId={selectedId} onClose={() => setSelectedId(null)} onRetried={refresh} />
    </>
  );
}
