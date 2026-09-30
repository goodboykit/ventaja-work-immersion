import { createClient } from "@supabase/supabase-js";
import { CompanyApi } from "./api/company-api.ts";
import { InvoiceApi } from "./api/invoice-api.ts";
import { SupabaseAuthenticator } from "./auth/supabase-authenticator.ts";
import { SupabaseCompanyRepository } from "./repositories/supabase-company-repository.ts";
import { SupabaseInvoiceRepository } from "./repositories/supabase-invoice-repository.ts";
import { CompanyService } from "./services/company-service.ts";
import { InvoiceService } from "./services/invoice-service.ts";
import { MockGovernmentClient } from "./services/mock-government-client.ts";
import { SubmissionWorker } from "./services/submission-worker.ts";

export interface Backend {
  invoiceApi: InvoiceApi;
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

  return {
    invoiceApi: new InvoiceApi(authenticator, new InvoiceService(new SupabaseInvoiceRepository(db))),
    companyApi: new CompanyApi(authenticator, new CompanyService(companies)),
    worker: new SubmissionWorker(db, new MockGovernmentClient()),
  };
}
