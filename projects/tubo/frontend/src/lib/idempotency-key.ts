function randomKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Hands out the Idempotency-Key for a create request.
//  - Same data again (a double click, or a retry after a lost response): same key, so the server
//    returns the invoice it already made instead of making a second one.
//  - Different data: a new key. Reusing a key for different data is refused by the server.
export class IdempotencyKeyStore {
  private readonly generate: () => string;
  private fingerprint: string | null = null;
  private key: string | null = null;

  constructor(generate: () => string = randomKey) {
    this.generate = generate;
  }

  keyFor(payload: unknown): string {
    const fingerprint = JSON.stringify(payload);
    if (this.key === null || fingerprint !== this.fingerprint) {
      this.key = this.generate();
      this.fingerprint = fingerprint;
    }
    return this.key;
  }

  // Call after the invoice was created, so the next invoice gets a fresh key.
  clear(): void {
    this.key = null;
    this.fingerprint = null;
  }
}
