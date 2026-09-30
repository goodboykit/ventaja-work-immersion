import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { IdempotencyKeyStore } from "../src/lib/idempotency-key.ts";

function counterStore() {
  let n = 0;
  return new IdempotencyKeyStore(() => `key-${++n}-padding`);
}

describe("IdempotencyKeyStore", () => {
  it("gives the same key for the same data (double click, or retry after a lost response)", () => {
    const store = counterStore();
    const payload = { invoice_number: "INV-1", items: [{ quantity: "1" }] };
    assert.equal(store.keyFor(payload), store.keyFor({ ...payload }));
  });

  it("gives a new key when the data changed", () => {
    const store = counterStore();
    const first = store.keyFor({ invoice_number: "INV-1" });
    const second = store.keyFor({ invoice_number: "INV-2" });
    assert.notEqual(first, second);
  });

  it("gives a fresh key after clear(), even for identical data", () => {
    const store = counterStore();
    const first = store.keyFor({ a: 1 });
    store.clear();
    assert.notEqual(store.keyFor({ a: 1 }), first);
  });

  it("the default generator makes keys the API accepts (8-128 safe characters)", () => {
    const key = new IdempotencyKeyStore().keyFor({});
    assert.match(key, /^[A-Za-z0-9_\-:.]{8,128}$/);
  });
});
