import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { CompanyApi } from "../src/api/company-api.ts";
import { ConflictError, ValidationError } from "../src/domain/errors.ts";
import { CompanyService } from "../src/services/company-service.ts";
import { parseRegisterCompany } from "../src/validation/register-company-schema.ts";
import { FakeAuthenticator, newUser } from "./helpers/fake-authenticator.ts";
import { InMemoryCompanyRepository } from "./helpers/in-memory-company-repository.ts";

let service: CompanyService;
let api: CompanyApi;

const request = (method: string, body?: unknown, token = "token-new") =>
  new Request("http://localhost/api/company", {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
const bodyOf = async (response: Response) => (await response.json()) as any;

beforeEach(() => {
  const companies = new InMemoryCompanyRepository();
  service = new CompanyService(companies);
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
