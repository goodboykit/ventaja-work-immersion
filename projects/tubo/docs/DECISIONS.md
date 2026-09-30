# Tubo: design decisions

## Layout
- `backend/` is a package (`@tubo/backend`) holding all business logic, the database migrations and the tests.
- `frontend/` is the Next.js app. Its route files under `src/app/api` are thin: they call the backend package.
- npm workspaces link the two, so the frontend imports `@tubo/backend` directly.

## Layers (each has one job)
| Layer | File(s) | Job |
|---|---|---|
| HTTP | `api/invoice-api.ts` | Request in, Response out. Turns errors into JSON. |
| Rules | `services/invoice-service.ts` | Totals check, duplicate hash, paging, retry rules. |
| Storage | `repositories/*` | The only code that talks to the database. Swappable (tests use an in-memory one). |
| Auth | `auth/*` | Who is calling and which company they belong to. |
| Validation | `validation/*` | Shape and format of everything that comes in. |
| Domain | `domain/*` | Types, errors and the money math. |

## Preventing lost and duplicate invoices
- **Unique `(company_id, invoice_number)`**: the database itself refuses a second invoice with the same number. Two simultaneous requests cannot both win because Postgres makes the second insert wait for the first.
- **Idempotency-Key header (required on create)**: unique `(company_id, idempotency_key)`. Repeating a request returns the original invoice (HTTP 200, `Idempotent-Replayed: true`). The same key with different data is refused (422), because that is a client mistake.
- **Invoice, items and submission job are saved in one transaction** (`create_invoice`), so an invoice can never exist without its job.
- **Job claiming** uses `FOR UPDATE SKIP LOCKED` plus a lease (`locked_until`), so workers never double-process and a crashed worker's job is picked up again.
- **The invoice ID is the stable key sent to the government service**, so a retry after "they got it but we crashed" is recognised as a duplicate on their side.

## API
All endpoints need `Authorization: Bearer <Supabase access token>`.

| Endpoint | Success | Errors |
|---|---|---|
| `POST /api/invoices` (+ `Idempotency-Key`) | 201 created (`Location` header), 200 replay | 400 invalid, 401, 409 duplicate number, 422 key reused with different data |
| `GET /api/invoices` | 200 `{data, next_cursor}` | 400 bad filter, 401 |
| `GET /api/invoices/{id}` | 200 header + items + processing (job and attempt log) | 401, 404 |
| `POST /api/invoices/{id}/retry` | 202 | 401, 404, 409 not retryable |

List filters: `status`, `invoice_number` (exact), `date_from`, `date_to` (inclusive, on invoice date), `limit` (1-100, default 20), `cursor`.

## Decisions and trade-offs
- **Cursor paging, not page numbers.** It stays fast on millions of rows (no OFFSET re-reading) and is stable while new invoices arrive. Cost: no "jump to page 7".
- **`invoice_number` filter is an exact match**, so it uses the unique index. Prefix search would need a separate index.
- **Only `failed` invoices can be retried.** `rejected` means the invoice is invalid (retrying cannot fix it); `pending` and `processing` are already being retried automatically; `submitted` is done. The retry runs under a row lock, so two simultaneous retries cannot both succeed.
- **A retry keeps the attempt count** (the log stays correctly numbered) and gives a fresh budget of 8 more attempts.
- **Another company's invoice returns 404, not 403**, so the API does not reveal which invoice IDs exist.
- **Money uses BigInt whole-cent math** in code and `numeric` in the database. A test compares both on random data.
- **The server ignores client totals.** If the client sends totals they must match, otherwise 400. The stored totals always come from the database.
- **Invoices are immutable after creation.** Only status and result fields change, and only along valid transitions (enforced by triggers).
- **Auth costs two lookups per request** (verify token, find company). Fine for now; a cache or local JWT verification would remove one.
- **Reads and writes use the service-role key, always filtered by company.** Row Level Security is a second layer for anything that reaches the database directly (verified with a real signed-in role).

## Asynchronous processing (Part H)

### How it works: the full flow

```
Client  →  Tubo API  →  Database  →  Worker  →  Government API
 (1)         (2)          (3)         (4)          (5)
```

1. **Client** sends a `POST /api/invoices` with the invoice data.
2. **Tubo API** validates the data and calls the database.
3. **Database** saves the invoice AND creates a submission job **in one transaction** (the transactional outbox pattern). This guarantees we never have an invoice without a job or a job without an invoice.
4. **API returns 201 immediately** — the client does not wait for the government. The invoice status is `pending`.
5. **Worker** picks up the job (every 10 seconds), sends it to the government, and records the outcome.

