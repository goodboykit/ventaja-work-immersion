import type { Company, Invitation } from "../domain/company.ts";

export interface NewInvitation {
  companyId: string;
  email: string;
  token: string;
  expiresAt: string;
}

// Companies, the link between a login and its company, and team invitations.
export interface CompanyRepository {
  findByUserId(userId: string): Promise<Company | null>;
  register(userId: string, name: string, taxId: string): Promise<Company>;
  createInvitation(inviterUserId: string, email: string, token: string, expiresAt: string): Promise<NewInvitation>;
  acceptInvitation(userId: string, token: string): Promise<Company>;
  listInvitations(companyId: string): Promise<Invitation[]>;
}
