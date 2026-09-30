import type { SupabaseClient } from "@supabase/supabase-js";
import type { Company, Invitation } from "../domain/company.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "../domain/errors.ts";
import type { CompanyRepository, NewInvitation } from "./company-repository.ts";

export class SupabaseCompanyRepository implements CompanyRepository {
  private readonly db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.db = db;
  }

  async findByUserId(userId: string): Promise<Company | null> {
    const { data, error } = await this.db
      .from("users")
      .select("companies(id, name, tax_id)")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error(`Database error: ${error.message}`);
    if (!data) return null;

    const company = (data as unknown as { companies: Company | Company[] | null }).companies;
    return (Array.isArray(company) ? company[0] : company) ?? null;
  }

  async register(userId: string, name: string, taxId: string): Promise<Company> {
    const { data, error } = await this.db.rpc("register_company", {
      p_user_id: userId,
      p_name: name,
      p_tax_id: taxId,
    });
    if (error) {
      if (error.message === "already_registered") {
        throw new ConflictError("already_registered", "Your account already belongs to a company");
      }
      if (error.message === "tax_id_taken") {
        throw new ConflictError("tax_id_taken", "A company with this Tax ID is already registered");
      }
      throw new Error(`Database error: ${error.message}`);
    }
    return data as Company;
  }

  async createInvitation(inviterUserId: string, email: string, token: string, expiresAt: string): Promise<NewInvitation> {
    const { data, error } = await this.db.rpc("create_invitation", {
      p_inviter: inviterUserId,
      p_email: email,
      p_token: token,
      p_expires: expiresAt,
    });
    if (error) {
      if (error.message === "no_company") {
        throw new ForbiddenError("Set up your company before inviting teammates", "no_company");
      }
      if (error.message === "already_member") {
        throw new ConflictError("already_member", "That person is already in your company");
      }
      if (error.message === "invite_already_pending") {
        throw new ConflictError("invite_already_pending", "There is already a pending invite for that email");
      }
      throw new Error(`Database error: ${error.message}`);
    }
    const row = data as { company_id: string; email: string; token: string; expires_at: string };
    return { companyId: row.company_id, email: row.email, token: row.token, expiresAt: row.expires_at };
  }

  async acceptInvitation(userId: string, token: string): Promise<Company> {
    const { data, error } = await this.db.rpc("accept_invitation", {
      p_user_id: userId,
      p_token: token,
    });
    if (error) {
      if (error.message === "invalid_or_expired_invite") {
        throw new NotFoundError("This invite is invalid or has expired");
      }
      if (error.message === "already_in_company") {
        throw new ConflictError("already_in_company", "Your account already belongs to a company");
      }
      throw new Error(`Database error: ${error.message}`);
    }
    return data as Company;
  }

  async listInvitations(companyId: string): Promise<Invitation[]> {
    const { data, error } = await this.db.rpc("list_invitations", { p_company_id: companyId });
    if (error) throw new Error(`Database error: ${error.message}`);
    return (data ?? []) as Invitation[];
  }
}