### Accepting an invoice vs. submitting it (H2)

| | Accepting | Submitting |
|---|---|---|
| **When** | Instantly, when the API receives the request | Later, when the worker sends it to the government |
| **What happens** | Invoice is validated and saved to our database with status `pending` | The government service processes it and returns success or failure |
| **Who does it** | Tubo API (synchronous) | Submission worker (asynchronous, in the background) |
| **If it fails** | Client gets an error immediately (400, 409, etc.) | Invoice stays in the queue and the worker retries automatically |

**Why separate them?** The government API is slow (can take seconds) and unreliable (can be down). If we made the client wait, they'd get timeouts and errors for something that isn't their fault. By accepting immediately and submitting in the background, the client always gets a fast response.

### The job queue

The `submission_jobs` table is our job queue. Each row tracks:
- Which invoice to submit (`invoice_id`)
- How many times we've tried (`attempts`)
- When to try next (`next_attempt_at`)
- A safety lock so two workers can't grab the same job (`locked_until`)

**Claiming jobs safely:**
```sql
SELECT ... FROM submission_jobs
 WHERE status = 'queued' AND next_attempt_at <= now()
   FOR UPDATE SKIP LOCKED
```
- `FOR UPDATE` locks the row so nobody else can take it.
- `SKIP LOCKED` means if another worker already locked it, skip it instead of waiting. No duplicates, no deadlocks.
- If a worker crashes mid-processing, `locked_until` expires and another worker picks it up.

### Retry strategy for a 30-minute outage (H3)

**Problem:** the government API could be down for 30 minutes. We need to keep retrying without losing the invoice.

**Solution:** exponential backoff with 15 attempts and a 5-minute cap.

| Attempt | Wait before retry | Total elapsed |
|---------|------------------|---------------|
| 1 | immediate | 0s |
| 2 | 1 second | 1s |
| 3 | 2 seconds | 3s |
| 4 | 4 seconds | 7s |
| 5 | 8 seconds | 15s |
| 6 | 16 seconds | 31s |
| 7 | 32 seconds | 63s |
| 8 | 64 seconds | ~2 min |
| 9 | 128 seconds | ~4 min |
| 10 | 256 seconds | ~8.5 min |
| 11 | 300 seconds (5 min cap) | ~13.5 min |
| 12 | 300 seconds | ~18.5 min |
| 13 | 300 seconds | ~23.5 min |
| 14 | 300 seconds | ~28.5 min |
| 15 | 300 seconds | ~33.5 min |

**Why exponential backoff?**
- **Short waits at first** (1s, 2s, 4s) — catches brief hiccups quickly.
- **Longer waits later** (up to 5 min) — doesn't hammer a struggling server with requests.
- **Capped at 5 minutes** — we never wait longer than 5 min between retries, so recovery is noticed within 5 minutes.
- **15 attempts total** — covers 33.5 minutes, safely beyond the 30-minute requirement.

**What happens to the invoice during retries:**
- Status stays `pending` — the user sees it's still being processed.
- Each attempt is logged in `processing_logs` with the HTTP status, error, and how long it took.
- If the government was already processing our previous attempt (we timed out but they got it), the invoice ID acts as a stable key — they recognise the duplicate.

**After 15 failed attempts:** the invoice is marked `failed` and the job is marked `dead`. The user can manually retry from the UI, which gives a fresh budget of 15 more attempts.

### Worker implementation

The `SubmissionWorker` class has one main method: `tick()`.

```
tick()
  → claimJobs(batch=5)         // grab up to 5 due jobs
  → processJob(job) × N        // process them in parallel
    → loadInvoice(invoiceId)   // read invoice + items from DB
    → government.submitInvoice // send to the government API
    → completeAttempt(outcome) // record result atomically
```

The worker is triggered by the frontend dashboard every 10 seconds (`POST /api/worker`). In a production system you'd use a cron job or a dedicated process, but for this Next.js + Supabase stack, polling from the client is the simplest approach that works reliably.

### Outcome handling

| Government response | Invoice status | Job status | What happens next |
|---|---|---|---|
| 200 OK | `submitted` | `done` | Invoice is done, external reference saved |
| 400 Bad Request | `rejected` | `done` | Invoice data is invalid, `rejection_reason` saved. Retrying won't help |
| 503 Server Error | stays `pending` | `queued` | Scheduled for retry with backoff |
| Timeout (no response) | stays `pending` | `queued` | Scheduled for retry with backoff |
| All 15 attempts fail | `failed` | `dead` | User can manually retry from the UI |

