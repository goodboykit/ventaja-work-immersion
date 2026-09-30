import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkForm, emptyForm, errorsFromDetails, liveTotals, newItem, toRequestBody, type InvoiceFormValues } from "../src/lib/invoice-form.ts";

function filledForm(overrides: Partial<InvoiceFormValues> = {}): InvoiceFormValues {
  return {
    ...emptyForm("2026-09-30", "k1"),
    invoice_number: "INV-10001",
    customer_name: "Juan Dela Cruz",
    customer_tax_id: "123-456-789",
    customer_email: "juan@example.com",
    items: [
      { key: "k1", description: "Widget", quantity: "2.5", unit_price: "19.99", tax: "6" },
      { key: "k2", description: "Service", quantity: "1", unit_price: "100", tax: "12" },
    ],
    ...overrides,
  };
}

describe("checkForm", () => {
  it("accepts a complete form and returns the request body", () => {
    const result = checkForm(filledForm());
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.body.invoice_number, "INV-10001");
      assert.deepEqual(result.body.items[0], { description: "Widget", quantity: "2.5", unit_price: "19.99", tax: "6" });
    }
  });

  it("an empty form reports every required field", () => {
    const result = checkForm(emptyForm("2026-09-30", "k1"));
    assert.equal(result.ok, false);
    if (!result.ok) {
      for (const field of ["invoice_number", "customer_name", "customer_tax_id", "customer_email", "items.0.description", "items.0.unit_price"]) {
        assert.ok(result.errors[field], `expected an error for ${field}`);
      }
      assert.equal(result.errors.customer_name, "Required");
    }
  });

  it("puts item errors on the right row", () => {
    const form = filledForm();
    form.items[1]!.quantity = "0";
    const result = checkForm(form);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.deepEqual(Object.keys(result.errors), ["items.1.quantity"]);
      assert.equal(result.errors["items.1.quantity"], "Must be greater than 0");
    }
  });

  it("rejects a bad email and a price with too many decimals", () => {
    const form = filledForm({ customer_email: "not-an-email" });
    form.items[0]!.unit_price = "1.234";
    const result = checkForm(form);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.errors.customer_email, "Enter a valid email address");
      assert.equal(result.errors["items.0.unit_price"], "Enter a number with at most 2 decimals");
    }
  });

  it("treats a blank item tax as 0", () => {
    const form = filledForm();
    form.items[0]!.tax = "  ";
    assert.equal(toRequestBody(form).items[0]!.tax, "0");
    assert.equal(checkForm(form).ok, true);
  });

  it("trims what was typed", () => {
    const body = toRequestBody(filledForm({ invoice_number: "  INV-1  ", customer_name: " Ana " }));
    assert.equal(body.invoice_number, "INV-1");
    assert.equal(body.customer_name, "Ana");
  });
});

describe("liveTotals", () => {
  it("matches the backend's calculation", () => {
    const totals = liveTotals(filledForm());
    assert.deepEqual(totals.lineTotals, ["55.98", "112.00"]);
    assert.equal(totals.subtotal, "149.98");
    assert.equal(totals.tax, "18.00");
    assert.equal(totals.total, "167.98");
  });

  it("skips rows that are not finished yet instead of failing", () => {
    const form = filledForm({ items: [{ key: "k1", description: "Widget", quantity: "2", unit_price: "10", tax: "0" }, newItem("k2")] });
    const totals = liveTotals(form);
    assert.deepEqual(totals.lineTotals, ["20.00", null]);
    assert.equal(totals.total, "20.00");
  });

  it("is zero for a form with nothing filled in", () => {
    const totals = liveTotals(emptyForm("2026-09-30", "k1"));
    assert.equal(totals.total, "0.00");
    assert.deepEqual(totals.lineTotals, [null]);
  });

  it("does not throw for an absurdly large amount", () => {
    const form = filledForm({ items: [{ key: "k1", description: "x", quantity: "999999999", unit_price: "999999999999.99", tax: "0" }] });
    assert.equal(liveTotals(form).total, "0.00");
  });
});

describe("errorsFromDetails", () => {
  it("maps the API's field errors, keeping the first message per field", () => {
    const errors = errorsFromDetails([
      { field: "customer_email", message: "Enter a valid email address" },
      { field: "customer_email", message: "second" },
      { field: "(body)", message: "general problem" },
    ]);
    assert.deepEqual(errors, { customer_email: "Enter a valid email address", form: "general problem" });
  });

  it("returns nothing for missing or malformed details", () => {
    assert.deepEqual(errorsFromDetails(undefined), {});
    assert.deepEqual(errorsFromDetails("nope"), {});
  });
});
