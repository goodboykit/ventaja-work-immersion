import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ChatApi } from "../src/api/chat-api.ts";
import type { AuditRepository, NewAuditEvent } from "../src/repositories/audit-repository.ts";
import type { InvoiceRepository } from "../src/repositories/invoice-repository.ts";
import { ChatService } from "../src/services/chat-service.ts";
import { FakeAuthenticator } from "./helpers/fake-authenticator.ts";
import { FakeGeminiClient } from "./helpers/fake-gemini-client.ts";

class FakeAuditRepo implements AuditRepository {
  async record(_e: NewAuditEvent) {}
  async list() { return []; }
}

function fakeInvoiceRepo(): InvoiceRepository {
  return {
    statusCounts: async () => ({ pending: 0 }),
    monthlyTotals: async () => ({ counts: {}, total_count: 0, total_amount: "0.00" }),
  } as unknown as InvoiceRepository;
}

function buildApi() {
  const gemini = new FakeGeminiClient();
  const service = new ChatService(fakeInvoiceRepo(), new FakeAuditRepo(), gemini);
  return new ChatApi(new FakeAuthenticator(), service);
}

function post(body: unknown, token = "token-a"): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

describe("ChatApi", () => {
  it("returns 200 with a valid message", async () => {
    const api = buildApi();
    const res = await api.ask(post({ message: "How many invoices?" }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.data.answer);
  });

  it("returns 401 without authentication", async () => {
    const api = buildApi();
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hello" }),
    });
    const res = await api.ask(req);
    assert.equal(res.status, 401);
  });

  it("returns 400 with an empty message", async () => {
    const api = buildApi();
    const res = await api.ask(post({ message: "" }));
    assert.equal(res.status, 400);
  });

  it("returns 400 when message exceeds 500 characters", async () => {
    const api = buildApi();
    const res = await api.ask(post({ message: "x".repeat(501) }));
    assert.equal(res.status, 400);
  });
});
