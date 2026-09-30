# Tubo — Invoicing Platform

> Ventaja International Group work immersion assessment  
> **Author:** Santiago Kit  

Tubo validates, stores and submits invoices to a government service.  
Core invariant: **invoices must never be lost or duplicated.**

---

## Setup

### Prerequisites

- **Node.js** 20+
- **npm** 10+
- A **Supabase** project (free tier works)

### 1. Install dependencies

```bash
cd projects/tubo
npm install            # installs both backend and frontend (npm workspaces)
```

Works on **Windows, macOS, and Linux** — npm installs the correct native build tools (Tailwind/lightningcss) for your platform automatically. If a build ever fails with *"Cannot find module …darwin/win32….node"*, your platform's optional package didn't install; run `npm install` again (or `rm -rf node_modules && npm install`).

### 2. Configure environment variables

Create `projects/tubo/backend/.env` with your Supabase credentials:

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
# Pooled connection (port 6543) for the app; direct connection (port 5432) for migrations
DATABASE_URL=postgresql://postgres.<ref>:<password>@<host>:6543/postgres
DIRECT_URL=postgresql://postgres.<ref>:<password>@<host>:5432/postgres
```

The frontend reads these automatically via `next.config.ts` — no separate `.env` file needed.

### 3. Run database migrations

```bash
cd projects/tubo/backend
node scripts/migrate.mjs
```

This applies all SQL files in `supabase/migrations/` in order.

### 4. Start the frontend (dev server)

```bash
cd projects/tubo/frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign up, create a company, and start invoicing.

### 5. Run tests

```bash
# Backend (105 tests)
cd projects/tubo/backend
npm test

# Frontend (55 tests)
cd projects/tubo/frontend
npm test
```

---

## Architecture

### Application structure

```
projects/tubo/
├── backend/                    @tubo/backend npm package
│   ├── src/
│   │   ├── api/                HTTP layer — Request in, Response out
│   │   ├── auth/               Authentication — who is calling
│   │   ├── domain/             Types, errors, money math
│   │   ├── repositories/       Database access (only code that talks to DB)
│   │   ├── services/           Business rules, worker, rate limiter
│   │   └── validation/         Input parsing and validation (Zod schemas)
│   ├── supabase/migrations/    SQL migrations (applied in order)
│   └── tests/                  Backend tests (node:test)
├── frontend/                   Next.js app
│   ├── src/
│   │   ├── app/api/            Thin route handlers — call backend
│   │   ├── components/         React components (dashboard, modals, tables)
│   │   ├── lib/                Client utilities (formatting, API client)
│   │   └── providers/          React context (auth, Supabase client)
│   └── tests/                  Frontend tests (Vitest)
└── docs/
    └── DECISIONS.md            Design decisions and trade-offs
```

**Key design choices:**
- npm workspaces link `backend/` and `frontend/`; the frontend imports `@tubo/backend` directly
- Each layer has one job: API handles HTTP, services hold business rules, repositories talk to the database
- Interfaces for external dependencies (government client, rate limiter) enable testing with in-memory fakes
- Constructor dependency injection throughout — no globals, no singletons

### Database design

```
companies ──< users          (one company, many users)
companies ──< invoices       (one company, many invoices)
invoices  ──< invoice_items  (one invoice, many line items)
invoices  ──< submission_jobs (one invoice, one job)
invoices  ──< processing_logs (one invoice, many attempt logs)
```

**Key tables:**

| Table | Purpose |
|---|---|
| `companies` | Seller identity and tax ID |
| `users` | Links Supabase auth identity to a company |
| `invoices` | Invoice header with status, totals, idempotency key |
| `invoice_items` | Line items (description, quantity, unit price, tax) |
| `submission_jobs` | Job queue: tracks attempts, backoff, lease lock |
| `processing_logs` | Append-only log of every submission attempt |

