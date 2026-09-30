# Tubo — Invoice Processing Platform

Tubo is an invoicing platform built for the Ventaja International Group work immersion assessment. It receives invoices from businesses, validates and stores them, then submits them to an external government invoicing service. The core invariant: **invoices must never be lost or duplicated**.

**Stack:** Next.js 16 (frontend + API routes) · Supabase (Postgres database + authentication) · TypeScript

---

## Setup

### Prerequisites

- **Node.js** v24+ (or the portable install at `%LOCALAPPDATA%\nodejs-portable\node-v24.19.0-win-x64`)
- **A Supabase project** — you need the URL, anon key, and service-role key from your dashboard

### 1. Install dependencies

```bash
cd projects/tubo
npm install
```

This installs both `@tubo/backend` and `@tubo/frontend` via npm workspaces.

### 2. Configure environment variables

Create `projects/tubo/backend/.env` with your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DATABASE_URL=postgresql://postgres:your-password@db.your-project.supabase.co:5432/postgres
```

> **Security:** The `.env` file is git-ignored. Never commit secrets. The `SUPABASE_SERVICE_ROLE_KEY` stays server-side only.

The frontend's `next.config.ts` automatically loads `backend/.env` during local development, so you only need one `.env` file.

### 3. Run database migrations

```bash
cd projects/tubo/backend
node scripts/migrate.mjs
```

This applies all SQL migrations in order to your Supabase database.

### 4. Run the backend tests

```bash
cd projects/tubo/backend
npm test
```

Expected: **105 tests, 0 failures.**

### 5. Run the frontend tests

```bash
cd projects/tubo/frontend
npm test
```

Expected: **55 tests, 0 failures.**

### 6. Start the development server

```bash
cd projects/tubo/frontend
npm run dev
```

Open **http://localhost:3000** in your browser. Sign up, create a company, and start creating invoices.

---

## Architecture

### Application structure

```
projects/tubo/
├── backend/                    @tubo/backend (npm package)
│   ├── src/
│   │   ├── api/                HTTP layer — turns requests into service calls
│   │   │   ├── invoice-api.ts      V1 endpoints (create, list, get, retry, summary)
│   │   │   ├── invoice-api-v2.ts   V2 endpoints (extends V1 with new fields)
│   │   │   ├── company-api.ts      Company registration + profile
│   │   │   └── http.ts            Response helpers (json, respond, readJsonBody)
│   │   ├── auth/               Authentication
│   │   │   ├── authenticator.ts         Interface
│   │   │   └── supabase-authenticator.ts  JWT verification + company lookup
│   │   ├── domain/             Types, interfaces, business rules
│   │   │   ├── invoice.ts           Invoice types and status enum
│   │   │   ├── company.ts          Company and profile types
│   │   │   ├── errors.ts           Typed error classes (NotFound, Conflict, etc.)
│   │   │   ├── government-client.ts Interface for the external government service
│   │   │   ├── rate-limiter.ts     Interface for rate limiting
│   │   │   └── invoice-totals.ts   BigInt-based money calculator
│   │   ├── services/           Business logic
│   │   │   ├── invoice-service.ts          Create, list, get, retry
│   │   │   ├── company-service.ts          Register company
│   │   │   ├── submission-worker.ts        Background job processor
│   │   │   ├── mock-government-client.ts   Simulated government API
│   │   │   ├── token-bucket-rate-limiter.ts  Rate limiting (100 req/s)
│   │   │   └── no-op-rate-limiter.ts       Pass-through for tests
│   │   ├── repositories/      Database access (only place that talks to DB)
│   │   │   ├── invoice-repository.ts       Interface
│   │   │   ├── supabase-invoice-repository.ts  Real implementation
│   │   │   ├── company-repository.ts       Interface
│   │   │   └── supabase-company-repository.ts  Real implementation
│   │   ├── validation/        Input validation (Zod schemas)
│   │   │   ├── create-invoice-schema.ts    V1 invoice payload
│   │   │   ├── create-invoice-v2-schema.ts V2 payload (extends V1)
│   │   │   ├── list-invoices-query.ts      Query string filters
│   │   │   ├── idempotency-key.ts          Header extraction
│   │   │   ├── register-company-schema.ts  Company registration
│   │   │   ├── cursor.ts                  Keyset pagination encoding
│   │   │   └── request-hash.ts            Deterministic body hash
│   │   ├── index.ts            Backend factory (dependency injection)
│   │   └── shared.ts          Types re-exported for the frontend
│   ├── supabase/migrations/   7 SQL migrations (applied in order)
│   ├── tests/                 105 unit + integration tests
│   └── scripts/               Migration runner
│
├── frontend/                   @tubo/frontend (Next.js app)
│   ├── src/
│   │   ├── app/
│   │   │   ├── api/v1/invoices/   V1 API routes (thin wrappers)
│   │   │   ├── api/v2/invoices/   V2 API routes
│   │   │   ├── api/company/       Company registration
│   │   │   ├── api/me/            User profile
│   │   │   ├── api/worker/        Worker trigger endpoint
│   │   │   ├── login/             Sign-in page
│   │   │   ├── signup/            Registration page
│   │   │   ├── setup/             Company onboarding
│   │   │   └── page.tsx           Dashboard (authenticated)
│   │   ├── components/         React components
│   │   │   ├── dashboard.tsx          Main orchestrator
│   │   │   ├── dashboard-stats.tsx    KPI cards (6 statuses)
│   │   │   ├── invoice-table.tsx      Filterable, paginated table
│   │   │   ├── create-invoice-modal.tsx  Invoice creation form
│   │   │   ├── invoice-detail-modal.tsx  Detail view + retry + timeline
│   │   │   ├── navbar.tsx             Top navigation
│   │   │   ├── status-pill.tsx        Colored status badges
│   │   │   ├── auth-guard.tsx         Route protection
│   │   │   ├── toast.tsx              Notification system
│   │   │   └── spinner.tsx            Loading indicator
│   │   ├── lib/                Frontend utilities
│   │   │   ├── api-client.ts          Typed HTTP client with auth
│   │   │   ├── invoice-form.ts        Form state + validation
│   │   │   ├── idempotency-key.ts     Client-side key generation
│   │   │   ├── tax-id-format.ts       Auto-dash formatting
│   │   │   ├── format.ts             Money, date, time formatters
│   │   │   ├── status.ts             Status styles and helpers
│   │   │   ├── currencies.ts          Currency list (PHP first)
│   │   │   ├── timeline.ts           Attempt history display
│   │   │   └── merge-invoices.ts      Live refresh merging
│   │   ├── providers/          React context providers
│   │   └── server/             Server-side backend access
│   └── tests/                  55 unit tests
│
└── docs/
    └── DECISIONS.md            All design decisions (Parts H–N)
