import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { CompanyApi } from "../src/api/company-api.ts";
import { ConflictError, NotFoundError, ValidationError } from "../src/domain/errors.ts";
import { CompanyService } from "../src/services/company-service.ts";
import type { EmailSender, InviteEmail, ReportEmail } from "../src/services/email/email-sender.ts";
import { parseRegisterCompany } from "../src/validation/register-company-schema.ts";
import { authA, FakeAuthenticator, newUser } from "./helpers/fake-authenticator.ts";
import { InMemoryCompanyRepository } from "./helpers/in-memory-company-repository.ts";

// Records the invites it is asked to "send" so tests can assert on them.
class SpyEmailSender implements EmailSender {
  readonly sent: InviteEmail[] = [];
  readonly reports: ReportEmail[] = [];
  async sendInvite(email: InviteEmail): Promise<void> {
    this.sent.push(email);
  }
  async sendReport(email: ReportEmail): Promise<void> {
    this.reports.push(email);
  }
}

let service: CompanyService;
let api: CompanyApi;
let companies: InMemoryCompanyRepository;
let mailer: SpyEmailSender;

const request = (method: string, body?: unknown, token = "token-new") =>
  new Request("http://localhost/api/company", {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
const bodyOf = async (response: Response) => (await response.json()) as any;

beforeEach(() => {
  companies = new InMemoryCompanyRepository();
  mailer = new SpyEmailSender();
  service = new CompanyService(companies, mailer, "http://localhost:3000");
  api = new CompanyApi(new FakeAuthenticator(), service);
});

describe("parseRegisterCompany", () => {
  it("accepts and trims a valid company", () => {
    assert.deepEqual(parseRegisterCompany({ name: "  ABC Corp ", tax_id: " 123-456-789 " }), { name: "ABC Corp", tax_id: "123-456-789" });
  });

  it("rejects bad input", () => {
    for (const body of [{}, { name: "", tax_id: "123-456" }, { name: "A", tax_id: "12" }, { name: "A", tax_id: "12$34" }, { name: "A", tax_id: "123-456", extra: 1 }, "text"]) {
      assert.throws(() => parseRegisterCompany(body), ValidationError, JSON.stringify(body));
    }
  });
});

describe("CompanyService", () => {
  it("has no company until one is registered, then returns it", async () => {
    assert.equal((await service.getProfile(newUser)).company, null);
    const company = await service.register(newUser, { name: "ABC Corp", tax_id: "123-456-789" });
    const profile = await service.getProfile(newUser);
    assert.deepEqual(profile.company, company);
    assert.equal(profile.user.email, "new@example.com");
  });

  it("refuses a second company for the same user", async () => {
    await service.register(newUser, { name: "ABC", tax_id: "111-111" });
    await assert.rejects(service.register(newUser, { name: "XYZ", tax_id: "222-222" }), ConflictError);
  });

  it("refuses a tax id that another company already uses", async () => {
    await service.register(newUser, { name: "ABC", tax_id: "111-111" });
    await assert.rejects(service.register({ userId: "someone-else", email: null }, { name: "Copycat", tax_id: "111-111" }), ConflictError);
  });
});

describe("GET /api/me", () => {
  it("200 with company null for a new user", async () => {
    const response = await api.getMe(request("GET"));
    const body = await bodyOf(response);
    assert.equal(response.status, 200);
    assert.equal(body.data.company, null);
    assert.equal(body.data.user.email, "new@example.com");
  });

  it("401 without a valid token", async () => {
    assert.equal((await api.getMe(request("GET", undefined, "bad"))).status, 401);
  });
});

describe("POST /api/company", () => {
  it("201 and the company is then returned by /api/me", async () => {
    const response = await api.registerCompany(request("POST", { name: "ABC Corp", tax_id: "123-456-789" }));
    assert.equal(response.status, 201);
    assert.equal((await bodyOf(response)).data.name, "ABC Corp");
    assert.equal((await bodyOf(await api.getMe(request("GET")))).data.company.name, "ABC Corp");
  });

  it("400 for invalid details, with field names", async () => {
    const response = await api.registerCompany(request("POST", { name: "", tax_id: "x" }));
    const body = await bodyOf(response);
    assert.equal(response.status, 400);
    assert.deepEqual(body.error.details.map((d: { field: string }) => d.field).sort(), ["name", "tax_id"]);
  });

  it("409 already_registered when the user already has a company", async () => {
    await api.registerCompany(request("POST", { name: "ABC", tax_id: "111-111" }));
    const response = await api.registerCompany(request("POST", { name: "ABC", tax_id: "111-111" }));
    assert.equal(response.status, 409);
    assert.equal((await bodyOf(response)).error.code, "already_registered");
  });

  it("401 without a token", async () => {
    const noToken = new Request("http://localhost/api/company", { method: "POST", body: "{}" });
    assert.equal((await api.registerCompany(noToken)).status, 401);
  });
});

describe("Team invitations — service", () => {
  const companyA = { id: authA.companyId, name: "Company A", tax_id: "AAA-111" };

  it("invite creates a pending invite and sends an email with the accept link", async () => {
    companies.seedMembership(authA.userId, companyA);
    const result = await service.invite(authA, "teammate@example.com");

    assert.match(result.acceptUrl, /^http:\/\/localhost:3000\/invite\/.+/);
    assert.equal(mailer.sent.length, 1);
    assert.equal(mailer.sent[0]!.to, "teammate@example.com");
    assert.equal(mailer.sent[0]!.companyName, "Company A");
    assert.equal(mailer.sent[0]!.acceptUrl, result.acceptUrl);

    const pending = await service.listInvitations(authA);
    assert.equal(pending.length, 1);
    assert.equal(pending[0]!.email, "teammate@example.com");
  });

  it("a second user can accept and joins the same company", async () => {
    companies.seedMembership(authA.userId, companyA);
    await service.invite(authA, "teammate@example.com");
    const token = mailer.sent[0]!.acceptUrl.split("/invite/")[1]!;

    const joined = await service.acceptInvite(newUser, token);
    assert.equal(joined.id, companyA.id);
    // now the new user's profile shows the SAME company
    assert.deepEqual((await service.getProfile(newUser)).company, companyA);
  });

  it("an invite is single-use", async () => {
    companies.seedMembership(authA.userId, companyA);
    await service.invite(authA, "teammate@example.com");
    const token = mailer.sent[0]!.acceptUrl.split("/invite/")[1]!;

    await service.acceptInvite(newUser, token);
    await assert.rejects(service.acceptInvite({ userId: "someone-else", email: null }, token), NotFoundError);
  });

  it("a user who already has a company cannot accept", async () => {
    companies.seedMembership(authA.userId, companyA);
    await service.invite(authA, "teammate@example.com");
    const token = mailer.sent[0]!.acceptUrl.split("/invite/")[1]!;
    await assert.rejects(service.acceptInvite({ userId: authA.userId, email: "a@example.com" }, token), ConflictError);
  });

  it("an expired invite cannot be accepted", async () => {
    companies.seedMembership(authA.userId, companyA);
    // create an already-expired invite directly through the repo
    await companies.createInvitation(authA.userId, "late@example.com", "expired-token-0000000000", new Date(Date.now() - 1000).toISOString());
    await assert.rejects(service.acceptInvite(newUser, "expired-token-0000000000"), NotFoundError);
  });

  it("rejects a duplicate pending invite for the same email", async () => {
    companies.seedMembership(authA.userId, companyA);
    await service.invite(authA, "dup@example.com");
    await assert.rejects(service.invite(authA, "dup@example.com"), ConflictError);
  });
});

describe("Team invitations — API", () => {
  const companyA = { id: authA.companyId, name: "Company A", tax_id: "AAA-111" };
  const inviteReq = (body: unknown, token = "token-a") =>
    new Request("http://localhost/api/invitations", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("POST /api/invitations returns 201 with an accept link", async () => {
    companies.seedMembership(authA.userId, companyA);
    const response = await api.invite(inviteReq({ email: "teammate@example.com" }));
    assert.equal(response.status, 201);
    assert.match((await bodyOf(response)).data.acceptUrl, /\/invite\//);
  });

  it("POST /api/invitations 403 when the caller has no company", async () => {
    const response = await api.invite(inviteReq({ email: "x@example.com" }, "token-new"));
    assert.equal(response.status, 403);
  });

  it("POST /api/invitations 400 for a bad email", async () => {
    companies.seedMembership(authA.userId, companyA);
    assert.equal((await api.invite(inviteReq({ email: "not-an-email" }))).status, 400);
  });

  it("POST /api/invitations/accept 200 lets a new user join", async () => {
    companies.seedMembership(authA.userId, companyA);
    await service.invite(authA, "teammate@example.com");
    const token = mailer.sent[0]!.acceptUrl.split("/invite/")[1]!;
    const acceptReq = new Request("http://localhost/api/invitations/accept", {
      method: "POST",
      headers: { authorization: "Bearer token-new", "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const response = await api.acceptInvite(acceptReq);
    assert.equal(response.status, 200);
    assert.equal((await bodyOf(response)).data.id, companyA.id);
  });
});
