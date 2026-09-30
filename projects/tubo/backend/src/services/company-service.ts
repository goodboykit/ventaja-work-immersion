import type { Identity } from "../auth/authenticator.ts";
import type { Company, Profile } from "../domain/company.ts";
import type { CompanyRepository } from "../repositories/company-repository.ts";
import type { RegisterCompanyInput } from "../validation/register-company-schema.ts";

export class CompanyService {
  private readonly companies: CompanyRepository;

  constructor(companies: CompanyRepository) {
    this.companies = companies;
  }

  async getProfile(identity: Identity): Promise<Profile> {
    return {
      user: { id: identity.userId, email: identity.email },
      company: await this.companies.findByUserId(identity.userId),
    };
  }

  register(identity: Identity, input: RegisterCompanyInput): Promise<Company> {
    return this.companies.register(identity.userId, input.name, input.tax_id);
  }
}