**Integrity constraints:**
- `UNIQUE(company_id, invoice_number)` — no duplicate invoice numbers per company
- `UNIQUE(company_id, idempotency_key)` — safe client retries
- `CHECK(total_amount = subtotal + tax_amount)` — database enforces math
- `guard_invoice_update` trigger — only valid status transitions allowed
- Row Level Security on every table

### Invoice processing flow

```
1. Client  ──POST /api/invoices──►  Tubo API
2. API validates and saves invoice + items + job in ONE transaction
3. API returns 201 immediately (status: pending)
4. Dashboard polls POST /api/worker every 5 seconds
5. Worker claims jobs with FOR UPDATE SKIP LOCKED
6. Worker sets invoice status to 'processing' atomically
7. Worker sends to government API (rate-limited)
8. On success  → invoice: submitted, job: done
   On rejection → invoice: rejected, job: done
   On error/timeout → exponential backoff, retry (up to 15 attempts)
   After 15 failures → invoice: failed, job: dead (manual retry available)
```

**Retry strategy:** exponential backoff capped at 5 minutes, 15 attempts total, covering 33+ minutes of sustained outage.

### Authentication approach

- **Supabase Auth** handles signup, login, and JWT tokens
- Every API request requires `Authorization: Bearer <token>`
- The backend verifies the token, looks up the user's company, and filters all queries by `company_id`
- RLS policies are a second defense layer: even a direct database query cannot see another company's data
- 404 (not 403) for another company's invoice — the API does not reveal which IDs exist
- **Team invitations** — a user with a company can invite teammates by email (`POST /api/invitations`). The invite is a single-use, expiring token; accepting it (`POST /api/invitations/accept`) links the new user to the same company, so both share all invoices under the existing RLS rules. Email is sent through an `EmailSender` interface: **real email via Resend** when `RESEND_API_KEY` is set, otherwise a console sender that logs the accept link (so it works with no email service). Swapping providers is a one-line change (dependency injection).

**Optional environment variables for real email + correct invite links (set these on Vercel):**
```
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app   # makes invite links use the live domain (auto-detected on Vercel if unset)
RESEND_API_KEY=re_...                              # from resend.com — enables real email delivery
EMAIL_FROM=Tubo <onboarding@resend.dev>            # verified sender (defaults to Resend's test sender)
```
Without `RESEND_API_KEY`, invites still work — the app shows a copyable invite link instead of emailing it.

---

## API Reference

All endpoints require `Authorization: Bearer <Supabase access token>`.

| Method | Endpoint | Description | Success | Errors |
|---|---|---|---|---|
| POST | `/api/v1/invoices` | Create invoice (+ `Idempotency-Key` header) | 201 / 200 (replay) | 400, 401, 409, 422 |
| GET | `/api/v1/invoices` | List invoices (cursor paging) | 200 | 400, 401 |
| GET | `/api/v1/invoices/:id` | Invoice detail + processing log | 200 | 401, 404 |
| POST | `/api/v1/invoices/:id/retry` | Retry a failed invoice | 202 | 401, 404, 409 |
| GET | `/api/v1/invoices/summary` | Status counts for dashboard | 200 | 401 |
| POST | `/api/v2/invoices` | Create invoice (V2: optional due_date, notes, payment_terms, billing_address) | 201 / 200 | same as V1 |

**List filters:** `status`, `invoice_number`, `date_from`, `date_to`, `limit` (1-100), `cursor`

---

## Assumptions

1. **One company per user, multiple users per company** — a user belongs to exactly one company, but a company can have many users. Teammates join via **email invitation** (single-use, expiring token). Switching between companies with one login is out of scope.
2. **Government API is simulated** — a mock in-memory client with realistic failure modes (503 errors, timeouts, rejections). A real implementation would swap the class via dependency injection.
3. **Worker runs in-process** — triggered by frontend polling (`POST /api/worker`). In production, this would be a standalone cron job or dedicated process.
4. **Invoices are immutable after creation** — only status and processing fields change. Editing invoice data would require a new version with its own audit trail.
5. **Invoice numbers are company-scoped** — `INV-001` can exist in two different companies. Format: 3 uppercase letters + dash + digits.
6. **Tax ID format** — `XXX-XXX-XXX-000` (12 digits in 4 groups of 3). If only 9 digits are provided, the 4th group defaults to `000`.
7. **Retry budget** — 15 attempts with exponential backoff covers 33+ minutes. Manual retry from the UI gives another 15 attempts.
8. **Money is stored as `numeric(14,2)`** — server-side BigInt whole-cent math avoids floating point errors; the database enforces `total = subtotal + tax`.

