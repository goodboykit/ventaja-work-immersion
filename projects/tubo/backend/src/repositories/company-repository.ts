import type { Company } from "../domain/company.ts";

// Companies and the link between a login and its company.
export interface CompanyRepository {
  findByUserId(userId: string): Promise<Company | null>;
  register(userId: string, name: string, taxId: string): Promise<Company>;
}
