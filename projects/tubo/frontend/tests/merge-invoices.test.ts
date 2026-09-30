import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { InvoiceSummary } from "@tubo/backend/shared";
import { mergeLatest, toMicroseconds } from "../src/lib/merge-invoices.ts";

function invoice(id: string, createdAt: string, status: InvoiceSummary["status"] = "pending"): InvoiceSummary {
  return {
    id,
    invoice_number: `INV-${id}`,
    invoice_date: "2026-09-30",
    customer_name: "C",
    customer_tax_id: "T",
    customer_email: "c@d.co",
    currency: "PHP",
    subtotal: 1,
    tax_amount: 0,
    total_amount: 1,
    status,
    external_ref: null,
    rejection_reason: null,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

// Newest first, one second apart: c is newest, a is oldest.
const a = invoice("a", "2026-09-30T00:00:01.000000+00:00");
const b = invoice("b", "2026-09-30T00:00:02.000000+00:00");
const c = invoice("c", "2026-09-30T00:00:03.000000+00:00");
const d = invoice("d", "2026-09-30T00:00:04.000000+00:00");

describe("toMicroseconds", () => {
  it("orders fractions numerically, not as text", () => {
    // as text ".5+" would wrongly sort before ".49"
    assert.ok(toMicroseconds("2026-09-30T00:00:00.5+00:00") > toMicroseconds("2026-09-30T00:00:00.49+00:00"));
  });

  it("tells apart two times in the same millisecond", () => {
    assert.ok(toMicroseconds("2026-09-30T00:00:00.123456+00:00") > toMicroseconds("2026-09-30T00:00:00.123455+00:00"));
  });

  it("understands Z and offsets", () => {
    assert.equal(toMicroseconds("2026-09-30T01:00:00Z"), toMicroseconds("2026-09-30T09:00:00+08:00"));
  });
});

describe("mergeLatest", () => {
  it("shows a changed status", () => {
    const current = { rows: [c, b, a], nextCursor: null };
    const fresh = { rows: [invoice("c", c.created_at, "submitted"), b, a], nextCursor: null };
    assert.equal(mergeLatest(current, fresh).rows[0]!.status, "submitted");
  });

  it("puts brand-new invoices on top", () => {
    const current = { rows: [c, b], nextCursor: "after-b" };
    const fresh = { rows: [d, c], nextCursor: "after-c" };
    const merged = mergeLatest(current, fresh);
    assert.deepEqual(merged.rows.map((r) => r.id), ["d", "c", "b"]);
    assert.equal(merged.nextCursor, "after-b");
  });

  it("keeps rows loaded further down with 'Load more'", () => {
    const current = { rows: [c, b, a], nextCursor: "after-a" };
    const fresh = { rows: [c, b], nextCursor: "after-b" };
    const merged = mergeLatest(current, fresh);
    assert.deepEqual(merged.rows.map((r) => r.id), ["c", "b", "a"]);
    assert.equal(merged.nextCursor, "after-a");
  });

  it("uses the fresh cursor when nothing older was loaded", () => {
    const current = { rows: [c, b], nextCursor: "after-b" };
    const fresh = { rows: [c, b], nextCursor: "after-b-new" };
    assert.equal(mergeLatest(current, fresh).nextCursor, "after-b-new");
  });

  it("drops a row that no longer matches the filter when the whole list was refreshed", () => {
    // filtered to "pending": b became submitted, so the complete fresh list no longer has it
    const current = { rows: [c, b, a], nextCursor: null };
    const fresh = { rows: [c, a], nextCursor: null };
    assert.deepEqual(mergeLatest(current, fresh).rows.map((r) => r.id), ["c", "a"]);
  });

  it("shows an empty list when nothing matches any more", () => {
    assert.deepEqual(mergeLatest({ rows: [c], nextCursor: null }, { rows: [], nextCursor: null }).rows, []);
  });
});
