"use client";

import type { InvoiceStatus, StatusSummary } from "@tubo/backend/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api-client";
import type { InvoiceListState } from "@/lib/merge-invoices";
import { useApp } from "@/providers/providers";
import { useToast } from "./toast";
import { Navbar } from "./navbar";
import { DashboardStats } from "./dashboard-stats";
import { InvoiceTable } from "./invoice-table";
import { CreateInvoiceModal } from "./create-invoice-modal";
import { InvoiceDetailModal } from "./invoice-detail-modal";

const EMPTY_SUMMARY: StatusSummary = { pending: 0, processing: 0, submitted: 0, failed: 0, rejected: 0, total: 0 };
const EMPTY_LIST: InvoiceListState = { rows: [], nextCursor: null };
const POLL_INTERVAL = 5_000;

type CacheKey = string;
function cacheKey(filter: InvoiceStatus | null, search: string): CacheKey {
  return `${filter ?? "all"}|${search}`;
}

export function Dashboard() {
  const { api } = useApp();
  const { toast } = useToast();

  const [summary, setSummary] = useState<StatusSummary>(EMPTY_SUMMARY);
  const [list, setList] = useState<InvoiceListState>(EMPTY_LIST);
  const [filter, setFilter] = useState<InvoiceStatus | null>(null);
  const [search, setSearch] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const listCache = useRef(new Map<CacheKey, InvoiceListState>());
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const debouncedSearch = useRef("");
  const fetchingRef = useRef(false);

  const loadData = useCallback(async (opts?: { cursor?: string; showLoading?: boolean }) => {
    if (fetchingRef.current && !opts?.cursor) return;
    fetchingRef.current = true;

    try {
      const key = cacheKey(filter, debouncedSearch.current);

      const [summaryResult, listResult] = await Promise.all([
        opts?.cursor ? null : api.getSummary().catch(() => null),
        api.listInvoices({
          status: filter ?? undefined,
          invoiceNumber: debouncedSearch.current || undefined,
          cursor: opts?.cursor,
        }),
      ]);

      if (summaryResult) setSummary(summaryResult);

      const newList: InvoiceListState = opts?.cursor
        ? { rows: [...(listCache.current.get(key)?.rows ?? []), ...listResult.data], nextCursor: listResult.next_cursor }
        : { rows: listResult.data, nextCursor: listResult.next_cursor };

      listCache.current.set(key, newList);
      setList(newList);
    } catch (err) {
      if (err instanceof ApiError && !err.isConnectionProblem) toast("error", err.message);
    } finally {
      fetchingRef.current = false;
      setInitialLoading(false);
    }
  }, [api, filter, toast]);

  // On filter change: show cached data instantly, then refresh in background
  useEffect(() => {
    const key = cacheKey(filter, debouncedSearch.current);
    const cached = listCache.current.get(key);
    if (cached) setList(cached);
    else setList(EMPTY_LIST);

    loadData();
  }, [filter, loadData]);

  // Debounced search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      debouncedSearch.current = search;
      listCache.current.delete(cacheKey(filter, search));
      loadData();
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  // Single polling loop: trigger worker → fetch fresh data
  useEffect(() => {
    const hasInFlight = summary.pending > 0 || summary.processing > 0;
    if (!hasInFlight) return;

    const interval = setInterval(async () => {
      await fetch("/api/worker", { method: "POST" }).catch(() => {});
      listCache.current.clear();
      loadData();
    }, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [summary.pending, summary.processing, loadData]);

  const refresh = useCallback(() => {
    listCache.current.clear();
    loadData();
  }, [loadData]);

  const totalCount = summary.pending + summary.processing + summary.submitted + summary.failed + summary.rejected;

  return (
    <>
      <Navbar onCreateInvoice={() => setCreating(true)} />

      <main className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Invoices</h1>
          <p className="text-sm text-slate-500 mt-0.5">Create, track, and manage customer billing and payment statuses with Ventaja.</p>
        </div>

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
      </main>

      <footer className="border-t border-slate-100 py-4 mt-auto">
        <p className="text-center text-xs text-slate-400">Ventaja &middot; Accounts Receivable &amp; Invoicing</p>
      </footer>

      <CreateInvoiceModal open={creating} onClose={() => setCreating(false)} onCreated={refresh} />
      <InvoiceDetailModal invoiceId={selectedId} onClose={() => setSelectedId(null)} onRetried={refresh} />
    </>
  );
}