---

## Production Improvements

| Area | Improvement |
|---|---|
| **Worker deployment** | Run as a standalone process (e.g., Kubernetes CronJob) instead of in-process polling |
| **Queue** | Replace the database job table with a dedicated queue (Redis, SQS) for higher throughput |
| **Database** | Read replicas for list/detail queries; connection pooling via PgBouncer |
| **Rate limiter** | Shared Redis-backed token bucket so multiple workers respect the government API limit |
| **Caching** | Redis cache for status counts, recent invoice lookups |
| **Monitoring** | Centralized logging (Datadog/Loki), dashboards for queue depth, error rate, latency, alerts |
| **PDF generation** | Async PDF generation stored in S3/R2, downloadable from the invoice detail |
| **Auth** | Local JWT verification (avoid one network round-trip per request), refresh token rotation |
| **Input validation** | Tax ID validation against a real registry; invoice number uniqueness suggestions |
| **Testing** | End-to-end tests with Playwright; load testing for the worker under sustained traffic |
| **Deployment** | Blue-green deploys to avoid interrupting invoice processing; database migrations as a separate step |
| **Audit trail** | Full audit log of who changed what and when, beyond the processing log |
| **Multi-currency** | Exchange rate snapshots at invoice creation time for reporting |

---

## Test Summary

| Suite | Count | What it covers |
|---|---|---|
| Backend: `invoice-totals.test.ts` | BigInt money math, rounding, edge cases |
| Backend: `create-invoice-schema.test.ts` | Zod validation for V1 invoice payloads |
| Backend: `create-invoice-v2-schema.test.ts` | V2 schema: new optional fields (due_date, notes, etc.) |
| Backend: `invoice-service.test.ts` | Business rules: create, list, summary, retry, idempotency |
| Backend: `invoice-api.test.ts` | HTTP layer: status codes, error shapes, header handling |
| Backend: `company.test.ts` | Company registration and user lookup |
| Backend: `mock-government-client.test.ts` | Government client: success, rejection, idempotent retry |
| Backend: `submission-worker.test.ts` | Worker: claim, process, retry backoff, rate limiting |
| Backend: `token-bucket-rate-limiter.test.ts` | Token bucket: burst, refill, wait behavior |
| Frontend: `invoice-form.test.ts` | Form validation, live totals, error mapping |
| Frontend: `idempotency-key.test.ts` | Stable key generation, deduplication |
| Frontend: `merge-invoices.test.ts` | Optimistic list merging for real-time updates |
| Frontend: `status-and-format.test.ts` | Status ordering, money formatting, date formatting |
| Frontend: `timeline.test.ts` | Processing timeline construction from attempt logs |
| Frontend: `api-client.test.ts` | API client: request building, error handling |
| **Total** | **160 tests** | **All passing** |

---

## Git History

| Commit | Description |
|---|---|
| `6250a1c` | Full-stack Tubo platform: schema, API, frontend, tests (Parts A–G, J) |
| `f8c4564` | Async processing, crash recovery, concurrency, scalability, versioning, debugging (Parts H–N) |
| `9c4a164` | Navbar logo and Supabase environment config |
| `320d43c` | README for project details and setup |
| `9823fcc` | Vercel deployment config |
| `a13748d` | UI polish: scrollbar fix on create modal |
| *(pending)* | Bug fix: claim_submission_jobs sets invoice to processing; dashboard optimization; input formatting |