## Critical failure scenario (Part I)

### The crash scenario step by step

Imagine this happens:

```
Step 1:  Worker claims job for INV-10001     (status → processing, locked for 60s)
Step 2:  Worker sends invoice to government   
Step 3:  Government says "200 OK, accepted!"  ← government has it now
Step 4:  💥 SERVER CRASHES                    ← before we could update our database
Step 5:  Our database still says "processing" ← we don't know it was accepted
Step 6:  60 seconds pass, the lock expires
Step 7:  Server restarts, worker runs again
Step 8:  Worker sees expired lock → reclaims the job
Step 9:  Worker sends the SAME invoice again  ← potential duplicate!
```

### I1 — What should happen next?

After the server restarts (step 7), the worker should **safely retry the submission**:

1. The worker's `claim_submission_jobs` query finds the job because `locked_until < now()` (the 60-second lease expired while the server was down).
2. The worker reclaims it — increments `attempts`, sets a new lease.
3. The worker loads the invoice and sends it to the government **using the same invoice ID**.
4. The government recognizes the invoice ID: "I already accepted this one." It returns the **same external reference** instead of creating a duplicate.
5. The worker records the success, the invoice moves to `submitted`.

**No invoice is lost. No duplicate is created.**

### I2 — Preventing duplicate submissions

We use the **invoice's database ID** (`invoiceId`) as a stable identifier sent to the government on every attempt.

```typescript
// GovernmentInvoice always includes the invoiceId
interface GovernmentInvoice {
  invoiceId: string;      // ← the stable key the government uses to detect duplicates
  invoiceNumber: string;
  // ... rest of the invoice data
}
```

Why this works:
- The invoice ID is created **once** when the invoice is saved to the database.
- It **never changes** — not on retry, not after a crash, not if we call 15 times.
- The government service checks: "Have I seen this `invoiceId` before?" If yes → return the same result.
- This means sending the same invoice 10 times produces the same result as sending it once.

Our mock government client demonstrates this:

```typescript
class MockGovernmentClient {
  private readonly accepted = new Map<string, string>();  // invoiceId → externalRef

  async submitInvoice(invoice: GovernmentInvoice) {
    // If we already accepted this invoice, return the same result
    const existing = this.accepted.get(invoice.invoiceId);
    if (existing) {
      return { result: "success", externalRef: existing };  // no duplicate!
    }
    // ... otherwise process normally
  }
}
```

### I3 — Idempotency explained

**Idempotency** means: doing something once or doing it multiple times produces the **exact same result**.

Real-life example: pressing an elevator button. Press it once → elevator comes. Press it 5 more times → elevator still comes once, not 5 elevators.

In Tubo, idempotency works at **two levels**:

#### Level 1: Client → Tubo (Idempotency-Key header)

When a client creates an invoice, they send an `Idempotency-Key` header:

```
POST /api/invoices
Idempotency-Key: abc-123
```

- **First time:** Tubo creates the invoice, returns 201.
- **Same key again:** Tubo sees "I already processed `abc-123`" → returns the original invoice (200), doesn't create a second one.
- **Same key, different data:** Tubo says "you already used this key for different data" → returns 422 error.

This protects against: the client's network drops after Tubo saved the invoice but before the client received the response. The client retries safely.

#### Level 2: Tubo → Government (Invoice ID)

When the worker sends an invoice to the government, it includes the `invoiceId`:

- **First time:** Government processes it, returns external reference `GOV-12345`.
- **Same invoiceId again (after crash):** Government sees "I already have this" → returns the same `GOV-12345`.

This protects against: Tubo crashes after the government accepted the invoice but before Tubo recorded the success.

#### Why two levels?

```
Client  ──Idempotency-Key──►  Tubo  ──invoiceId──►  Government
         (protects this gap)          (protects this gap)
```

Each gap is a place where a crash or network failure could cause a retry. Each level has its own idempotency key to make retries safe.

### The three safety mechanisms working together

| Mechanism | What it prevents | How |
|---|---|---|
| **Transactional outbox** | Invoice saved but job not created (or vice versa) | Both saved in one database transaction |
| **Lease-based locking** (`locked_until`) | Crashed worker's job stuck forever | Lock expires after 60s, another worker picks it up |
| **Idempotent submission** (`invoiceId`) | Duplicate invoice in the government system | Government recognizes the same ID and returns the same result |

Together, they guarantee: **an invoice is never lost and never duplicated**, even if the server crashes at the worst possible moment.

