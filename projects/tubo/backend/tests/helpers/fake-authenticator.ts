import type { AuthContext, Authenticator, Identity } from "../../src/auth/authenticator.ts";
import { ForbiddenError, UnauthorizedError } from "../../src/domain/errors.ts";

export const COMPANY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const COMPANY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

export const authA: AuthContext = { userId: "11111111-1111-4111-8111-111111111111", companyId: COMPANY_A };
export const authB: AuthContext = { userId: "22222222-2222-4222-8222-222222222222", companyId: COMPANY_B };
export const newUser: Identity = { userId: "33333333-3333-4333-8333-333333333333", email: "new@example.com" };

interface Account {
  identity: Identity;
  companyId: string | null;
}

// token-a / token-b belong to a company; token-new has a login but no company yet.
const ACCOUNTS: Record<string, Account> = {
  "token-a": { identity: { userId: authA.userId, email: "a@example.com" }, companyId: COMPANY_A },
  "token-b": { identity: { userId: authB.userId, email: "b@example.com" }, companyId: COMPANY_B },
  "token-new": { identity: newUser, companyId: null },
};

export class FakeAuthenticator implements Authenticator {
  async identify(request: Request): Promise<Identity> {
    return this.accountFor(request).identity;
  }

  async authenticate(request: Request): Promise<AuthContext> {
    const account = this.accountFor(request);
    if (!account.companyId) throw new ForbiddenError("Set up your company before using invoices", "no_company");
    return { userId: account.identity.userId, companyId: account.companyId };
  }

  private accountFor(request: Request): Account {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const account = token ? ACCOUNTS[token] : undefined;
    if (!account) throw new UnauthorizedError();
    return account;
  }
}
