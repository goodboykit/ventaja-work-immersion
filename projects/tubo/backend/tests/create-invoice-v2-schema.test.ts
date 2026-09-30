import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ValidationError } from "../src/domain/errors.ts";
import { parseCreateInvoiceV2 } from "../src/validation/create-invoice-v2-schema.ts";
import { sampleInvoice } from "./helpers/sample-invoice.ts";

describe("createInvoiceV2Schema", () => {
  it("accepts a plain V1 payload (backwards compatible)", () => {
    const input = parseCreateInvoiceV2(sampleInvoice());
    assert.ok(input.invoice_number.startsWith("INV-"));
  });

  it("accepts new V2 optional fields", () => {
    const input = parseCreateInvoiceV2({
      ...sampleInvoice(),
      due_date: "2026-10-30",
      notes: "Please pay on time",
      payment_terms: "Net 30",
      billing_address: {
        line1: "123 Main St",
        city: "Manila",
        postal_code: "1000",
        country: "PH",
      },
    });

    assert.equal(input.due_date, "2026-10-30");
    assert.equal(input.notes, "Please pay on time");
    assert.equal(input.payment_terms, "Net 30");
    assert.equal(input.billing_address?.city, "Manila");
  });

  it("does not require any V2 fields", () => {
    const input = parseCreateInvoiceV2(sampleInvoice());
    assert.equal(input.due_date, undefined);
    assert.equal(input.notes, undefined);
    assert.equal(input.billing_address, undefined);
  });

  it("rejects an invalid due_date", () => {
    assert.throws(
      () => parseCreateInvoiceV2({ ...sampleInvoice(), due_date: "not-a-date" }),
      ValidationError,
    );
  });

  it("rejects notes that are too long", () => {
    assert.throws(
      () => parseCreateInvoiceV2({ ...sampleInvoice(), notes: "x".repeat(2001) }),
      ValidationError,
    );
  });
});
