import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { ConflictError, NotFoundError, UnprocessableError, ValidationError } from "../src/domain/errors.ts";
import { InvoiceService } from "../src/services/invoice-service.ts";
import { parseCreateInvoice } from "../src/validation/create-invoice-schema.ts";
import { parseListQuery } from "../src/validation/list-invoices-query.ts";
import { authA, authB } from "./helpers/fake-authenticator.ts";
import { InMemoryInvoiceRepository } from "./helpers/in-memory-invoice-repository.ts";
import { sampleInvoice } from "./helpers/sample-invoice.ts";

let repository: InMemoryInvoiceRepository;
let service: InvoiceService;

const create = (overrides: Record<string, unknown> = {}, key = "key-" + Math.random().toString(36).slice(2, 12), auth = authA) =>
  service.create(auth, key, parseCreateInvoice(sampleInvoice(overrides)));

beforeEach(() => {
  repository = new InMemoryInvoiceRepository();
  service = new InvoiceService(repository);
});

describe("create", () => {
  it("creates a pending invoice", async () => {
    const created = await create();
    assert.equal(created.status, "pending");
    assert.equal(created.replayed, false);
  });

  it("returns the same invoice when the same request is repeated (idempotency)", async () => {
    const first = await create({}, "same-key-12345");
    const second = await create({}, "same-key-12345");
    assert.equal(second.id, first.id);
    assert.equal(second.replayed, true);
  });

  it("refuses the same key with different data", async () => {
    await create({}, "same-key-12345");
    await assert.rejects(create({ customer_name: "Someone Else" }, "same-key-12345"), UnprocessableError);
  });

  it("refuses a second invoice with the same number for the same company", async () => {
    await create();
    await assert.rejects(create(), ConflictError);
  });

  it("allows the same number for a different company", async () => {
    await create();
    await create({}, undefined, authB);
  });

  it("accepts client totals that match", async () => {
    await create({ subtotal: 149.98, tax_amount: "18", total_amount: "167.98" });
  });

  it("refuses client totals that do not match", async () => {
    await assert.rejects(create({ total_amount: 100 }), ValidationError);
  });
});

describe("get", () => {
  it("returns the invoice with items and processing information", async () => {
    const { id } = await create();
    const invoice = await service.get(authA, id);
    assert.equal(invoice.invoice_number, "INV-10001");
    assert.equal(invoice.items.length, 2);
    assert.equal(invoice.processing.job?.status, "queued");
  });

  it("does not reveal another company's invoice", async () => {
    const { id } = await create();
    await assert.rejects(service.get(authB, id), NotFoundError);
  });

  it("treats a malformed id as not found", async () => {
    await assert.rejects(service.get(authA, "not-a-uuid"), NotFoundError);
  });
});

describe("list", () => {
  const list = (query: string, auth = authA) => service.list(auth, parseListQuery(new URLSearchParams(query)));

  it("returns newest first and pages without gaps or repeats", async () => {
    for (let i = 1; i <= 5; i++) await create({ invoice_number: `INV-${i}` });

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = await list(`limit=2${cursor ? `&cursor=${cursor}` : ""}`);
      seen.push(...page.data.map((d) => d.invoice_number));
      cursor = page.next_cursor;
      pages++;
    } while (cursor);

    assert.deepEqual(seen, ["INV-5", "INV-4", "INV-3", "INV-2", "INV-1"]);
    assert.equal(pages, 3);
  });

  it("has no next page when everything fits", async () => {
    await create();
    assert.equal((await list("limit=10")).next_cursor, null);
  });

  it("filters by status", async () => {
    const { id } = await create({ invoice_number: "A" });
    await create({ invoice_number: "B" });
    repository.forceStatus(id, "failed");
    const page = await list("status=failed");
    assert.deepEqual(page.data.map((d) => d.invoice_number), ["A"]);
  });

  it("filters by invoice number", async () => {
    await create({ invoice_number: "A" });
    await create({ invoice_number: "B" });
    assert.deepEqual((await list("invoice_number=B")).data.map((d) => d.invoice_number), ["B"]);
  });

  it("filters by invoice date range (inclusive)", async () => {
    await create({ invoice_number: "A", invoice_date: "2026-01-10" });
    await create({ invoice_number: "B", invoice_date: "2026-02-10" });
    await create({ invoice_number: "C", invoice_date: "2026-03-10" });
    const page = await list("date_from=2026-02-10&date_to=2026-03-10");
    assert.deepEqual(page.data.map((d) => d.invoice_number).sort(), ["B", "C"]);
  });

  it("only lists the caller's own company", async () => {
    await create();
    assert.equal((await list("", authB)).data.length, 0);
  });

  it("rejects bad query parameters", () => {
    for (const query of ["status=weird", "limit=0", "limit=101", "limit=abc", "date_from=2026-05-01&date_to=2026-01-01", "cursor=garbage"]) {
      assert.throws(() => parseListQuery(new URLSearchParams(query)), ValidationError, query);
    }
  });
});

describe("summary", () => {
  it("counts every status, filling in zeros", async () => {
    const a = await create({ invoice_number: "A" });
    await create({ invoice_number: "B" });
    await create({ invoice_number: "C" });
    repository.forceStatus(a.id, "failed");
    assert.deepEqual(await service.summary(authA), { pending: 2, processing: 0, submitted: 0, rejected: 0, failed: 1, total: 3 });
  });

  it("is empty for a company with no invoices, and never counts another company's", async () => {
    await create();
    assert.deepEqual(await service.summary(authB), { pending: 0, processing: 0, submitted: 0, rejected: 0, failed: 0, total: 0 });
  });
});

describe("retry", () => {
  it("moves a failed invoice back to pending", async () => {
    const { id } = await create();
    repository.forceStatus(id, "failed");
    assert.deepEqual(await service.retry(authA, id), { id, status: "pending" });
  });

  it("refuses to retry an invoice that is not failed", async () => {
    const { id } = await create();
    for (const status of ["pending", "processing", "submitted", "rejected"] as const) {
      repository.forceStatus(id, status);
      await assert.rejects(service.retry(authA, id), ConflictError, status);
    }
  });

  it("refuses a second retry once the first has been accepted", async () => {
    const { id } = await create();
    repository.forceStatus(id, "failed");
    await service.retry(authA, id);
    await assert.rejects(service.retry(authA, id), ConflictError);
  });

  it("cannot retry another company's invoice", async () => {
    const { id } = await create();
    repository.forceStatus(id, "failed");
    await assert.rejects(service.retry(authB, id), NotFoundError);
  });
});
