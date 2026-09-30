"use client";

import { FileText } from "lucide-react";
import { useEffect, useState } from "react";
import type { AuditEvent } from "@/lib/api-client";
import { ApiError } from "@/lib/api-client";
import { useApp } from "@/providers/providers";
import { Spinner } from "./spinner";
import { useToast } from "./toast";
import { AuditReportModal } from "./audit-report-modal";

const EVENT_LABELS: Record<string, string> = {
  invoice_created: "Invoice created",
  invoice_submitted: "Invoice submitted",
  invoice_rejected: "Invoice rejected",
  invoice_failed: "Invoice failed",
  invoice_retried: "Invoice retried",
  teammate_invited: "Teammate invited",
  teammate_joined: "Teammate joined",
};

// The audit trail: a formal, chronological record of business events over past months and years.
export function AuditTrail() {
  const { api } = useApp();
  const { toast } = useToast();
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    setEvents(null);
    api.listAudit(from || undefined, to || undefined)
      .then(setEvents)
      .catch((err) => {
        setEvents([]);
        if (err instanceof ApiError && !err.isConnectionProblem) toast("error", err.message);
      });
  }, [api, from, to, toast]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-500">From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-slate-500">To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
          </label>
          {(from || to) && (
            <button type="button" onClick={() => { setFrom(""); setTo(""); }}
              className="pb-1.5 text-xs text-slate-400 hover:text-slate-600 underline">Clear</button>
          )}
        </div>
        <button type="button" onClick={() => setShowReport(true)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <FileText className="h-4 w-4" /> Generate report
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        {events === null ? (
          <div className="flex items-center justify-center py-16"><Spinner className="h-6 w-6 text-brand" /></div>
        ) : events.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">No activity recorded for this period yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {events.map((e) => (
              <li key={e.id} className="flex items-start gap-3 px-5 py-3">
                <span className="mt-0.5 whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                  {EVENT_LABELS[e.event_type] ?? e.event_type}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-800">{e.summary}</p>
                  <p className="text-xs text-slate-400">{new Date(e.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showReport && <AuditReportModal from={from || undefined} to={to || undefined} onClose={() => setShowReport(false)} />}
    </div>
  );
}
