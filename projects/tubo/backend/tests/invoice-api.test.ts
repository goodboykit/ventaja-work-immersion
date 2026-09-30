import assert from "node:assert/strict";
import { beforeEach, describe, it, mock } from "node:test";
import { InvoiceApi } from "../src/api/invoice-api.ts";
import { InvoiceService } from "../src/services/invoice-service.ts";
import { FakeAuthenticator } from "./helpers/fake-authenticator.ts";
import { InMemoryInvoiceRepository } from "./helpers/in-memory-invoice-repository.ts";
import { sampleInvoice } from "./helpers/sample-invoice.ts";

let repository: InMemoryInvoiceRepository;
let api: InvoiceApi;

const BASE = "http://localhost/api/invoices";

function post(body: unknown, headers: Record<string, string> = {}, url = BASE) {
  return new Request(url, {
    method: "POST",
    headers: { authorization: "Bearer token-a", "content-type": "application/json", "idempotency-key": "key-12345678", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
const get = (url: string, token = "token-a") => new Request(url, { headers: { authorization: `Bearer ${token}` } });
const bodyOf = async (response: Response) => (await response.json()) as any;

beforeEach(() => {
  repository = new InMemoryInvoiceRepository();
  api = new InvoiceApi(new FakeAuthenticator(), new InvoiceService(repository));
});

describe("POST /api/invoices", () => {
  it("201 with a Location header when created", async () => {
    const response = await api.createInvoice(post(sampleInvoice()));
    const body = await bodyOf(response);
    assert.equal(response.status, 201);
    assert.equal(response.headers.get("location"), `/api/invoices/${body.data.id}`);
    assert.equal(body.data.status, "pending");
  });

  it("200 and Idempotent-Replayed when the same request is sent again", async () => {
    const first = await bodyOf(await api.createInvoice(post(sampleInvoice())));
    const response = await api.createInvoice(post(sampleInvoice()));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("idempotent-replayed"), "true");
    assert.equal((await bodyOf(response)).data.id, first.data.id);
  });

  it("401 without a token", async () => {
    const request = new Request(BASE, { method: "POST", body: "{}" });
    assert.equal((await api.createInvoice(request)).status, 401);
  });

  it("401 with a wrong token", async () => {
    assert.equal((await api.createInvoice(post(sampleInvoice(), { authorization: "Bearer nope" }))).status, 401);
  });

  it("400 without an Idempotency-Key", async () => {
    const response = await api.createInvoice(post(sampleInvoice(), { "idempotency-key": "" }));
    assert.equal(response.status, 400);
  });

  it("400 for a malformed Idempotency-Key", async () => {
    assert.equal((await api.createInvoice(post(sampleInvoice(), { "idempotency-key": "short" }))).status, 400);
  });

  it("400 with field details for an invalid invoice", async () => {
    const response = await api.createInvoice(post(sampleInvoice({ customer_email: "bad" })));
    const body = await bodyOf(response);
    assert.equal(response.status, 400);
    assert.equal(body.error.code, "validation_error");
    assert.equal(body.error.details[0].field, "customer_email");
  });

  it("400 for a body that is not JSON", async () => {
    assert.equal((await api.createInvoice(post("{not json"))).status, 400);
  });

  it("400 when the totals do not add up", async () => {
    assert.equal((await api.createInvoice(post(sampleInvoice({ total_amount: 1 })))).status, 400);
  });

  it("409 for a duplicate invoice number with a different key", async () => {
    await api.createInvoice(post(sampleInvoice()));
    const response = await api.createInvoice(post(sampleInvoice(), { "idempotency-key": "another-key-1" }));
    assert.equal(response.status, 409);
    assert.equal((await bodyOf(response)).error.code, "duplicate_invoice_number");
  });

  it("422 when a key is reused with different data", async () => {
    await api.createInvoice(post(sampleInvoice()));
    const response = await api.createInvoice(post(sampleInvoice({ customer_name: "Other" })));
    assert.equal(response.status, 422);
    assert.equal((await bodyOf(response)).error.code, "idempotency_key_reuse");
  });

  it("500 with a safe message, without leaking internals", async () => {
    mock.method(console, "error", () => {});
    const broken = new InMemoryInvoiceRepository();
    broken.create = async () => { throw new Error("password=secret123 leaked"); };
    const brokenApi = new InvoiceApi(new FakeAuthenticator(), new InvoiceService(broken));
    const response = await brokenApi.createInvoice(post(sampleInvoice()));
    const text = JSON.stringify(await bodyOf(response));
    assert.equal(response.status, 500);
    assert.ok(!text.includes("secret123"));
    mock.restoreAll();
  });
});

describe("GET /api/invoices", () => {
  it("lists invoices with a next_cursor for paging", async () => {
    for (let i = 1; i <= 3; i++) await api.createInvoice(post(sampleInvoice({ invoice_number: `INV-${i}` }), { "idempotency-key": `key-number-${i}` }));
    const first = await bodyOf(await api.listInvoices(get(`${BASE}?limit=2`)));
    assert.equal(first.data.length, 2);
    assert.ok(first.next_cursor);
    const second = await bodyOf(await api.listInvoices(get(`${BASE}?limit=2&cursor=${first.next_cursor}`)));
    assert.equal(second.data.length, 1);
    assert.equal(second.next_cursor, null);
  });

  it("401 without a token", async () => {
    assert.equal((await api.listInvoices(new Request(BASE))).status, 401);
  });

  it("400 for an invalid filter", async () => {
    assert.equal((await api.listInvoices(get(`${BASE}?status=weird`))).status, 400);
  });
});

describe("GET /api/invoices/summary", () => {
  it("returns the count per status", async () => {
    await api.createInvoice(post(sampleInvoice()));
    const response = await api.getSummary(get(`${BASE}/summary`));
    assert.equal(response.status, 200);
    assert.deepEqual((await bodyOf(response)).data, { pending: 1, processing: 0, submitted: 0, rejected: 0, failed: 0, total: 1 });
  });

  it("401 without a token", async () => {
    assert.equal((await api.getSummary(new Request(`${BASE}/summary`))).status, 401);
  });
});

describe("a user that has not set up a company", () => {
  it("gets 403 no_company on invoice endpoints", async () => {
    const response = await api.listInvoices(get(BASE, "token-new"));
    assert.equal(response.status, 403);
    assert.equal((await bodyOf(response)).error.code, "no_company");
    assert.equal((await api.createInvoice(post(sampleInvoice(), { authorization: "Bearer token-new" }))).status, 403);
  });
});

describe("GET /api/invoices/{id}", () => {
  it("returns header, items and processing information", async () => {
    const { data } = await bodyOf(await api.createInvoice(post(sampleInvoice())));
    const response = await api.getInvoice(get(`${BASE}/${data.id}`), data.id);
    const body = await bodyOf(response);
    assert.equal(response.status, 200);
    assert.equal(body.data.items.length, 2);
    assert.ok(body.data.processing.job);
  });

  it("404 for an unknown invoice", async () => {
    const id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    assert.equal((await api.getInvoice(get(`${BASE}/${id}`), id)).status, 404);
  });

  it("404 (not 403) for another company's invoice, so its existence is not revealed", async () => {
    const { data } = await bodyOf(await api.createInvoice(post(sampleInvoice())));
    assert.equal((await api.getInvoice(get(`${BASE}/${data.id}`, "token-b"), data.id)).status, 404);
  });
});

describe("POST /api/invoices/{id}/retry", () => {
  const retryRequest = (id: string) => new Request(`${BASE}/${id}/retry`, { method: "POST", headers: { authorization: "Bearer token-a" } });

  it("202 for a failed invoice", async () => {
    const { data } = await bodyOf(await api.createInvoice(post(sampleInvoice())));
    repository.forceStatus(data.id, "failed");
    const response = await api.retryInvoice(retryRequest(data.id), data.id);
    assert.equal(response.status, 202);
    assert.equal((await bodyOf(response)).data.status, "pending");
  });

  it("409 for an invoice that is not failed", async () => {
    const { data } = await bodyOf(await api.createInvoice(post(sampleInvoice())));
    const response = await api.retryInvoice(retryRequest(data.id), data.id);
    assert.equal(response.status, 409);
    assert.equal((await bodyOf(response)).error.code, "invoice_not_retryable");
  });

  it("404 for an unknown invoice", async () => {
    const id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    assert.equal((await api.retryInvoice(retryRequest(id), id)).status, 404);
  });

  it("401 without a token", async () => {
    const id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    assert.equal((await api.retryInvoice(new Request(`${BASE}/${id}/retry`, { method: "POST" }), id)).status, 401);
  });
});
