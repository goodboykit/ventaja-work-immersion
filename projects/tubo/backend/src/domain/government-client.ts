export interface GovernmentInvoice {
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  customerTaxId: string;
  customerEmail: string;
  currency: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  items: {
    lineNumber: number;
    description: string;
    quantity: number;
    unitPrice: number;
    tax: number;
    lineTotal: number;
  }[];
}

export type SubmissionOutcome =
  | { result: "success"; externalRef: string; httpStatus: number }
  | { result: "rejected"; reason: string; httpStatus: number }
  | { result: "retryable_error"; error: string; httpStatus: number }
  | { result: "timeout"; error: string };

export interface GovernmentClient {
  submitInvoice(invoice: GovernmentInvoice): Promise<SubmissionOutcome>;
}
