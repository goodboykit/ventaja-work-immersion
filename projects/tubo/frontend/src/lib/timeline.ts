import type { InvoiceDetail } from "@tubo/backend/shared";
import { formatDuration } from "./format.ts";

export type TimelineTone = "neutral" | "success" | "warning" | "error";

export interface TimelineEvent {
  at: string;
  title: string;
  description: string;
  tone: TimelineTone;
}

// Turns what the backend recorded (the invoice, its job and every send attempt) into a readable history.
export function buildTimeline(invoice: InvoiceDetail): TimelineEvent[] {
  const events: TimelineEvent[] = [
    {
      at: invoice.created_at,
      title: "Invoice received",
      description: "Saved and queued for submission to the government invoicing service.",
      tone: "neutral",
    },
  ];

  const attempts = [...invoice.processing.attempts].sort((a, b) => a.attempt_no - b.attempt_no);
  for (const attempt of attempts) {
    const http = attempt.http_status ? ` (HTTP ${attempt.http_status})` : "";
    const took = attempt.duration_ms !== null ? ` in ${formatDuration(attempt.duration_ms)}` : "";
    const label = `Attempt ${attempt.attempt_no}`;

    if (attempt.outcome === "success") {
      events.push({ at: attempt.created_at, title: "Submitted to the government service", description: `${label} succeeded${http}${took}.`, tone: "success" });
    } else if (attempt.outcome === "rejected") {
      events.push({ at: attempt.created_at, title: "Rejected by the government service", description: `${label}${http}: ${attempt.error ?? "The invoice was refused."}`, tone: "error" });
    } else if (attempt.outcome === "timeout") {
      events.push({ at: attempt.created_at, title: "The service did not answer in time", description: `${label} timed out${took}. It will be tried again.`, tone: "warning" });
    } else {
      events.push({ at: attempt.created_at, title: "Temporary problem, will retry", description: `${label}${http}: ${attempt.error ?? "The service returned an error."}`, tone: "warning" });
    }
  }

  const job = invoice.processing.job;
  if (invoice.status === "failed" && job) {
    events.push({
      at: invoice.updated_at,
      title: "Delivery failed",
      description: `Gave up after ${job.attempts} ${job.attempts === 1 ? "attempt" : "attempts"}. You can retry.`,
      tone: "error",
    });
  } else if (invoice.status === "pending" && job && job.attempts > 0) {
    events.push({
      at: job.next_attempt_at,
      title: "Next attempt scheduled",
      description: `Attempt ${job.attempts + 1} of ${job.max_attempts}.`,
      tone: "neutral",
    });
  }

  return events;
}

// The plain-language reason shown in the alert on a failed invoice.
export function describeFailure(invoice: InvoiceDetail): string {
  const lastAttempt = [...invoice.processing.attempts].sort((a, b) => b.attempt_no - a.attempt_no)[0];
  return invoice.processing.job?.last_error ?? lastAttempt?.error ?? "The government invoicing service could not be reached.";
}
