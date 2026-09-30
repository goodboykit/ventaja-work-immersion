import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiClient, ApiError } from "../src/lib/api-client.ts";

interface Recorded {
  url: string;
  init: RequestInit;
}

function fakeFetch(respond: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Recorded[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return respond(url, init);
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}

const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const headersOf = (call: Recorded) => call.init.headers as Record<string, string>;

describe("ApiClient", () => {
  it("sends the sign-in token and unwraps { data }", async () => {
    const { fetchFn, calls } = fakeFetch(() => ok({ data: { user: { id: "u1", email: "a@b.co" }, company: null } }));
    const api = new ApiClient(async () => "tok-123", { fetchFn });

    const profile = await api.getMe();

    assert.equal(profile.user.email, "a@b.co");
    assert.equal(calls[0]!.url, "/api/me");
    assert.equal(headersOf(calls[0]!).Authorization, "Bearer tok-123");
  });

  it("sends no Authorization header when signed out", async () => {
    const { fetchFn, calls } = fakeFetch(() => ok({ data: {} }));
    await new ApiClient(async () => null, { fetchFn }).getMe();
    assert.equal(headersOf(calls[0]!).Authorization, undefined);
  });

  it("builds the list URL from the filters, leaving out empty ones", async () => {
    const { fetchFn, calls } = fakeFetch(() => ok({ data: [], next_cursor: null }));
    const api = new ApiClient(async () => "t", { fetchFn });

    await api.listInvoices({});
    await api.listInvoices({ status: "failed", invoiceNumber: "INV 1", dateFrom: "2026-01-01", dateTo: "2026-02-01", limit: 20, cursor: "abc" });

    assert.equal(calls[0]!.url, "/api/invoices");
    const url = new URL(calls[1]!.url, "http://x");
    assert.equal(url.pathname, "/api/invoices");
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      status: "failed",
      invoice_number: "INV 1",
      date_from: "2026-01-01",
      date_to: "2026-02-01",
      limit: "20",
      cursor: "abc",
    });
  });

  it("returns the page with its cursor", async () => {
    const { fetchFn } = fakeFetch(() => ok({ data: [{ id: "1" }], next_cursor: "next" }));
    const page = await new ApiClient(async () => "t", { fetchFn }).listInvoices();
    assert.equal(page.data.length, 1);
    assert.equal(page.next_cursor, "next");
  });

  it("creates an invoice with the Idempotency-Key and a JSON body", async () => {
    const { fetchFn, calls } = fakeFetch(() => ok({ data: { id: "i1", status: "pending", replayed: false } }, 201));
    const api = new ApiClient(async () => "t", { fetchFn });
    const body = { invoice_number: "INV-1", invoice_date: "2026-09-30", customer_name: "C", customer_tax_id: "T", customer_email: "c@d.co", currency: "PHP", items: [] };

    const created = await api.createInvoice(body, "key-12345678");

    assert.equal(created.id, "i1");
    assert.equal(calls[0]!.init.method, "POST");
    assert.equal(headersOf(calls[0]!)["Idempotency-Key"], "key-12345678");
    assert.equal(headersOf(calls[0]!)["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(calls[0]!.init.body as string), body);
  });

  it("encodes the invoice id in the URL", async () => {
    const { fetchFn, calls } = fakeFetch(() => ok({ data: {} }));
    await new ApiClient(async () => "t", { fetchFn }).getInvoice("a/b");
    assert.equal(calls[0]!.url, "/api/invoices/a%2Fb");
  });

  it("posts to the retry endpoint", async () => {
    const { fetchFn, calls } = fakeFetch(() => ok({ data: { id: "i1", status: "pending" } }, 202));
    const result = await new ApiClient(async () => "t", { fetchFn }).retryInvoice("i1");
    assert.equal(result.status, "pending");
    assert.equal(calls[0]!.url, "/api/invoices/i1/retry");
    assert.equal(calls[0]!.init.method, "POST");
  });

  it("turns an API error into an ApiError with code and details", async () => {
    const details = [{ field: "customer_email", message: "Enter a valid email address" }];
    const { fetchFn } = fakeFetch(() => ok({ error: { code: "validation_error", message: "The invoice is not valid", details } }, 400));

    await assert.rejects(new ApiClient(async () => "t", { fetchFn }).getSummary(), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 400);
      assert.equal(error.code, "validation_error");
      assert.deepEqual(error.details, details);
      assert.equal(error.isConnectionProblem, false);
      return true;
    });
  });

  it("copes with an error response that is not JSON", async () => {
    const { fetchFn } = fakeFetch(() => new Response("<html>Bad gateway</html>", { status: 502 }));
    await assert.rejects(new ApiClient(async () => "t", { fetchFn }).getMe(), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 502);
      assert.equal(error.code, "unknown_error");
      return true;
    });
  });

  it("tells the app to sign out on 401", async () => {
    let signedOut = 0;
    const { fetchFn } = fakeFetch(() => ok({ error: { code: "unauthorized", message: "no" } }, 401));
    const api = new ApiClient(async () => "t", { fetchFn, onUnauthorized: () => signedOut++ });
    await assert.rejects(api.getMe());
    assert.equal(signedOut, 1);
  });

  it("reports a network failure as a connection problem (status 0)", async () => {
    const fetchFn = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await assert.rejects(new ApiClient(async () => "t", { fetchFn }).getMe(), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, "network_error");
      assert.equal(error.isConnectionProblem, true);
      return true;
    });
  });

  it("reports a timeout as a connection problem too", async () => {
    const fetchFn = (async () => {
      throw new DOMException("timed out", "TimeoutError");
    }) as unknown as typeof fetch;
    await assert.rejects(new ApiClient(async () => "t", { fetchFn }).getMe(), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, "timeout");
      assert.equal(error.isConnectionProblem, true);
      return true;
    });
  });
});
