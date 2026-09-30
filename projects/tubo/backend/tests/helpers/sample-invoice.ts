// A valid invoice body. Totals: subtotal 149.98, tax 18.00, total 167.98.
export function sampleInvoice(overrides: Record<string, unknown> = {}) {
  return {
    invoice_number: "INV-10001",
    invoice_date: "2026-09-30",
    customer_name: "Juan Dela Cruz",
    customer_tax_id: "123-456-789",
    customer_email: "juan@example.com",
    currency: "php",
    items: [
      { description: "Widget", quantity: 2.5, unit_price: 19.99, tax: 6 },
      { description: "Service", quantity: 1, unit_price: 100, tax: 12 },
    ],
    ...overrides,
  };
}
