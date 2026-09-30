import type { SupabaseClient } from "@supabase/supabase-js";
import type { Company } from "../domain/company.ts";
import { ConflictError } from "../domain/errors.ts";
import type { CompanyRepository } from "./company-repository.ts";

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
}
