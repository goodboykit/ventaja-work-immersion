import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ValidationError } from "../src/domain/errors.ts";
import { InvoiceTotalsCalculator } from "../src/domain/invoice-totals.ts";

const calculator = new InvoiceTotalsCalculator();
const item = (quantity: string, unit_price: string, tax = "0.00") => ({ description: "x", quantity, unit_price, tax });

describe("InvoiceTotalsCalculator", () => {
  it("calculates line totals (tax-inclusive), subtotal, tax and total", () => {
    const result = calculator.calculate([item("2.5", "19.99", "6"), item("1", "100", "12")]);
    assert.deepEqual(result.items.map((i) => i.line_total), ["55.98", "112.00"]);
    assert.equal(result.subtotal, "149.98");
    assert.equal(result.tax_amount, "18.00");
    assert.equal(result.total_amount, "167.98");
  });

  it("numbers the lines from 1 in order", () => {
    const result = calculator.calculate([item("1", "1"), item("1", "2"), item("1", "3")]);
    assert.deepEqual(result.items.map((i) => i.line_number), [1, 2, 3]);
  });

  it("rounds half up to whole cents, like the database", () => {
    assert.equal(calculator.calculate([item("0.5", "0.01")]).subtotal, "0.01");
    assert.equal(calculator.calculate([item("0.001", "0.01")]).subtotal, "0.00");
  });

  it("has no floating point drift", () => {
    // 0.1 + 0.2 style errors must not appear
    const result = calculator.calculate([item("1", "0.10"), item("1", "0.20")]);
    assert.equal(result.total_amount, "0.30");
  });

  it("refuses amounts that would not fit in the database", () => {
    assert.throws(() => calculator.calculate([item("999999999", "999999999999.99")]), ValidationError);
  });
});
