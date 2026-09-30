import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ValidationError } from "../src/domain/errors.ts";
import { parseCreateInvoice } from "../src/validation/create-invoice-schema.ts";
import { sampleInvoice } from "./helpers/sample-invoice.ts";

const rejects = (body: unknown) => assert.throws(() => parseCreateInvoice(body), ValidationError);

describe("parseCreateInvoice", () => {
  it("accepts a valid invoice and normalizes it", () => {
    const parsed = parseCreateInvoice(sampleInvoice());
    assert.equal(parsed.currency, "PHP");
    assert.equal(parsed.items[0]?.quantity, "2.5");
    assert.equal(parsed.items[0]?.unit_price, "19.99");
  });

  it("defaults item tax to 0", () => {
    const parsed = parseCreateInvoice(sampleInvoice({ items: [{ description: "A", quantity: 1, unit_price: 5 }] }));
    assert.equal(parsed.items[0]?.tax, "0");
  });

  it("accepts numbers sent as strings", () => {
    const parsed = parseCreateInvoice(sampleInvoice({ items: [{ description: "A", quantity: "2", unit_price: "5.50" }] }));
    assert.equal(parsed.items[0]?.unit_price, "5.50");
  });

  it("rejects missing or empty items", () => {
    rejects(sampleInvoice({ items: [] }));
    rejects(sampleInvoice({ items: undefined }));
  });

  it("rejects a bad email", () => rejects(sampleInvoice({ customer_email: "not-an-email" })));
  it("rejects an unknown currency", () => rejects(sampleInvoice({ currency: "ZZZ" })));
  it("rejects a currency that is not 3 letters", () => rejects(sampleInvoice({ currency: "PESO" })));
  it("rejects an impossible date", () => rejects(sampleInvoice({ invoice_date: "2026-02-30" })));
  it("rejects a badly formatted date", () => rejects(sampleInvoice({ invoice_date: "30/09/2026" })));
  it("rejects a blank invoice number", () => rejects(sampleInvoice({ invoice_number: "   " })));
  it("rejects a negative price", () => rejects(sampleInvoice({ items: [{ description: "A", quantity: 1, unit_price: -1 }] })));
  it("rejects a zero quantity", () => rejects(sampleInvoice({ items: [{ description: "A", quantity: 0, unit_price: 1 }] })));
  it("rejects a price with 3 decimals", () => rejects(sampleInvoice({ items: [{ description: "A", quantity: 1, unit_price: 1.005 }] })));
  it("rejects a non-numeric quantity", () => rejects(sampleInvoice({ items: [{ description: "A", quantity: "abc", unit_price: 1 }] })));
  it("rejects unknown fields (no silent typos)", () => rejects(sampleInvoice({ discount: 5 })));
  it("rejects a body that is not an object", () => rejects("hello"));

  it("reports which field is wrong", () => {
    try {
      parseCreateInvoice(sampleInvoice({ customer_email: "nope" }));
      assert.fail("should have thrown");
    } catch (error) {
      assert.ok(error instanceof ValidationError);
      assert.deepEqual((error.details as { field: string }[]).map((d) => d.field), ["customer_email"]);
    }
  });
});