## Concurrency problem (Part J)

### The dangerous code

```javascript
// ⚠️ THIS CODE HAS A BUG — DO NOT USE
const existingInvoice = await Invoice.findOne({
    companyId: companyId,
    invoiceNumber: invoiceNumber
});

if (!existingInvoice) {
    await Invoice.create({ companyId, invoiceNumber, total });
}
```

### J1 — Is the code safe?

**No.** This code has a **race condition** (also called a "TOCTOU bug" — Time Of Check vs Time Of Use).

### J2 — What could happen?

Two duplicate invoices with the same INV-10001 are created:

```
Time    Request A                       Request B
─────   ─────────────────────           ─────────────────────
 1ms    findOne("INV-10001") → null
 2ms                                    findOne("INV-10001") → null
 3ms    create("INV-10001") → ✅
 4ms                                    create("INV-10001") → ✅  ← DUPLICATE!
```

Both requests checked "does it exist?" and both got "no" — because neither had created it yet.

### J3 — Why could both requests pass the check?

Because the check (SELECT) and the action (INSERT) are **two separate operations**. Between them, another request can sneak in. The database doesn't know these two operations are related.

Think of it like two people checking if a seat is empty, then sitting down — they both see it's empty, and they both sit on the same seat.

### J4 — How Tubo fixes it

We don't use check-then-insert at all. Instead, we use an **atomic INSERT with conflict handling**:

```sql
-- Inside create_invoice() — this is ONE atomic operation
INSERT INTO invoices (company_id, idempotency_key, ...)
VALUES ($1, $2, ...)
ON CONFLICT (company_id, idempotency_key) DO NOTHING
RETURNING id;
```

**How this works:**
1. We try to insert directly — no check first.
2. If it's a duplicate `(company_id, idempotency_key)` → the `ON CONFLICT DO NOTHING` clause silently skips the insert, and we return the existing invoice.
3. If it's a duplicate `(company_id, invoice_number)` → the database raises a `unique_violation` error, and we return "duplicate invoice number" (409).
4. Two simultaneous requests? The database makes the second one wait for the first to finish. Only one can win.

**No gap between check and insert. No race condition. No duplicates.**

### J5 — Would application-level validation alone be sufficient?

**No.** Application-level checks (like the pseudo-code above) always have a time gap between checking and inserting. During that gap, another request can slip through. Even using application-level locks (like a mutex) wouldn't work across multiple servers.

Only the **database** can guarantee atomicity because:
- It controls the actual data storage.
- Its unique constraints are enforced at the lowest level (before the row is written).
- It handles concurrent transactions with proper isolation.

### J6 — What database mechanism?

We use **three mechanisms together**:

| Mechanism | SQL | What it prevents |
|---|---|---|
| **Unique constraint** on `(company_id, invoice_number)` | `UNIQUE(company_id, invoice_number)` | Two invoices with the same number for one company |
| **Unique constraint** on `(company_id, idempotency_key)` | `UNIQUE(company_id, idempotency_key)` | Same request processed twice (network retry) |
| **ON CONFLICT** clause | `ON CONFLICT ... DO NOTHING` | Turns the race condition into a safe no-op |

For worker job claiming, we also use:

| Mechanism | SQL | What it prevents |
|---|---|---|
| **FOR UPDATE** | `SELECT ... FOR UPDATE` | Two workers reading the same job simultaneously |
| **SKIP LOCKED** | `FOR UPDATE SKIP LOCKED` | Workers waiting on each other (deadlocks) |

## Scalability (Part K)

### K1 — Architecture for 1,000,000 invoices/day

At 10,000/day our current single-server setup works fine. At 1,000,000/day (~12 per second average, with spikes much higher), we need to scale every layer:

```
                    ┌─────────────────┐
                    │  Load Balancer   │  ← distributes traffic across API servers
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
         ┌─────────┐   ┌─────────┐   ┌─────────┐
         │ API  #1 │   │ API  #2 │   │ API  #3 │  ← stateless, scale horizontally
         └────┬────┘   └────┬────┘   └────┬────┘
              │              │              │
              ▼              ▼              ▼
         ┌──────────────────────────────────────┐
         │           Database (Postgres)         │  ← read replicas for queries
         │  Primary (writes) + Replicas (reads)  │
         └────────────────┬─────────────────────┘
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
         ┌─────────┐ ┌─────────┐ ┌─────────┐
         │Worker #1│ │Worker #2│ │Worker #3│  ← each claims its own batch
         └────┬────┘ └────┬────┘ └────┬────┘
              │           │           │
              ▼           ▼           ▼
         ┌──────────────────────────────────────┐
         │  Rate Limiter (shared, e.g. Redis)    │  ← enforces 100 req/s to government
         └────────────────┬─────────────────────┘
                          ▼
         ┌──────────────────────────────────────┐
         │       Government API (external)       │
         └──────────────────────────────────────┘
```

