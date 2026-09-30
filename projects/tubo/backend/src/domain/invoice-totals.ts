import { ValidationError } from "./errors.ts";

export interface ItemInput {
  description: string;
  quantity: string;
  unit_price: string;
  tax: string;
}

export interface CalculatedItem extends ItemInput {
  line_number: number;
  line_total: string;
}

export interface CalculatedTotals {
  items: CalculatedItem[];
  subtotal: string;
  tax_amount: string;
  total_amount: string;
}

// The database column limit: numeric(14,2) holds at most 12 digits before the decimal point.
const MAX_CENTS = 99_999_999_999_999n;

// Money is calculated with whole numbers (BigInt) so there are no floating-point rounding errors.
// The rules match the database exactly: line = round(quantity x unit_price, 2) + tax.
export class InvoiceTotalsCalculator {
  calculate(items: ItemInput[]): CalculatedTotals {
    let subtotal = 0n;
    let tax = 0n;

    const calculated = items.map((item, index) => {
      const lineAmount = this.roundToCents(this.toScaled(item.quantity, 3) * this.toScaled(item.unit_price, 2));
      const lineTax = this.toScaled(item.tax, 2);
      subtotal += lineAmount;
      tax += lineTax;
      return { ...item, line_number: index + 1, line_total: this.assertFits(lineAmount + lineTax) };
    });

    return {
      items: calculated,
      subtotal: this.assertFits(subtotal),
      tax_amount: this.assertFits(tax),
      total_amount: this.assertFits(subtotal + tax),
    };
  }

  // "12.5" with scale 3 becomes 12500n.
  private toScaled(value: string, scale: number): bigint {
    const [whole = "0", fraction = ""] = value.split(".");
    return BigInt(whole + fraction.padEnd(scale, "0"));
  }

  // quantity (3 decimals) x price (2 decimals) has 5 decimals; keep 2, rounding half up.
  private roundToCents(scaledBy5: bigint): bigint {
    return (scaledBy5 + 500n) / 1000n;
  }

  private assertFits(cents: bigint): string {
    if (cents > MAX_CENTS) {
      throw new ValidationError("An amount on this invoice is too large");
    }
    const digits = cents.toString().padStart(3, "0");
    return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
  }
}
