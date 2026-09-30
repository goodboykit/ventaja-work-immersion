import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INVOICE_STATUSES } from "@tubo/backend/shared";
import { formatDate, formatDuration, formatMoney, formatTimeUntil, initialsFromEmail, todayIsoDate } from "../src/lib/format.ts";
import { isInFlight, STATUS_ORDER, STATUS_STYLES } from "../src/lib/status.ts";

describe("status styles", () => {
  it("cover every status the backend can produce, so a new status cannot go unstyled", () => {
    assert.deepEqual(Object.keys(STATUS_STYLES).sort(), [...INVOICE_STATUSES].sort());
    assert.deepEqual([...STATUS_ORDER].sort(), [...INVOICE_STATUSES].sort());
  });

  it("only queued and sending invoices are still changing on their own", () => {
    for (const status of INVOICE_STATUSES) {
      assert.equal(isInFlight(status), status === "pending" || status === "processing", status);
    }
  });
});

describe("formatting", () => {
  it("formats money with the invoice's currency", () => {
    assert.equal(formatMoney(1234.5, "USD"), "$1,234.50");
    assert.equal(formatMoney("167.98", "USD"), "$167.98");
  });

  it("does not crash on an unknown currency code", () => {
    assert.equal(formatMoney(5, "???"), "??? 5.00");
  });

  it("shows invoice dates without shifting them by time zone", () => {
    assert.equal(formatDate("2026-09-30"), "Sep 30, 2026");
    assert.equal(formatDate("2026-01-01"), "Jan 1, 2026");
    assert.equal(formatDate("garbage"), "garbage");
  });

  it("formats durations", () => {
    assert.equal(formatDuration(420), "420 ms");
    assert.equal(formatDuration(1500), "1.5 s");
  });

  it("describes a time in the future", () => {
    const now = Date.parse("2026-09-30T00:00:00Z");
    assert.equal(formatTimeUntil("2026-09-30T00:00:30Z", now), "in 30 s");
    assert.equal(formatTimeUntil("2026-09-30T00:05:00Z", now), "in 5 min");
    assert.equal(formatTimeUntil("2026-09-30T02:00:00Z", now), "in 2 h");
    assert.equal(formatTimeUntil("2026-09-29T23:59:00Z", now), "any moment now");
  });

  it("gives today's date in local time as YYYY-MM-DD", () => {
    assert.equal(todayIsoDate(new Date(2026, 8, 5, 23, 59)), "2026-09-05");
  });

  it("makes initials from an email", () => {
    assert.equal(initialsFromEmail("juan.delacruz@example.com"), "JD");
    assert.equal(initialsFromEmail("maria@example.com"), "MA");
    assert.equal(initialsFromEmail(null), "?");
  });
});