**What changes at each layer:**

| Layer | Now (10K/day) | Scaled (1M/day) | Why |
|---|---|---|---|
| **API servers** | 1 Next.js server | 3+ stateless servers behind a load balancer | Any server can handle any request (no session state) |
| **Load balancer** | None needed | Nginx, AWS ALB, or Cloudflare | Distributes requests evenly, handles failover |
| **Database** | Single Supabase instance | Primary + read replicas | Writes go to primary, reads (list/detail) go to replicas |
| **Queue** | `submission_jobs` table | Same table, or dedicated queue (Redis/SQS) | Table-based queue works up to ~100K/day; beyond that, a dedicated queue is faster |
| **Workers** | 1 worker (in-process) | 3+ dedicated worker processes | Each claims its own batch with `SKIP LOCKED` — no coordination needed |
| **Caching** | None | Redis: cache summaries, recent lookups | Reduces DB load for repeated reads |
| **File/object storage** | Not used | S3/R2 for invoice PDFs | Generate PDFs async, store externally |
| **Logging** | Console | Centralized logging (e.g. Datadog, Loki) | Search across all servers in one place |
| **Monitoring** | None | Dashboards + alerts (queue depth, error rate, latency) | Know when something is wrong before users notice |

**Why our design scales well:**
- **Stateless API** — no session data on the server, so any server can handle any request.
- **`SKIP LOCKED`** — workers don't step on each other, even with 10 workers running.
- **Unique constraints** — duplicates are prevented at the database level, not in application code.
- **Rate limiter is injectable** — swap the in-memory limiter for a shared Redis one with zero code changes (just a different class implementing `RateLimiter`).

### K2 — Rate limiting the government API (100 requests/second)

**Problem:** 100,000 invoices arrive in 10 minutes, but the government only allows 100 requests/second. Without throttling, we'd send ~167/second and get rate-limited or blocked.

**Solution: Token Bucket Rate Limiter**

We implemented a `TokenBucketRateLimiter` class. Think of it like a ticket dispenser:

```
┌─────────────────────────────────────┐
│        Token Bucket (100 tokens)     │
│                                     │
│  ████████████████████  ← 100 tokens │
│                                     │
│  Refills: 100 tokens/second         │
│  Each request takes 1 token         │
│  No tokens? Wait until refill.      │
└─────────────────────────────────────┘
```

**How it works in the code:**

```typescript
// Interface — what every rate limiter must do
interface RateLimiter {
  acquire(): Promise<void>;  // wait for permission to send
}

// The worker calls acquire() before every government request
async processJob(job) {
  const invoice = await this.loadInvoice(job.invoice_id);
  await this.rateLimiter.acquire();    // ← waits if we're going too fast
  const outcome = await this.government.submitInvoice(invoice);
}
```

**Why token bucket?**
- **Handles bursts:** the bucket starts full (100 tokens), so a short burst of requests goes through instantly.
- **Smooths sustained traffic:** once the bucket empties, requests are evenly spaced at 100/second.
- **Simple to understand:** it's just a counter that refills over time.

**OOP design — swappable rate limiters:**

| Class | Purpose | When to use |
|---|---|---|
| `TokenBucketRateLimiter` | Enforces a requests-per-second limit | Production |
| `NoOpRateLimiter` | Does nothing (instant pass-through) | Tests and development |

Both implement the same `RateLimiter` interface. The worker doesn't know or care which one it gets — **dependency injection** makes them interchangeable.

### K3 — Would you process all invoices simultaneously?

**No.** Processing all 100,000 at once would:

1. **Overwhelm the government API** — 100K simultaneous connections would be blocked.
2. **Exhaust server memory** — each request holds data in memory while waiting.
3. **Make errors worse** — if something goes wrong, all 100K fail at once.

**Our approach: bounded concurrency with rate limiting.**

```
Step 1: Worker claims a BATCH of 5 jobs (not all 100K)
Step 2: Processes the 5 in parallel (rate-limited to 100/s)
Step 3: Records results
Step 4: Claims the next batch of 5
```

With 3 workers × 5 jobs/batch, we process 15 at a time. The rate limiter ensures we never exceed 100 requests/second to the government, no matter how many workers are running.

