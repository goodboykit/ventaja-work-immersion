import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AuditEvent } from "../src/domain/audit.ts";
import type { AuditRepository, NewAuditEvent } from "../src/repositories/audit-repository.ts";
import type { InvoiceRepository } from "../src/repositories/invoice-repository.ts";
import { ChatService } from "../src/services/chat-service.ts";
import { FakeGeminiClient } from "./helpers/fake-gemini-client.ts";

class FakeAuditRepo implements AuditRepository {
  events: AuditEvent[] = [];
  async record(_e: NewAuditEvent) {}
  async list() { return this.events; }
}

function fakeInvoiceRepo(): InvoiceRepository {
  return {
    statusCounts: async () => ({ pending: 5, processing: 2, submitted: 10, failed: 1, rejected: 0 }),
    monthlyTotals: async () => ({ counts: { submitted: 10 }, total_count: 18, total_amount: "5000.00" }),
  } as unknown as InvoiceRepository;
}

describe("ChatService", () => {
  it("returns the answer from the Gemini client", async () => {
    const gemini = new FakeGeminiClient();
    const service = new ChatService(fakeInvoiceRepo(), new FakeAuditRepo(), gemini);
    const result = await service.ask({ userId: "u1", companyId: "c1" }, "How many invoices failed?");
    assert.equal(result.answer, "You have 5 pending invoices.");
  });

  it("includes status counts in the prompt sent to Gemini", async () => {
    const gemini = new FakeGeminiClient();
    const service = new ChatService(fakeInvoiceRepo(), new FakeAuditRepo(), gemini);
    await service.ask({ userId: "u1", companyId: "c1" }, "Tell me about my invoices");
    assert.ok(gemini.lastPrompt.includes("pending: 5"));
    assert.ok(gemini.lastPrompt.includes("failed: 1"));
  });

  it("includes the user question in the prompt", async () => {
    const gemini = new FakeGeminiClient();
    const service = new ChatService(fakeInvoiceRepo(), new FakeAuditRepo(), gemini);
    await service.ask({ userId: "u1", companyId: "c1" }, "Which invoices are pending?");
    assert.ok(gemini.lastPrompt.includes("Which invoices are pending?"));
  });

  it("includes the system instruction", async () => {
    const gemini = new FakeGeminiClient();
    const service = new ChatService(fakeInvoiceRepo(), new FakeAuditRepo(), gemini);
    await service.ask({ userId: "u1", companyId: "c1" }, "hi");
    assert.ok(gemini.lastPrompt.includes("You are Tubo"));
  });
});
