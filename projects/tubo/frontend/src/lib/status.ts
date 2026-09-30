import type { InvoiceStatus } from "@tubo/backend/shared";

export interface StatusStyle {
  label: string;
  description: string;
  dot: string;
  text: string;
  pill: string;
  active: string;
}

// The order the status cards appear in: the normal journey first, problems last.
export const STATUS_ORDER: readonly InvoiceStatus[] = ["pending", "processing", "submitted", "failed", "rejected"];

export const STATUS_STYLES: Record<InvoiceStatus, StatusStyle> = {
  pending: {
    label: "Queued",
    description: "Saved. Waiting to be sent to the government invoicing service.",
    dot: "bg-slate-400",
    text: "text-slate-700",
    pill: "bg-slate-100 text-slate-700 border-slate-200",
    active: "border-slate-500 ring-slate-500",
  },
  processing: {
    label: "Sending",
    description: "Being sent to the government invoicing service right now.",
    dot: "bg-blue-600 animate-pulse",
    text: "text-blue-700",
    pill: "bg-blue-50 text-blue-800 border-blue-200",
    active: "border-brand ring-brand",
  },
  submitted: {
    label: "Submitted",
    description: "Accepted by the government invoicing service.",
    dot: "bg-emerald-600",
    text: "text-emerald-700",
    pill: "bg-emerald-50 text-emerald-800 border-emerald-200",
    active: "border-emerald-600 ring-emerald-600",
  },
  failed: {
    label: "Failed",
    description: "Could not be delivered. Nothing is wrong with the invoice, so you can retry.",
    dot: "bg-rose-600",
    text: "text-rose-700",
    pill: "bg-rose-50 text-rose-800 border-rose-200",
    active: "border-rose-600 ring-rose-600",
  },
  rejected: {
    label: "Rejected",
    description: "Refused by the government invoicing service. Create a corrected invoice.",
    dot: "bg-amber-500",
    text: "text-amber-700",
    pill: "bg-amber-50 text-amber-800 border-amber-200",
    active: "border-amber-500 ring-amber-500",
  },
};

// Invoices in these statuses will still change on their own, so the screens keep refreshing them.
export function isInFlight(status: InvoiceStatus): boolean {
  return status === "pending" || status === "processing";
}
