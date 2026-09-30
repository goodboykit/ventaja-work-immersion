import { createClient } from "@supabase/supabase-js";
import { CompanyApi } from "./api/company-api.ts";
import { InvoiceApi } from "./api/invoice-api.ts";
import { InvoiceApiV2 } from "./api/invoice-api-v2.ts";
import { ReportApi } from "./api/report-api.ts";
import { SupabaseAuthenticator } from "./auth/supabase-authenticator.ts";
import { SupabaseAuditRepository } from "./repositories/supabase-audit-repository.ts";
import { SupabaseCompanyRepository } from "./repositories/supabase-company-repository.ts";
import { SupabaseInvoiceRepository } from "./repositories/supabase-invoice-repository.ts";
import { AuditService } from "./services/audit-service.ts";
import { CompanyService } from "./services/company-service.ts";
import { ConsoleEmailSender } from "./services/email/console-email-sender.ts";
import { ResendEmailSender } from "./services/email/resend-email-sender.ts";
import type { EmailSender } from "./services/email/email-sender.ts";
import { InvoiceService } from "./services/invoice-service.ts";
import { MockGovernmentClient } from "./services/mock-government-client.ts";
import { SubmissionWorker } from "./services/submission-worker.ts";
import { TokenBucketRateLimiter } from "./services/token-bucket-rate-limiter.ts";

export interface Backend {
  invoiceApi: InvoiceApi;
  invoiceApiV2: InvoiceApiV2;
  companyApi: CompanyApi;
  reportApi: ReportApi;
  worker: SubmissionWorker;
}

export function createBackend(env: Record<string, string | undefined> = process.env): Backend {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const companies = new SupabaseCompanyRepository(db);
  const authenticator = new SupabaseAuthenticator(db, companies);

  const invoiceRepo = new SupabaseInvoiceRepository(db);
  const auditRepo = new SupabaseAuditRepository(db);
  const invoiceService = new InvoiceService(invoiceRepo);
  const auditService = new AuditService(auditRepo, invoiceRepo);

  // Email transport is behind an interface. The console sender logs the invite link so the
  // flow works without an email service; swap in a real EmailSender (Resend/SMTP) for production.
  // The app base URL is used to build invite links. Prefer an explicit setting, then fall back
  // to the domain Vercel injects automatically, then to localhost for local dev.
  const appBaseUrl =
    env.NEXT_PUBLIC_APP_URL ??
    (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined) ??
    (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : undefined) ??
    "http://localhost:3000";

  // Use real email (Resend) when an API key is configured; otherwise log the invite link
  // to the console so local dev and demos work with no email service.
  const emailSender: EmailSender = env.RESEND_API_KEY
    ? new ResendEmailSender(env.RESEND_API_KEY, env.EMAIL_FROM)
    : new ConsoleEmailSender();
  const companyService = new CompanyService(companies, emailSender, appBaseUrl, auditRepo);

  return {
    invoiceApi: new InvoiceApi(authenticator, invoiceService),
    invoiceApiV2: new InvoiceApiV2(authenticator, invoiceService),
    companyApi: new CompanyApi(authenticator, companyService),
    reportApi: new ReportApi(authenticator, auditService, companies, emailSender, appBaseUrl),
    worker: new SubmissionWorker(db, new MockGovernmentClient(), new TokenBucketRateLimiter(100, 100)),
  };
}
