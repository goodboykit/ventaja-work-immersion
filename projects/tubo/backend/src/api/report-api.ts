import type { Authenticator } from "../auth/authenticator.ts";
import { AppError, ValidationError } from "../domain/errors.ts";
import type { CompanyRepository } from "../repositories/company-repository.ts";
import type { AuditService } from "../services/audit-service.ts";
import { monthRange } from "../services/audit-service.ts";
import type { EmailSender } from "../services/email/email-sender.ts";
import { json, respond } from "./http.ts";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Reporting and audit-trail endpoints. All scoped to the caller's company.
export class ReportApi {
  private readonly authenticator: Authenticator;
  private readonly audit: AuditService;
  private readonly companies: CompanyRepository;
  private readonly email: EmailSender;
  private readonly appBaseUrl: string;

  constructor(
    authenticator: Authenticator,
    audit: AuditService,
    companies: CompanyRepository,
    email: EmailSender,
    appBaseUrl: string,
  ) {
    this.authenticator = authenticator;
    this.audit = audit;
    this.companies = companies;
    this.email = email;
    this.appBaseUrl = appBaseUrl.replace(/\/+$/, "");
  }

  // GET /api/audit?from=YYYY-MM-DD&to=YYYY-MM-DD
  listAudit(request: Request): Promise<Response> {
    return respond(async () => {
      const auth = await this.authenticator.authenticate(request);
      const params = new URL(request.url).searchParams;
      const from = this.optionalDate(params.get("from"), "from");
      const to = this.optionalDate(params.get("to"), "to");
      return json(200, { data: await this.audit.listEvents(auth.companyId, from, to) });
    });
  }

  // GET /api/reports/monthly?month=YYYY-MM
  monthlyReport(request: Request): Promise<Response> {
    return respond(async () => {
      const auth = await this.authenticator.authenticate(request);
      const month = this.requiredMonth(new URL(request.url).searchParams.get("month"));
      const company = await this.companies.findByUserId(auth.userId);
      const report = await this.audit.monthlyReport(company?.name ?? "Your company", auth.companyId, month);
      return json(200, { data: report });
    });
  }

  // GET /api/reports/audit?from=&to=
  auditReport(request: Request): Promise<Response> {
    return respond(async () => {
      const auth = await this.authenticator.authenticate(request);
      const params = new URL(request.url).searchParams;
      const from = this.optionalDate(params.get("from"), "from");
      const to = this.optionalDate(params.get("to"), "to");
      const company = await this.companies.findByUserId(auth.userId);
      const report = await this.audit.auditReport(company?.name ?? "Your company", auth.companyId, from, to);
      return json(200, { data: report });
    });
  }

  // POST /api/reports/monthly/email  { month, to? }
  emailMonthlyReport(request: Request): Promise<Response> {
    return respond(async () => {
      const auth = await this.authenticator.authenticate(request);
      const identity = await this.authenticator.identify(request);
      const body = (await request.json().catch(() => ({}))) as { month?: string; to?: string };
      const month = this.requiredMonth(body.month ?? null);
      const recipient = body.to ?? identity.email;
      if (!recipient) throw new ValidationError("No recipient email is available for this report");

      const company = await this.companies.findByUserId(auth.userId);
      const report = await this.audit.monthlyReport(company?.name ?? "Your company", auth.companyId, month);
      const { label } = monthRange(month);

      try {
        await this.email.sendReport({
          to: recipient,
          subject: `Monthly invoicing report — ${label}`,
          intro: `Please find below a summary of the invoices issued by ${report.company} during ${label}.`,
          lines: [
            `Total invoices: ${report.totalCount}`,
            ...report.counts.map((c) => `${c.label}: ${c.count}`),
            `Total value: ${Number(report.totalAmount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          ],
          viewUrl: `${this.appBaseUrl}/report/monthly?month=${month}`,
        });
      } catch (err) {
        // The email provider rejected or failed. Report it clearly (not a raw 500), and include
        // the view link so the user can still open the report.
        throw new AppError(502, "email_failed",
          `The report could not be emailed (${(err as Error).message}). You can still open it from the dashboard.`);
      }

      return json(200, { data: { emailed: true, to: recipient, month } });
    });
  }

  private requiredMonth(value: string | null): string {
    if (!value || !MONTH.test(value)) throw new ValidationError("Provide a month as YYYY-MM");
    return value;
  }

  private optionalDate(value: string | null, field: string): string | null {
    if (!value) return null;
    if (!DATE.test(value)) throw new ValidationError(`${field} must be YYYY-MM-DD`);
    return value;
  }
}