**Why this is better than "all at once":**

| Approach | Memory | Government load | Error blast radius | Recovery |
|---|---|---|---|---|
| All 100K at once | 💀 Huge | 💀 Blocked | 💀 All fail | 💀 Start over |
| Bounded batches + rate limit | ✅ Small (5 per worker) | ✅ Steady 100/s | ✅ Only 5 fail | ✅ Next batch continues |

**The math works out:** at 100 requests/second, processing 100K invoices takes ~17 minutes. That's well within the system's retry budget (15 attempts over 33 minutes), so even if some fail on the first try, there's plenty of time to retry.

## Failure & retry design (Part L)

### How Tubo records every attempt

We **never overwrite** previous errors. Every single attempt is stored as its own row in the `processing_logs` table:

```
processing_logs
┌────┬──────────┬────────────┬────────────┬─────────────┬──────────────────────────────────┬─────────────┬────────────────────┐
│ id │  job_id  │ invoice_id │ attempt_no │   outcome   │             error                │ http_status │     created_at     │
├────┼──────────┼────────────┼────────────┼─────────────┼──────────────────────────────────┼─────────────┼────────────────────┤
│  1 │ job-abc  │ INV-20001  │     1      │ retryable   │ Service temporarily unavailable  │     503     │ 2026-09-30 10:00   │
│  2 │ job-abc  │ INV-20001  │     2      │ timeout     │ No response within 30 seconds    │    null     │ 2026-09-30 10:01   │
│  3 │ job-abc  │ INV-20001  │     3      │ retryable   │ Service temporarily unavailable  │     503     │ 2026-09-30 10:03   │
└────┴──────────┴────────────┴────────────┴─────────────┴──────────────────────────────────┴─────────────┴────────────────────┘
```

Each row records everything the assessment asks for:

| Requirement | Column | Example |
|---|---|---|
| When processing started | `created_at` | `2026-09-30 10:00:00` |
| When it ended | `created_at` + `duration_ms` | `10:00:00 + 1200ms = 10:00:01.2` |
| Attempt number | `attempt_no` | `1`, `2`, `3` |
| HTTP response | `http_status` | `503`, `null` (timeout) |
| Error message | `error` | `"Service temporarily unavailable"` |
| Processing status | `outcome` | `success`, `rejected`, `retryable_error`, `timeout` |

The `submission_jobs` table also tracks the current state:

```
submission_jobs
┌──────────┬────────────┬────────┬──────────┬──────────────┬─────────────────────────────────┐
│    id    │ invoice_id │ status │ attempts │ max_attempts │           last_error            │
├──────────┼────────────┼────────┼──────────┼──────────────┼─────────────────────────────────┤
│ job-abc  │ INV-20001  │ queued │    3     │      15      │ Service temporarily unavailable │
└──────────┴────────────┴────────┴──────────┴──────────────┴─────────────────────────────────┘
```

### L1 — Would you overwrite the previous error every time?

**No. We keep every attempt as a separate row.** Here's why:

**If we overwrote**, we'd only know about the last failure:

```
❌ Overwrite approach:
   "The invoice failed. Error: Service unavailable."
   
   But WHY did it fail 3 times? Was it the same error?
   Did the government change its response? We don't know.
```

**Because we keep all rows**, we can see the full history:

```
✅ Our approach (append-only log):
   Attempt 1: 503 — "Service unavailable"     (took 1200ms)
   Attempt 2: timeout — "No response"          (took 30000ms)
   Attempt 3: 503 — "Service unavailable"      (took 800ms)
   
   Pattern: the government is having intermittent issues.
```

The `submission_jobs.last_error` field does store the most recent error (for quick display in the UI), but this is **in addition to** the full log — never instead of it.

### L2 — How a support engineer investigates a 3-day-old failure

A support engineer can trace exactly what happened by querying the processing logs:

**Step 1: Find the invoice**
```sql
SELECT id, status, invoice_number, created_at
  FROM invoices
 WHERE invoice_number = 'INV-20001';
```

**Step 2: Check the job status**
```sql
SELECT status, attempts, max_attempts, last_error, next_attempt_at
  FROM submission_jobs
 WHERE invoice_id = '<invoice-id>';
```

**Step 3: Read the full attempt history**
```sql
SELECT attempt_no, outcome, http_status, error, duration_ms, created_at
  FROM processing_logs
 WHERE invoice_id = '<invoice-id>'
 ORDER BY attempt_no;
```

