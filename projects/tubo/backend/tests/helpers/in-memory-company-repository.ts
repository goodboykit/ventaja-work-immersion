import { randomUUID } from "node:crypto";
import type { Company, Invitation } from "../../src/domain/company.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "../../src/domain/errors.ts";
import type { CompanyRepository, NewInvitation } from "../../src/repositories/company-repository.ts";

interface StoredInvite {
  id: string;
  companyId: string;
  email: string;
  token: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  createdAt: string;
  expiresAt: string;
}

// A stand-in for the database that follows the same rules as the SQL RPCs
// (one company per user, unique tax id, single-use expiring invites).
export class InMemoryCompanyRepository implements CompanyRepository {
  private readonly byUser = new Map<string, Company>();
  private readonly invites: StoredInvite[] = [];

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

  async createInvitation(inviterUserId: string, email: string, token: string, expiresAt: string): Promise<NewInvitation> {
    const company = this.byUser.get(inviterUserId);
    if (!company) throw new ForbiddenError("Set up your company before inviting teammates", "no_company");

    const duplicate = this.invites.some(
      (i) => i.companyId === company.id && i.email.toLowerCase() === email.toLowerCase() && i.status === "pending",
    );
    if (duplicate) throw new ConflictError("invite_already_pending", "There is already a pending invite for that email");

    const invite: StoredInvite = {
      id: randomUUID(), companyId: company.id, email, token,
      status: "pending", createdAt: new Date().toISOString(), expiresAt,
    };
    this.invites.push(invite);
    return { companyId: company.id, email, token, expiresAt };
  }

  async acceptInvitation(userId: string, token: string): Promise<Company> {
    const invite = this.invites.find((i) => i.token === token);
    if (!invite || invite.status !== "pending") throw new NotFoundError("This invite is invalid or has expired");
    if (new Date(invite.expiresAt).getTime() <= Date.now()) {
      invite.status = "expired";
      throw new NotFoundError("This invite is invalid or has expired");
    }
    if (this.byUser.has(userId)) throw new ConflictError("already_in_company", "Your account already belongs to a company");

    const company = [...this.byUser.values()].find((c) => c.id === invite.companyId)!;
    this.byUser.set(userId, company);
    invite.status = "accepted";
    return company;
  }

  async listInvitations(companyId: string): Promise<Invitation[]> {
    return this.invites
      .filter((i) => i.companyId === companyId && i.status === "pending")
      .map((i) => ({ id: i.id, email: i.email, status: i.status, created_at: i.createdAt, expires_at: i.expiresAt }));
  }

  // Test helper: pre-link a user to a company without going through register().
  seedMembership(userId: string, company: Company): void {
    this.byUser.set(userId, company);
  }
}
