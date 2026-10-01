import type { AuditEvent, AuditReport, Company, Invitation, InvoiceDetail, InvoiceStatus, InvoiceSummary, MonthlyReport, Profile, StatusSummary } from "@tubo/backend/shared";

export type { Invitation, AuditEvent, AuditReport, MonthlyReport };

// An error the API reported (or a network problem, which has status 0).
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  // True when we do not know whether the server received the request.
  get isConnectionProblem(): boolean {
    return this.status === 0;
  }
}

export type TokenProvider = () => Promise<string | null>;

export interface InvoiceQuery {
  status?: InvoiceStatus;
  invoiceNumber?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  cursor?: string;
}

export interface InvoicePage {
  data: InvoiceSummary[];
  next_cursor: string | null;
}

export interface CreateInvoiceBody {
  invoice_number: string;
  invoice_date: string;
  customer_name: string;
  customer_tax_id: string;
  customer_email: string;
  currency: string;
  items: { description: string; quantity: string; unit_price: string; tax: string }[];
}

export interface CreatedInvoice {
  id: string;
  status: InvoiceStatus;
  replayed: boolean;
}

export interface ApiClientOptions {
  fetchFn?: typeof fetch;
  onUnauthorized?: () => void;
  timeoutMs?: number;
}

// The one place the frontend talks to the backend. It adds the sign-in token to every call
// and turns every failure into an ApiError.
export class ApiClient {
  private readonly getToken: TokenProvider;
  private readonly fetchFn: typeof fetch;
  private readonly onUnauthorized: (() => void) | undefined;
  private readonly timeoutMs: number;

  constructor(getToken: TokenProvider, options: ApiClientOptions = {}) {
    this.getToken = getToken;
    this.fetchFn = options.fetchFn ?? ((...args) => fetch(...args));
    this.onUnauthorized = options.onUnauthorized;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  getMe(): Promise<Profile> {
    return this.request<{ data: Profile }>("GET", "/api/me").then((r) => r.data);
  }

  registerCompany(name: string, taxId: string): Promise<Company> {
    return this.request<{ data: Company }>("POST", "/api/company", { name, tax_id: taxId }).then((r) => r.data);
  }

  inviteTeammate(email: string): Promise<{ email: string; acceptUrl: string; expiresAt: string }> {
    return this.request<{ data: { email: string; acceptUrl: string; expiresAt: string } }>(
      "POST", "/api/invitations", { email },
    ).then((r) => r.data);
  }

  listInvitations(): Promise<Invitation[]> {
    return this.request<{ data: Invitation[] }>("GET", "/api/invitations").then((r) => r.data);
  }

  acceptInvite(token: string): Promise<Company> {
    return this.request<{ data: Company }>("POST", "/api/invitations/accept", { token }).then((r) => r.data);
  }

  listAudit(from?: string, to?: string): Promise<AuditEvent[]> {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    const qs = p.toString();
    return this.request<{ data: AuditEvent[] }>("GET", `/api/audit${qs ? `?${qs}` : ""}`).then((r) => r.data);
  }

  monthlyReport(month: string): Promise<MonthlyReport> {
    return this.request<{ data: MonthlyReport }>("GET", `/api/reports/monthly?month=${encodeURIComponent(month)}`).then((r) => r.data);
  }

  emailMonthlyReport(month: string, to?: string): Promise<{ emailed: boolean; to: string }> {
    return this.request<{ data: { emailed: boolean; to: string } }>("POST", "/api/reports/monthly/email", { month, to }).then((r) => r.data);
  }

  auditReport(from?: string, to?: string): Promise<AuditReport> {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    const qs = p.toString();
    return this.request<{ data: AuditReport }>("GET", `/api/reports/audit${qs ? `?${qs}` : ""}`).then((r) => r.data);
  }

  getSummary(dateFrom?: string, dateTo?: string): Promise<StatusSummary> {
    const p = new URLSearchParams();
    if (dateFrom) p.set("date_from", dateFrom);
    if (dateTo) p.set("date_to", dateTo);
    const qs = p.toString();
    return this.request<{ data: StatusSummary }>("GET", `/api/v1/invoices/summary${qs ? `?${qs}` : ""}`).then((r) => r.data);
  }

  listInvoices(query: InvoiceQuery = {}): Promise<InvoicePage> {
    const params = new URLSearchParams();
    if (query.status) params.set("status", query.status);
    if (query.invoiceNumber) params.set("invoice_number", query.invoiceNumber);
    if (query.dateFrom) params.set("date_from", query.dateFrom);
    if (query.dateTo) params.set("date_to", query.dateTo);
    if (query.limit) params.set("limit", String(query.limit));
    if (query.cursor) params.set("cursor", query.cursor);
    const queryString = params.toString();
    return this.request<InvoicePage>("GET", `/api/v1/invoices${queryString ? `?${queryString}` : ""}`);
  }

  getInvoice(id: string): Promise<InvoiceDetail> {
    return this.request<{ data: InvoiceDetail }>("GET", `/api/v1/invoices/${encodeURIComponent(id)}`).then((r) => r.data);
  }

  createInvoice(body: CreateInvoiceBody, idempotencyKey: string): Promise<CreatedInvoice> {
    return this.request<{ data: CreatedInvoice }>("POST", "/api/v1/invoices", body, { "Idempotency-Key": idempotencyKey }).then((r) => r.data);
  }

  retryInvoice(id: string): Promise<{ id: string; status: InvoiceStatus }> {
    return this.request<{ data: { id: string; status: InvoiceStatus } }>("POST", `/api/v1/invoices/${encodeURIComponent(id)}/retry`).then((r) => r.data);
  }

  chat(message: string): Promise<{ answer: string }> {
    return this.request<{ data: { answer: string } }>("POST", "/api/chat", { message }).then((r) => r.data);
  }

  private async request<T>(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
    const token = await this.getToken();
    const headers: Record<string, string> = { ...extraHeaders };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let response: Response;
    try {
      response = await this.fetchFn(path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === "TimeoutError";
      throw new ApiError(
        0,
        timedOut ? "timeout" : "network_error",
        timedOut ? "The server took too long to answer" : "Could not reach the server",
      );
    }

    const payload = await response.json().catch(() => null);
    if (response.ok) return payload as T;

    if (response.status === 401) this.onUnauthorized?.();
    const error = (payload as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "unknown_error",
      error?.message ?? `The request failed (HTTP ${response.status})`,
      error?.details,
    );
  }
}