This shows:
- **Was it always the same error?** Maybe the government was down (503 every time) vs. our data is wrong (400 rejected).
- **Did response times change?** Getting slower could mean the government is overloaded.
- **How far apart were retries?** The exponential backoff schedule is visible in the `created_at` timestamps.
- **Did it ever succeed before failing?** Useful for intermittent issues.

**In the UI**, the invoice detail modal shows this same data as a visual timeline — the user doesn't need to write SQL:

```
📩  Invoice received                              Sep 27, 10:00
⚠️  Attempt 1 — 503 Service unavailable (1.2s)    Sep 27, 10:00
⚠️  Attempt 2 — Timeout (30s)                     Sep 27, 10:01
⚠️  Attempt 3 — 503 Service unavailable (0.8s)    Sep 27, 10:03
❌  Delivery failed after 3 attempts               Sep 27, 10:03
```

This is built by the `buildTimeline()` function in the frontend, which reads the `processing_logs` returned by `GET /api/invoices/{id}`.

## API versioning (Part M)

### The problem

Tubo currently has `POST /api/v1/invoices`. Six months later, a major customer needs new fields (`due_date`, `notes`, `payment_terms`, `billing_address`). We can't just change the v1 schema — that would break every existing customer who doesn't send those fields.

### Our versioning strategy: URL-based versions

```
Existing customers keep using:     POST /api/v1/invoices  ← unchanged, works forever
New customer uses:                  POST /api/v2/invoices  ← accepts new fields
```

**Why URL-based versioning?**
- **Simple to understand:** `/v1/` vs `/v2/` — you can see the version in the URL.
- **Easy to test:** call the v1 URL with an old payload, v2 URL with the new one.
- **No hidden headers:** some APIs version via `Accept` headers, but that's harder to debug.

### How it works in the code

```
                      ┌──────────────────┐
                      │  InvoiceApi (V1)  │  ← validates with V1 schema
                      │  list, get, retry │
                      └────────┬─────────┘
                               │ extends (OOP inheritance)
                      ┌────────▼─────────┐
                      │ InvoiceApiV2      │  ← overrides only createInvoice
                      │ (new V2 schema)   │     all other endpoints are inherited
                      └────────┬─────────┘
                               │
                      ┌────────▼─────────┐
                      │  InvoiceService   │  ← SAME service for both versions
                      └────────┬─────────┘
                               │
                      ┌────────▼─────────┐
                      │    Database       │  ← SAME tables, SAME data
                      └──────────────────┘
```

**Key design choices:**

| Choice | Why |
|---|---|
| V2 **extends** V1 (OOP inheritance) | V2 only overrides `createInvoice`. List, get, retry, summary are identical — no code duplication |
| Both versions share **one InvoiceService** | Business rules (duplicate checks, idempotency, totals) are in one place, not duplicated |
| Both versions share **one database** | An invoice created via V1 is visible in V2, and vice versa |
| V2 schema **extends** V1 schema | Every valid V1 payload is also valid V2 (the new fields are optional) |
| Route files are thin | Each `route.ts` is 3–5 lines — it just calls the right API class |

### File structure

```
api/
├── v1/invoices/           ← V1 routes (current customers)
│   ├── route.ts              POST + GET
│   ├── summary/route.ts      GET
│   └── [id]/
│       ├── route.ts          GET
│       └── retry/route.ts    POST
└── v2/invoices/           ← V2 routes (new customer with extra fields)
    ├── route.ts              POST (v2 schema) + GET (same)
    ├── summary/route.ts      GET (same)
    └── [id]/
        ├── route.ts          GET (same)
        └── retry/route.ts    POST (same)
```

### V2 schema — what changed

```typescript
// V1 schema (unchanged)
{
  invoice_number, invoice_date, customer_name,
  customer_tax_id, customer_email, currency, items
}

// V2 schema = V1 + optional new fields
{
  ...all V1 fields,
  due_date?,          // when payment is due (YYYY-MM-DD)
  notes?,             // free-text notes (up to 2000 chars)
  payment_terms?,     // e.g. "Net 30", "Due on receipt"
  billing_address? {  // structured address
    line1?, line2?, city?, postal_code?, country?
  }
}
```

All new fields are **optional**, so a V1 payload sent to V2 still works. This means customers can migrate from V1 to V2 at their own pace.

### Migration plan for existing customers

