import { createClient } from "@supabase/supabase-js";
import { CompanyApi } from "./api/company-api.ts";
import { InvoiceApi } from "./api/invoice-api.ts";
import { InvoiceApiV2 } from "./api/invoice-api-v2.ts";
import { SupabaseAuthenticator } from "./auth/supabase-authenticator.ts";
import { SupabaseCompanyRepository } from "./repositories/supabase-company-repository.ts";
import { SupabaseInvoiceRepository } from "./repositories/supabase-invoice-repository.ts";
import { CompanyService } from "./services/company-service.ts";
import { InvoiceService } from "./services/invoice-service.ts";
import { MockGovernmentClient } from "./services/mock-government-client.ts";
import { SubmissionWorker } from "./services/submission-worker.ts";
import { TokenBucketRateLimiter } from "./services/token-bucket-rate-limiter.ts";

export interface Backend {
  invoiceApi: InvoiceApi;
  invoiceApiV2: InvoiceApiV2;
  companyApi: CompanyApi;
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

  const invoiceService = new InvoiceService(new SupabaseInvoiceRepository(db));

  return {
    invoiceApi: new InvoiceApi(authenticator, invoiceService),
    invoiceApiV2: new InvoiceApiV2(authenticator, invoiceService),
    companyApi: new CompanyApi(authenticator, new CompanyService(companies)),
    worker: new SubmissionWorker(db, new MockGovernmentClient(), new TokenBucketRateLimiter(100, 100)),
  };
}
