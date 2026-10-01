"use client";

import type { InvoiceDetail } from "@tubo/backend/shared";
import { AlertTriangle, CheckCircle, Clock, Mail, RefreshCw, X, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api-client";
import { formatDate, formatDateTime, formatMoney, formatTimeUntil } from "@/lib/format";
import { isInFlight, STATUS_STYLES } from "@/lib/status";
import { buildTimeline, describeFailure, type TimelineEvent, type TimelineTone } from "@/lib/timeline";
import { useApp } from "@/providers/providers";
import { useToast } from "./toast";
import { Spinner } from "./spinner";
import { StatusPill } from "./status-pill";

interface InvoiceDetailModalProps {
  invoiceId: string | null;
  onClose: () => void;
  onRetried: () => void;
}

export function InvoiceDetailModal({ invoiceId, onClose, onRetried }: InvoiceDetailModalProps) {
  const { api } = useApp();
  const { toast } = useToast();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    try {
      setInvoice(await api.getInvoice(id));
    } catch {
      toast("error", "Could not load invoice details.");
      onClose();
    } finally {
      setLoading(false);
    }
  }, [api, toast, onClose]);

  useEffect(() => {
    if (!invoiceId) { setInvoice(null); return; }
    load(invoiceId);
  }, [invoiceId, load]);

  useEffect(() => {
    if (!invoice || !isInFlight(invoice.status)) return;
    const interval = setInterval(() => load(invoice.id), 5000);
    return () => clearInterval(interval);
  }, [invoice, load]);

  async function handleRetry() {
    if (!invoice) return;
    setRetrying(true);
    try {
      await api.retryInvoice(invoice.id);
      toast("success", "Invoice queued for retry.");
      await load(invoice.id);
      onRetried();
    } catch (err) {
      toast("error", err instanceof ApiError ? err.message : "Retry failed.");
    } finally {
      setRetrying(false);
    }
  }

  if (!invoiceId) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-12">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Invoice Details</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        {loading && !invoice ? (
          <div className="flex items-center justify-center py-16"><Spinner className="h-6 w-6 text-brand" /></div>
        ) : invoice ? (
          <div className="p-6 space-y-6">
            {/* Status alert */}
            {invoice.status === "failed" && (
              <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                <XCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Delivery failed</p>
                  <p className="mt-0.5 text-rose-700">{describeFailure(invoice)}</p>
                </div>
              </div>
            )}
            {invoice.status === "rejected" && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Rejected by the government service</p>
                  <p className="mt-0.5 text-amber-700">{invoice.rejection_reason ?? "The invoice was refused."}</p>
                </div>
              </div>
            )}

            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xl font-bold text-slate-900">{invoice.invoice_number}</p>
                <p className="text-sm text-slate-500 mt-0.5">{formatDate(invoice.invoice_date)} · {invoice.currency}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill status={invoice.status} />
                <a
                  href={`mailto:${invoice.customer_email}`}
                  title={invoice.customer_email}
                  className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                >
                  <Mail className="h-3.5 w-3.5" /> Email
                </a>
                {invoice.status === "failed" && (
                  <button type="button" onClick={handleRetry} disabled={retrying}
                    className="flex items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-60">
                    {retrying ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Retry
                  </button>
                )}
              </div>
            </div>

            {/* Customer */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 text-sm">
              <div>
                <p className="text-xs font-medium text-slate-500">Customer</p>
                <p className="text-slate-900">{invoice.customer_name}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Tax ID</p>
                <p className="text-slate-900">{invoice.customer_tax_id}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Email</p>
                <p className="text-slate-900">{invoice.customer_email}</p>
              </div>
            </div>

            {/* Items */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                    <th className="pb-2 pr-4">#</th>
                    <th className="pb-2 pr-4">Description</th>
                    <th className="pb-2 pr-4 text-right">Qty</th>
                    <th className="pb-2 pr-4 text-right">Unit Price</th>
                    <th className="pb-2 pr-4 text-right">Tax</th>
                    <th className="pb-2 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item) => (
                    <tr key={item.line_number} className="border-b border-slate-50">
                      <td className="py-2 pr-4 text-slate-400">{item.line_number}</td>
                      <td className="py-2 pr-4 text-slate-900">{item.description}</td>
                      <td className="py-2 pr-4 text-right text-slate-600">{item.quantity}</td>
                      <td className="py-2 pr-4 text-right text-slate-600">{formatMoney(item.unit_price, invoice.currency)}</td>
                      <td className="py-2 pr-4 text-right text-slate-600">{formatMoney(item.tax, invoice.currency)}</td>
                      <td className="py-2 text-right font-medium text-slate-900">{formatMoney(item.line_total, invoice.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="rounded-lg bg-slate-50 p-4 text-sm">
              <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{formatMoney(invoice.subtotal, invoice.currency)}</span></div>
              <div className="flex justify-between text-slate-600 mt-1"><span>Tax</span><span>{formatMoney(invoice.tax_amount, invoice.currency)}</span></div>
              <div className="flex justify-between font-semibold text-slate-900 mt-2 pt-2 border-t border-slate-200">
                <span>Total</span><span>{formatMoney(invoice.total_amount, invoice.currency)}</span>
              </div>
            </div>

            {/* External ref */}
            {invoice.external_ref && (
              <div className="text-sm">
                <p className="text-xs font-medium text-slate-500">External Reference</p>
                <p className="text-slate-900 font-mono text-xs mt-0.5">{invoice.external_ref}</p>
              </div>
            )}

            {/* Timeline */}
            <div>
              <h3 className="text-sm font-medium text-slate-700 mb-3">Activity</h3>
              <Timeline events={buildTimeline(invoice)} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const TONE_ICON: Record<TimelineTone, typeof Clock> = { neutral: Clock, success: CheckCircle, warning: AlertTriangle, error: XCircle };
const TONE_COLOR: Record<TimelineTone, string> = {
  neutral: "text-slate-400 border-slate-200",
  success: "text-emerald-500 border-emerald-200",
  warning: "text-amber-500 border-amber-200",
  error: "text-rose-500 border-rose-200",
};

function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <div className="relative space-y-0">
      {events.map((event, i) => {
        const Icon = TONE_ICON[event.tone];
        const color = TONE_COLOR[event.tone];
        const isLast = i === events.length - 1;
        return (
          <div key={i} className="relative flex gap-3 pb-4">
            {!isLast && <div className="absolute left-[11px] top-6 bottom-0 w-px bg-slate-200" />}
            <div className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-white ${color}`}>
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="pt-0.5">
              <p className="text-sm font-medium text-slate-900">{event.title}</p>
              <p className="text-xs text-slate-500 mt-0.5">{event.description}</p>
              <p className="text-xs text-slate-400 mt-0.5">{formatDateTime(event.at)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
