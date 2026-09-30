import { randomBytes } from "node:crypto";
import type { AuthContext, Identity } from "../auth/authenticator.ts";
import type { Company, Invitation, Profile } from "../domain/company.ts";
import type { CompanyRepository } from "../repositories/company-repository.ts";
import type { RegisterCompanyInput } from "../validation/register-company-schema.ts";
import type { EmailSender } from "./email/email-sender.ts";

const INVITE_TTL_DAYS = 7;

export class CompanyService {
  private readonly companies: CompanyRepository;
  private readonly email: EmailSender;
  private readonly appBaseUrl: string;

  constructor(companies: CompanyRepository, email: EmailSender, appBaseUrl: string) {
    this.companies = companies;
    this.email = email;
    this.appBaseUrl = appBaseUrl.replace(/\/+$/, "");
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

  // Invite a teammate by email. Returns the accept URL so a caller (or a mock email sender)
  // can display it; in production the real email carries this same link.
  async invite(auth: AuthContext, email: string): Promise<{ email: string; acceptUrl: string; expiresAt: string }> {
    const token = randomBytes(24).toString("base64url"); // 32 url-safe chars, unguessable
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const invite = await this.companies.createInvitation(auth.userId, email, token, expiresAt);
    const acceptUrl = `${this.appBaseUrl}/invite/${invite.token}`;

    const company = await this.companies.findByUserId(auth.userId);
    await this.email.sendInvite({ to: email, companyName: company?.name ?? "your company", acceptUrl });

    return { email, acceptUrl, expiresAt: invite.expiresAt };
  }

  acceptInvite(identity: Identity, token: string): Promise<Company> {
    return this.companies.acceptInvitation(identity.userId, token);
  }

  listInvitations(auth: AuthContext): Promise<Invitation[]> {
    return this.companies.listInvitations(auth.companyId);
  }
}
