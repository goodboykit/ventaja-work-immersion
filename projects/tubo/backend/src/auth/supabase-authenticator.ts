import type { SupabaseClient } from "@supabase/supabase-js";
import { ForbiddenError, UnauthorizedError } from "../domain/errors.ts";
import type { CompanyRepository } from "../repositories/company-repository.ts";
import type { AuthContext, Authenticator, Identity } from "./authenticator.ts";

// Expects "Authorization: Bearer <Supabase access token>". Supabase itself verifies the token,
// then we look up which company the user belongs to.
export class SupabaseAuthenticator implements Authenticator {
  private readonly db: SupabaseClient;
  private readonly companies: CompanyRepository;

  constructor(db: SupabaseClient, companies: CompanyRepository) {
    this.db = db;
    this.companies = companies;
  }

  async identify(request: Request): Promise<Identity> {
    const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) throw new UnauthorizedError("Send your access token as: Authorization: Bearer <token>");

    const { data, error } = await this.db.auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedError("The access token is invalid or has expired");

    return { userId: data.user.id, email: data.user.email ?? null };
  }

  async authenticate(request: Request): Promise<AuthContext> {
    const identity = await this.identify(request);
    const company = await this.companies.findByUserId(identity.userId);
    if (!company) throw new ForbiddenError("Set up your company before using invoices", "no_company");
    return { userId: identity.userId, companyId: company.id };
  }
}