| Step | When | What happens |
|---|---|---|
| 1 | Day 0 | Deploy V2 alongside V1. Both work. Nothing changes for existing customers |
| 2 | Week 1–4 | Notify existing customers: "V2 is available with new fields" |
| 3 | Month 1–6 | Customers migrate at their own pace. V1 and V2 run side by side |
| 4 | Month 6+ | Deprecate V1 (add `Deprecation` header). Set a sunset date |
| 5 | Month 12 | Remove V1 if all customers have migrated |

**The key principle: the old version keeps working until customers are ready to move.** Nobody's integration breaks overnight.

## Debugging scenario (Part N)

### The situation

| Metric | Value | Is it normal? |
|---|---|---|
| CPU | 35% | Yes — plenty of headroom |
| Memory | 55% | Yes — no pressure |
| Database CPU | 20% | Yes — barely working |
| API response time | Normal | Yes — the API is fine |
| Queue waiting jobs | **150,000** | **No — this is the problem** |
| Workers | 5 | They exist, but not enough |
| External API | Responding normally | Yes — the government is fine |

### N1 — Where to investigate first

**The worker throughput.** The queue has 150,000 jobs waiting, but everything else is healthy. The bottleneck is clear: workers can't drain the queue fast enough.

Think of it like a restaurant: the kitchen (government API) is ready, the ingredients (database) are stocked, but there are only 5 waiters (workers) serving 150,000 customers.

### N2 — What the metrics tell us

- **CPU 35%, Memory 55%, DB 20%** → the server has plenty of capacity to spare. Nothing is overloaded.
- **API response time normal** → accepting invoices works fine. The problem is *after* acceptance.
- **Queue 150K, 5 workers** → the queue is growing faster than workers can drain it.
- **External API responding normally** → the bottleneck is NOT the government. It's our side.

**Conclusion:** we're under-provisioned on workers. We have the capacity to add more (CPU and DB are underused), but we haven't.

### N3 — Additional metrics to check

| Metric | Why |
|---|---|
| **Jobs processed per minute** | How fast is the queue actually draining? |
| **Average processing time per job** | Is each job taking longer than expected? |
| **Queue growth rate** | Is the queue growing, shrinking, or stable? |
| **Worker idle time** | Are workers sitting idle between batches? |
| **Rate limiter wait time** | Is the rate limiter the bottleneck? |
| **Error/retry rate** | Are many jobs failing and being re-queued? |
| **External API latency p50/p95** | Is the government API slow on some requests? |
| **Database connection pool usage** | Are workers competing for DB connections? |

### N4 — Changes to improve throughput

| Change | Impact | Effort |
|---|---|---|
| **Increase worker count** (5 → 20) | 4× more throughput | Low — just add more worker processes |
| **Increase batch size** (5 → 20) | Fewer DB round trips per tick | Low — change one constructor parameter |
| **Process batches in parallel within each worker** | More concurrent submissions | Low — already using `Promise.all` |
| **Add a dedicated worker process** | Workers run independently of the API | Medium — separate deployment |
| **Use a dedicated queue** (Redis, SQS) | Faster job claiming than polling a DB table | Medium — new infrastructure |
| **Read replicas for invoice lookups** | Reduce load on primary DB | Medium — routing change |

**Priority order:** increase workers first (instant win), then increase batch size, then dedicated process.

### N5 — Preventing worker scale-up from overloading other components

Adding more workers is easy, but without protection they could overload the government API or the database.

**Our safeguards:**

| Component | Protection | How it works |
|---|---|---|
| **Government API** | `TokenBucketRateLimiter` | No matter how many workers run, total requests stay at 100/second |
| **Database** | Bounded batch size | Each worker claims at most `batchSize` jobs per tick — no runaway queries |
| **Database** | `SKIP LOCKED` | Workers don't block each other — if a row is locked, skip it |
| **Database** | Connection pooling (port 6543) | Fixed pool size prevents "too many connections" |
| **Other workers** | Lease-based locking | If a worker crashes, its jobs are reclaimed after 60 seconds — no permanent locks |

**The key insight:** because the rate limiter is **shared** (or in production, a Redis-backed distributed limiter), adding 20 workers still respects the 100 req/s government API limit. Each worker calls `rateLimiter.acquire()` before every submission — if the global rate is exceeded, the worker simply waits its turn.

```
Worker 1  ──┐
Worker 2  ──┤
Worker 3  ──┼──► Rate Limiter (100/s) ──► Government API
...         │
Worker 20 ──┘
```

**Scaling checklist before adding workers:**
1. Check DB connection pool has room (increase pool if needed)
2. Verify rate limiter is shared across all workers (Redis in production)
3. Monitor queue depth — it should start decreasing
4. Watch government API response times — if they increase, back off
