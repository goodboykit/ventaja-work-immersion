import { randomUUID } from "node:crypto";
import type { Company } from "../../src/domain/company.ts";
import { ConflictError } from "../../src/domain/errors.ts";
import type { CompanyRepository } from "../../src/repositories/company-repository.ts";

// A stand-in for the database that follows the same rules (one company per user, unique tax id).
export class InMemoryCompanyRepository implements CompanyRepository {
  private readonly byUser = new Map<string, Company>();

  async findByUserId(userId: string): Promise<Company | null> {
    return this.byUser.get(userId) ?? null;
  }

  async register(userId: string, name: string, taxId: string): Promise<Company> {
    if (this.byUser.has(userId)) throw new ConflictError("already_registered", "already registered");
    if ([...this.byUser.values()].some((c) => c.tax_id === taxId)) throw new ConflictError("tax_id_taken", "tax id taken");

    const company = { id: randomUUID(), name, tax_id: taxId };
    this.byUser.set(userId, company);
    return company;
  }
}
