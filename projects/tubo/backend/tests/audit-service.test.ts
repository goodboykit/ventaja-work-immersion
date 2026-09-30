import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AuditEvent, MonthlyTotals } from "../src/domain/audit.ts";
import type { AuditRepository, NewAuditEvent } from "../src/repositories/audit-repository.ts";
import type { InvoiceRepository } from "../src/repositories/invoice-repository.ts";
import { AuditService, monthRange } from "../src/services/audit-service.ts";

class FakeAuditRepo implements AuditRepository {
  recorded: NewAuditEvent[] = [];
  events: AuditEvent[] = [];
  async record(e: NewAuditEvent) { this.recorded.push(e); }
  async list() { return this.events; }
}

// Minimal invoice repo returning fixed monthly totals.
function fakeInvoiceRepo(totals: MonthlyTotals): InvoiceRepository {
  return {
    monthlyTotals: async () => totals,
  } as unknown as InvoiceRepository;
}

describe("monthRange", () => {
  it("computes first/last day and a formal label", () => {
    assert.deepEqual(monthRange("2026-10"), { from: "2026-10-01", to: "2026-10-31", label: "October 2026" });
    assert.deepEqual(monthRange("2026-02"), { from: "2026-02-01", to: "2026-02-28", label: "February 2026" });
    assert.equal(monthRange("2024-02").to, "2024-02-29"); // leap year
  });

  it("rejects a bad month", () => {
    assert.throws(() => monthRange("2026-13"));
    assert.throws(() => monthRange("nope"));
  });
});

describe("AuditService.monthlyReport", () => {
  it("builds a report with per-status counts and totals", async () => {
    const totals: MonthlyTotals = { counts: { submitted: 3, failed: 1 }, total_count: 4, total_amount: "1000.00" };
    const svc = new AuditService(new FakeAuditRepo(), fakeInvoiceRepo(totals));
    const report = await svc.monthlyReport("Acme", "co-1", "2026-10");

    assert.equal(report.company, "Acme");
    assert.equal(report.periodLabel, "October 2026");
    assert.equal(report.totalCount, 4);
    assert.equal(report.totalAmount, "1000.00");
    const submitted = report.counts.find((c) => c.status === "submitted");
    assert.equal(submitted?.count, 3);
    const pending = report.counts.find((c) => c.status === "pending");
    assert.equal(pending?.count, 0); // statuses with no rows show 0
  });
});

describe("AuditService.listEvents", () => {
  it("passes through to the repository", async () => {
    const repo = new FakeAuditRepo();
    repo.events = [{ id: "1", event_type: "invoice_created", summary: "x", metadata: {}, created_at: "2026-10-01T00:00:00Z" }];
    const svc = new AuditService(repo, fakeInvoiceRepo({ counts: {}, total_count: 0, total_amount: "0" }));
    const events = await svc.listEvents("co-1", null, null);
    assert.equal(events.length, 1);
  });
});