```

### Layers (each has one job)

| Layer | Files | Responsibility |
|-------|-------|---------------|
| **HTTP** | `api/invoice-api.ts`, `api/company-api.ts` | Request in, Response out. Turns errors into JSON |
| **Services** | `services/invoice-service.ts`, etc. | Business rules: totals, duplicates, pagination, retries |
| **Repositories** | `repositories/*` | Only code that talks to the database. Swappable via interfaces |
| **Auth** | `auth/*` | JWT verification, company lookup |
| **Validation** | `validation/*` | Input shape and format (Zod schemas) |
| **Domain** | `domain/*` | Types, errors, interfaces, money math |

---

## Database design

### 6 tables

| Table | Purpose |
|-------|---------|
| `companies` | Registered companies (name, tax_id) |
| `users` | Supabase Auth users linked to a company |
| `invoices` | Invoice header (number, date, customer, amounts, status) |
| `invoice_items` | Line items (description, quantity, unit_price, tax) |
| `submission_jobs` | Job queue for government submission (outbox pattern) |
| `processing_logs` | Append-only log of every submission attempt |

### Key constraints

- `UNIQUE(company_id, invoice_number)` — no duplicate invoice numbers per company
- `UNIQUE(company_id, idempotency_key)` — no duplicate requests
- Invoice + items + job created in **one transaction** (transactional outbox)
- Status transitions enforced by a database trigger (state machine)
- Row Level Security on all 6 tables — users can only read their own company's data

### Status flow

```
pending → processing → submitted (done)
                    → rejected  (invalid data, no retry)
                    → pending   (retryable error, scheduled for retry)
                    → failed    (max attempts reached, manual retry available)
```

---

## Invoice processing flow

```
1. Client sends POST /api/v1/invoices with Idempotency-Key header
2. Backend validates input (Zod schema) and authenticates (JWT)
3. Database atomically: saves invoice + items + creates submission job
4. API returns 201 immediately — client does NOT wait for government
5. Worker (triggered every 10s) claims queued jobs with FOR UPDATE SKIP LOCKED
6. Worker sends invoice to government API (with rate limiting at 100 req/s)
7. Government responds: success / rejected / error / timeout
8. Worker atomically logs the attempt and updates invoice status
9. On error: exponential backoff retry (1s → 2s → 4s → ... → 5min cap, 15 attempts)
10. After 15 failures: invoice marked as "failed", user can manually retry from UI
```

### Crash recovery

If the server crashes after the government accepts but before we record it:
1. The worker's 60-second lease expires
2. Another worker reclaims the job
3. The government recognizes the same `invoiceId` and returns the same result
4. No duplicate is created

---

## Authentication approach

- **Supabase Auth** handles sign-up, sign-in, and JWT token generation
- The frontend creates a browser Supabase client via `@supabase/ssr`
- Every API request includes `Authorization: Bearer <JWT>`
- The backend verifies the JWT using `supabase.auth.getUser(token)`
- The user's `company_id` is looked up from the `users` table
- All queries are filtered by `company_id` — cross-company data is never exposed
- Another company's invoice returns **404, not 403** (doesn't reveal which IDs exist)
- **Row Level Security** is enabled on all tables as a second layer of defense

---

## Assumptions

1. **Single-tenant per user** — each user belongs to exactly one company.
2. **Invoices are immutable** — once created, only the status and result fields change.
3. **The government API is idempotent** — sending the same `invoiceId` twice returns the same result.
4. **PHP (Philippine Peso)** is the default currency, but 16 currencies are supported.
5. **The mock government service** simulates realistic failure rates: 55% success, 20% temporary failure, 10% rejection, 15% timeout.
6. **Worker polling from the dashboard** is sufficient for this assessment. In production, a dedicated worker process or cron job would replace it.
7. **Invoice numbers are uppercase** — auto-converted on input and in the validation schema.
8. **Tax ID format** uses dashes every 3 digits (e.g., `123-456-789`), auto-formatted in the UI.

---

## Production improvements

If this application were going to production, these improvements would be made:

### Infrastructure
- **Dedicated worker process** — not triggered by the frontend, but running independently on a schedule or as a long-lived process
- **Distributed rate limiter** — Redis-backed `TokenBucketRateLimiter` shared across all workers (currently in-memory, per-process)
- **Database read replicas** — route list/detail queries to replicas, writes to primary
- **Connection pooling** — use Supabase's pgBouncer (port 6543) for serverless connections
- **Load balancer** — multiple API servers behind Nginx or AWS ALB

### Reliability
- **Dead letter queue** — invoices that fail 15 times go to a separate queue for manual review
- **Health check endpoint** — `/api/health` for load balancer and monitoring
- **Circuit breaker** — stop sending to the government API if the error rate exceeds a threshold, instead of burning through retries
- **Graceful shutdown** — workers finish their current batch before stopping

### Observability
- **Structured logging** — JSON logs with request IDs, sent to Datadog or similar
- **Metrics dashboard** — queue depth, processing latency, error rate, throughput
- **Alerting** — page on-call if the queue grows beyond a threshold or error rate spikes

### Security
- **Rate limiting on the API** — prevent abuse (e.g., 100 requests/minute per company)
- **CSRF protection** — for the browser-facing routes
- **Audit log** — who created/retried which invoice, when
- **Secret rotation** — automated key rotation for the service-role key

### Features
- **PDF generation** — generate and store invoice PDFs in object storage (S3/R2)
- **Webhook notifications** — notify customers when their invoice status changes
- **Bulk import** — CSV upload for batch invoice creation
- **Dashboard search** — full-text search across invoice numbers, customer names, emails

### Database
- **Partitioning** — partition `processing_logs` by month (grows fastest)
- **Archival** — move old submitted/rejected invoices to cold storage after 1 year
- **Backup verification** — automated restore tests on a schedule

---

## Tests

| Suite | Count | What it covers |
|-------|-------|---------------|
| Backend | 105 | Invoice creation, idempotency, duplicate detection, listing, pagination, retry, totals calculator, rate limiter, submission worker, mock government client, V2 schema |
| Frontend | 55 | API client, form validation, status helpers, timeline builder, tax ID formatting, currencies, idempotency keys |
| **Total** | **160** | **Zero failures** |

Run all tests:

```bash
cd projects/tubo/backend && npm test
cd projects/tubo/frontend && npm test
```

---

## Git history

| Commit | Description |
|--------|-------------|
| `a3d4ea9` | Initial setup: work immersion repository |
| `6230cc6` | Update profile |
| `6250a1c` | Full-stack Tubo platform: backend, frontend, database, auth, tests |
| `f8c4564` | Parts H–N: async processing, crash recovery, concurrency, scalability, API versioning, rate limiting, debugging analysis |

---

Built by **Santiago Kit** for the Ventaja International Group work immersion assessment.
