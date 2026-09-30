import type { InvoiceSummary } from "@tubo/backend/shared";

export interface InvoiceListState {
  rows: InvoiceSummary[];
  nextCursor: string | null;
}

const TIMESTAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})?$/;

// The database orders by microseconds, but JavaScript dates only know milliseconds,
// so two invoices created in the same millisecond would look tied. Compare in microseconds instead.
export function toMicroseconds(timestamp: string): bigint {
  const match = TIMESTAMP.exec(timestamp);
  if (!match) return 0n;
  const [, base, fraction = "", zone = "Z"] = match;
  return BigInt(Date.parse(`${base}${zone}`)) * 1000n + BigInt(fraction.padEnd(6, "0"));
}

// True when `a` sits below `b` in a newest-first list (same order the API uses).
function isBelow(a: InvoiceSummary, b: InvoiceSummary): boolean {
  const timeA = toMicroseconds(a.created_at);
  const timeB = toMicroseconds(b.created_at);
  return timeA !== timeB ? timeA < timeB : a.id < b.id;
}

// Live refresh: `fresh` is the newest part of the list, freshly loaded. Everything it covers is
// replaced (so changed statuses show up and new invoices appear), and rows loaded further down
// with "Load more" are kept as they were.
export function mergeLatest(current: InvoiceListState, fresh: InvoiceListState): InvoiceListState {
  const last = fresh.rows[fresh.rows.length - 1];
  if (!last || fresh.nextCursor === null) return fresh;

  const older = current.rows.filter((row) => isBelow(row, last));
  return {
    rows: [...fresh.rows, ...older],
    nextCursor: older.length > 0 ? current.nextCursor : fresh.nextCursor,
  };
}
