# Tubo — Assessment Answers (every part explained simply)

> **Who this is for:** the interview panel, and me (Santiago) studying before the technical discussion.
> **How to read it:** plain language, short sentences, real examples. Every technical word is explained the first time it shows up. After each answer there is a **📁 Where to find it** line pointing at the real file, so I can open the code and point to it during the discussion.

---

## What Tubo is (one paragraph)

Tubo is an **electronic invoicing platform**. A business signs in, creates invoices, and Tubo sends each invoice to an **external government service**. The government service is unreliable — it can be slow, be down, reject an invoice, or accept an invoice at the exact moment our own server crashes. So the whole system is built around one promise: **an invoice is never lost and never sent twice.**

Two words you will see a lot:
- **Idempotent / idempotency** — doing the same thing many times gives the same result as doing it once. Like pressing an elevator button five times: still one elevator.
- **Transaction** — a group of database writes that either *all* happen or *none* happen. No half-finished state.

---

## Purpose — why this application exists

**The problem:** In many countries, a business must report every invoice it issues to a government tax service (electronic invoicing / e-invoicing). Doing this by hand is slow and error-prone, and the government's system can be slow or temporarily down. A business needs something in the middle that takes care of it reliably.

**What Tubo does:** Tubo is that middle layer. A business creates its invoices in Tubo; Tubo checks them, stores them safely, and automatically sends each one to the government service in the background — retrying when the government is down, and never sending the same invoice twice. The business gets a simple dashboard to see the status of every invoice (waiting, sent, or failed) instead of guessing.

**Who uses it:** staff of a business (the "seller company"). Each person signs in, and everything they see and do is limited to their own company's data.

**The one promise everything is built around:** an invoice is **never lost** and **never duplicated**, even if the government service fails or Tubo's own server crashes at the worst moment.

## What users can do (features)

| # | Feature | What the user does | Where in the app |
|---|---|---|---|
| 1 | **Sign up / log in** | Create an account and sign in securely (email + password). | `frontend/src/app/signup`, `login` |
| 2 | **Set up their company** | On first use, register the business (name + tax ID). Everything after is scoped to this company. | `frontend/src/app/setup` |
| 2b | **Invite teammates / join a company** | An owner invites people by email (single-use, expiring link); the invited person joins the **same** company and shares its invoices. | `invite-teammate-modal.tsx`, `app/invite/[token]` |
| 3 | **Create an invoice** | Fill a form: customer details, currency, and **add/remove multiple line items**. Totals update live; the server does the real math. | `create-invoice-modal.tsx` |
| 4 | **See validation errors** | If a field is wrong (bad email, missing item, etc.), a clear message appears under it before anything is saved. | `lib/invoice-form.ts` |
| 5 | **View the dashboard** | See all invoices in a table — Invoice Number, Customer, Date, Amount, Status — with count cards per status. | `dashboard.tsx`, `dashboard-stats.tsx` |
| 6 | **Filter & search** | Filter by status or date, and search by exact invoice number. | `invoice-table.tsx` |
| 7 | **Watch status update live** | Without refreshing, an invoice moves `pending → processing → submitted` (or `failed`) as the background worker sends it. | dashboard polling |
| 8 | **Open invoice details** | See the full invoice, its items, current status, and a **timeline** of every send attempt (including errors and timing). | `invoice-detail-modal.tsx`, `lib/timeline.ts` |
| 9 | **Retry a failed invoice** | For an invoice that failed after all automatic attempts, press **Retry** to try again with a fresh budget. | retry button + `POST /api/.../retry` |
| 10 | **Work by month** | The dashboard shows a chosen month (default: current); a month picker moves between months, with that month's totals. | `month-bar.tsx`, `lib/month.ts` |
| 11 | **Generate & email a monthly report** | A formal, printable monthly report (Save-as-PDF), and an "Email me" button that sends a formal summary + link. | `monthly-report-modal.tsx`, `/api/reports/monthly` |
| 12 | **Review the audit trail** | A separate tab lists business events (created/submitted/rejected/failed/retried, teammate invited/joined) over past months/years, filterable by date, with a formal PDF report. | `audit-trail.tsx`, `/api/audit` |
| 13 | **Stay isolated & secure** | Never see another company's data — enforced in the backend and again by the database. | auth + RLS |

**What happens automatically (no user action needed):** the background worker keeps sending queued invoices to the government service, retries failures with increasing waits, respects the government's rate limit, and records every attempt — all on its own.

---

## Index — where each PDF part is answered

| Part | Topic | Answered? | Section below |
|---|---|---|---|
| A | Scenario (don't lose/duplicate invoices) | ✅ | [Part A](#part-a--the-scenario) |
| B | Data model (invoice header + items) | ✅ | [Part B](#part-b--data-model) |
| C1 | Why the database is designed this way | ✅ | [Part C](#part-c--database-design) |
| C2 | Prevent the same invoice twice | ✅ | [Part C](#part-c--database-design) |
| C3 | Two identical requests at once | ✅ | [Part C](#part-c--database-design) |
| D | Backend REST API | ✅ | [Part D](#part-d--backend-api) |
| E1 | Stop User A reading Company B's invoice | ✅ | [Part E](#part-e--authentication--security) |
| E2 | Where secrets are stored | ✅ | [Part E](#part-e--authentication--security) |
| E3 | Security checks before accepting an invoice | ✅ | [Part E](#part-e--authentication--security) |
| F | Frontend (dashboard, create, detail, retry) | ✅ | [Part F](#part-f--frontend) |
| G | Mock government service | ✅ | [Part G](#part-g--external-service-integration) |
| H1/H2/H3 | Asynchronous processing | ✅ | [Part H](#part-h--asynchronous-processing) |
| I1/I2/I3 | Critical failure scenario | ✅ | [Part I](#part-i--critical-failure-scenario) |
| J (1–6) | Concurrency problem | ✅ | [Part J](#part-j--concurrency-problem) |
| K1/K2/K3 | Scalability | ✅ | [Part K](#part-k--scalability) |
| L1/L2 | Failure & retry design | ✅ | [Part L](#part-l--failure--retry-design) |
| M | API versioning | ✅ | [Part M](#part-m--api-versioning) |
| N (1–5) | Debugging scenario | ✅ | [Part N](#part-n--debugging-scenario) |
| O | Code quality | ✅ | [Part O](#part-o--code-quality) |
| P | README | ✅ | [Part P](#part-p--readme) |
| Q1–Q10 | Technical discussion | ✅ | [Part Q](#part-q--technical-discussion-prep) |
| Submission #4 | API documentation | ✅ | [API Reference](#api-reference) |
| Submission #5 | Architecture diagram | ✅ | [Architecture](#architecture) |

Two more sections at the end of this file cover the remaining PDF submission items: a full **[API Reference](#api-reference)** and the **[Architecture](#architecture)** diagrams. Deeper design notes live in [`DECISIONS.md`](./DECISIONS.md).

---

## Part A — The scenario

**What the PDF asks:** Businesses send invoices to Tubo. Tubo validates, stores, and forwards them to a government service that may be slow, be down, reject invoices, error out, or accept an invoice while Tubo crashes. Design so invoices are **not lost or duplicated**.

**How Tubo answers it (the three-part safety net):**

1. **Never lost** — when we accept an invoice, we save the invoice *and* a "please send this later" job in **one transaction** (the outbox pattern). If saving fails, nothing is saved and the caller gets an error. If it succeeds, a job always exists, so the invoice will be sent.
2. **Never duplicated on our side** — the database refuses a second invoice with the same number for the same company, and refuses a repeated create request (idempotency key).
3. **Never duplicated on the government's side** — we always send the same stable ID (the invoice's database id). Even if we send it five times after a crash, the government recognizes the ID and treats it as one.

📁 Where to find it: the whole design — `backend/src/`, database in `backend/supabase/migrations/`, summary in [`DECISIONS.md`](./DECISIONS.md).

---

## Part B — Data model

**What the PDF asks:** an invoice has a header and multiple items, with specific fields.

**Invoice header fields (PDF → our column):**

| PDF field | Our column | Type | Note |
|---|---|---|---|
| Invoice Number | `invoice_number` | text | unique per company |
| Invoice Date | `invoice_date` | date | |
| Seller/Company | `company_id` | uuid → `companies` | the seller is the signed-in company |
| Customer Name | `customer_name` | text | |
| Customer Tax ID | `customer_tax_id` | text | |
| Customer Email | `customer_email` | text | format-checked |
| Currency | `currency` | char(3) | e.g. `PHP`, `USD` |
| Subtotal | `subtotal` | numeric(14,2) | computed by the DB |
| Tax Amount | `tax_amount` | numeric(14,2) | computed by the DB |
| Total Amount | `total_amount` | numeric(14,2) | must equal subtotal + tax |
| Invoice Status | `status` | enum | pending/processing/submitted/rejected/failed |
| Created Date | `created_at` | timestamptz | |
| Updated Date | `updated_at` | timestamptz | auto-updated by a trigger |

We also added operational fields: `idempotency_key`, `request_hash` (to detect repeats), `external_ref` (the government's reference after success), `rejection_reason`.

**Invoice item fields (PDF → our column):**

| PDF field | Our column | Type |
|---|---|---|
| Description | `description` | text |
| Quantity | `quantity` | numeric(12,3) |
| Unit Price | `unit_price` | numeric(14,2) |
| Tax | `tax` | numeric(14,2) |
| Line Total | `line_total` | numeric(14,2) (`= round(quantity × unit_price, 2) + tax`) |

We added `line_number` so items always read back in the same order.

**How the totals (including tax) are computed — by the database, never the client:**

Inside the `create_invoice` function, for the items you send:
- **subtotal** = sum of each item's `round(quantity × unit_price, 2)`
- **tax_amount** = sum of each item's `tax` value (each item carries its own tax amount; missing = 0)
- **total_amount** = `subtotal + tax_amount`

So tax is **the sum of every line's tax**, not a percentage applied by the system — the user enters the tax per item, and the DB adds them up. The client's numbers are ignored: even if the browser sends totals, the server recomputes them and rejects the request if they disagree. A database `CHECK (total_amount = subtotal + tax_amount)` and a per-line `CHECK (line_total = round(quantity × unit_price, 2) + tax)` guarantee the math can never drift.

*Example:* item A (qty 2 × 1500.00, tax 360.00) + item B (qty 1 × 500.00, tax 60.00) → subtotal 3500.00, tax 420.00, total 3920.00.

📁 Where to find it: the `sum(...)` in `create_invoice` at `backend/supabase/migrations/20260930000000_init.sql`; the client-totals check in `backend/src/services/invoice-service.ts` (`assertClientTotalsMatch`); exact money math in `backend/src/domain/invoice-totals.ts`.

---

## Part C — Database design

We use **6 tables**. Here is the whole data model and *why each table exists*.

```
 companies ──< users            (one company has many users/logins)
 companies ──< invoices         (one company has many invoices)
 invoices  ──< invoice_items    (one invoice has many line items)
 invoices  ──1 submission_jobs  (each invoice has exactly one send-job)
 invoices  ──< processing_logs  (each invoice has many attempt logs)
```
(`──<` means "one to many"; `──1` means "one to one".)

| Table | Why it exists |
|---|---|
| `companies` | The seller. Holds the company name and its tax ID. |
| `users` | Links a Supabase login to **one** company. The login/password itself lives in Supabase's own `auth.users`; this table just says "this user belongs to this company." |
| `invoices` | The invoice header (all the fields in Part B) plus status and operational fields. |
| `invoice_items` | The line items. Separate table because one invoice has *many* items. |
| `submission_jobs` | The **outbox / to-do queue**: one row per invoice telling the worker "send this to the government," with attempt count, backoff time, and a lock. |
| `processing_logs` | An **append-only history**: one row for every single send attempt, so we can see exactly what happened and when. |

### C1 — Why designed this way?

- **Primary keys are UUIDs** (`gen_random_uuid()`). A UUID is a random, unguessable id. This is safer than 1, 2, 3… because a user can't guess "invoice #5 exists" by counting.
- **Foreign keys** connect the tables (e.g. `invoice_items.invoice_id → invoices.id`). With `on delete cascade`, deleting an invoice cleanly removes its items, job, and logs — no orphan rows.
- **Unique constraints** enforce the business rules at the lowest level (see C2).
- **Indexes** make the common screens fast:
  - `invoices_list_idx (company_id, created_at desc)` — the dashboard list ("my newest invoices").
  - `invoices_status_idx (company_id, status)` — filtering by status.
  - `submission_jobs_due_idx (next_attempt_at) where status in (queued, processing)` — the worker's "what's due now?" query only scans jobs that still need work.
- **Status is an enum** (`invoice_status`) not free text, so an invalid status like `"donee"` is impossible.
- **Money is `numeric(14,2)`**, not floating point. Floats can turn 0.10 + 0.20 into 0.30000000000000004; `numeric` keeps exact cents. A `CHECK (total_amount = subtotal + tax_amount)` makes the database itself refuse wrong math.

📁 Where to find it: `backend/supabase/migrations/20260930000000_init.sql` (tables, keys, indexes), `..._0100_hardening.sql` (extra checks + immutability).

### C2 — How do we stop the same company creating the same invoice twice?

We stop it in **three layers**, all enforced by the database (not by app code that could be raced or bypassed).

**Layer 1 — two unique constraints on the `invoices` table:**
```sql
unique (company_id, invoice_number)     -- no two invoices with the same number per company
unique (company_id, idempotency_key)    -- the same "create" request can't run twice
```
- `(company_id, invoice_number)` — a business can never have two `INV-10001`s. (It's per company, so two *different* companies can each have their own `INV-10001`.)
- `(company_id, idempotency_key)` — protects against the *same request* being sent twice (e.g. the phone's network dropped after we saved it, and the app retried). The app sends a unique `Idempotency-Key` header per attempt.

**Layer 2 — the `create_invoice` function inserts directly and reacts to conflicts** (it never does "check then insert" — see C3 for why). This is the real code:
```sql
insert into invoices (company_id, idempotency_key, request_hash, ...)
values (...)
on conflict (company_id, idempotency_key) do nothing   -- same request again? do nothing
returning id into v_id;
-- if the number clashes (different key, same invoice_number) the insert raises unique_violation
```
Then it decides what actually happened:
- **New invoice** → `v_id` is set → we create the items + the send-job and return `{ replayed: false }` (HTTP **201**).
- **Same key again** → `on conflict do nothing` left `v_id` null → we re-read the existing row. If its stored `request_hash` matches the new request, it's a genuine repeat → return the original invoice `{ replayed: true }` (HTTP **200**).
- **Same key, *different* data** → the `request_hash` differs → raise `idempotency_key_reuse` (HTTP **422**) — that's a client bug, so we refuse instead of guessing.
- **Same invoice number, different key** → the insert hits the *other* unique constraint → `unique_violation` → we raise `duplicate_invoice_number` (HTTP **409**).

**Layer 3 — the `request_hash`** is a SHA-256 fingerprint of the meaningful fields (invoice number, date, customer, currency, and each item's description/qty/price/tax, with the email lowercased so `A@x.com` == `a@x.com`). It's what lets us tell "honest retry" (same hash → replay) from "key misuse" (different hash → 422).

The exact error names the database raises are turned into HTTP responses in the repository's `translate()` method.

📁 Where to find it: the two `unique (...)` lines and the `create_invoice` function in `backend/supabase/migrations/20260930000000_init.sql` (refined in `..._0200_fix_create_invoice_race.sql`, `..._0300_api_support.sql`); the fingerprint in `backend/src/validation/request-hash.ts`; the header check in `backend/src/validation/idempotency-key.ts` (regex `^[A-Za-z0-9_\-:.]{8,128}$`); DB-error → HTTP mapping in `backend/src/repositories/supabase-invoice-repository.ts` (`translate`).

### C3 — Two identical requests at exactly the same time (ABC Corp / INV-10001) — how do we guarantee only one invoice?

We **do not** do "check if it exists, then insert" — that has a gap where both requests can pass the check (see Part J). Instead the database inserts directly and lets the unique constraint decide the winner:

```sql
insert into invoices (...) values (...)
on conflict (company_id, idempotency_key) do nothing
returning id;
```

What happens with two requests at once:
1. Both call `create_invoice` and try to `INSERT` `INV-10001` for ABC Corp at nearly the same moment.
2. A unique index in Postgres can only be claimed by one transaction at a time. The **first** insert takes the key; the **second** insert **blocks** (waits) until the first transaction commits or rolls back — Postgres does this automatically, we don't write any locking code.
3. Once the first commits, the second unblocks and sees the key is taken, and resolves deterministically:
   - Same idempotency key → `on conflict do nothing` → we re-read and return the original invoice (a safe **replay**, 200).
   - Different key but same invoice number → the *other* unique constraint fires `unique_violation` → `duplicate_invoice_number` (**409**).

Only one invoice row can ever exist. The database — not our application code — is the referee, and a database unique index cannot be raced.

**Why not "check if it exists, then insert"?** Because between the check and the insert, the other request can slip in (both see "doesn't exist," both insert). That's the exact bug in Part J. An atomic `INSERT ... ON CONFLICT` has no gap.

**We proved this against the real database.** A concurrency test fired two identical `create_invoice` calls simultaneously, four times in a row; every time exactly one row was created and the other call got `duplicate_invoice_number`. (It also verified idempotency replay, `SKIP LOCKED` job claiming, backoff, and RLS.)

📁 Where to find it: the `create_invoice` function and its `on conflict ... do nothing` in `backend/supabase/migrations/20260930000200_fix_create_invoice_race.sql` and `..._0300_api_support.sql`.

---

## Data lifecycle — why invoices cannot be deleted

There is **no "delete invoice" feature**, on purpose. This is a deliberate design decision, not a missing feature.

**Why:**
- An invoice is a **financial and legal record**. Once it's submitted to the government service it must be kept — deleting it would break tax records and the audit trail.
- The whole system is built around **"an invoice is never lost."** A delete button would directly contradict that promise.
- Deleting a row would also destroy its **processing history** (`processing_logs`), which is exactly what support and auditors need.

**How this is enforced (not just a convention):**
- There is **no `DELETE` endpoint** on the API — the invoice routes are create, list, get, and retry only.
- Invoices are **immutable** at the database level. The `guard_invoice_update` trigger freezes every business field (number, customer, amounts, …) after creation, and only allows **legal status transitions** (e.g. `pending → processing → submitted/rejected/failed`). The `guard_invoice_item` trigger makes items immutable and only insertable while the invoice is still `pending`.

**What you'd do instead of deleting (how a mistake is handled):**
- The correct pattern is a **void / cancel status**, not a hard delete: keep the row, add a new allowed status transition (e.g. `→ cancelled`) with a reason, so the record and its audit trail stay intact. Real accounting systems issue a **credit note** rather than erase an invoice.
- This wasn't required by the assessment, so it isn't built — but it's a one-migration change (add the status to the enum + a transition rule in `guard_invoice_update`) with no data loss, which is the point.

📁 Where to find it: the immutability triggers in `backend/supabase/migrations/20260930000100_hardening.sql`; the absence of a delete route across `frontend/src/app/api/v1/invoices/**` and `backend/src/api/invoice-api.ts`.

---

## Part D — Backend API

Four invoice operations, all requiring a login token. Full details in the [API Reference](#api-reference) section at the end of this file.

| Operation | Endpoint | What it does | Success |
|---|---|---|---|
| Create | `POST /api/v1/invoices` | authenticate → validate → recompute totals → detect duplicates → save invoice + job | 201 (or 200 if replayed) |
| List | `GET /api/v1/invoices` | filter by status / date / number, cursor pagination | 200 |
| Get | `GET /api/v1/invoices/{id}` | header + items + processing info | 200 |
| Retry | `POST /api/v1/invoices/{id}/retry` | re-queue a **failed** invoice | 202 |

**Why these status codes?**
- **201 Created** = a new invoice was made. **200** = "you already sent this; here is the original" (a safe replay).
- **202 Accepted** for retry = "we accepted your request; the work happens in the background." We don't wait for the government.
- **409 Conflict** = duplicate invoice number. **422** = you reused an idempotency key with different data. **404** = not found (also used when it's another company's invoice — see E1).

The create flow follows the PDF's list exactly: authenticate the requester, validate the request, validate items, calculate/verify totals, detect duplicates, store, respond.

**Under the hood, each endpoint is small and delegates to the service:**
- **Create** returns `201` with a `Location` header for a new invoice, or `200` with `Idempotent-Replayed: true` for a safe repeat. Errors map from the database's own error names (`duplicate_invoice_number` → 409, `idempotency_key_reuse` → 422) via the repository's `translate()`.
- **List** uses **cursor (keyset) pagination**: it asks for `limit + 1` rows; if the extra row comes back there's a next page, and the `next_cursor` encodes `(created_at, id)`. Filters (`status`, exact `invoice_number`, `date_from/to`) are applied in SQL. This stays fast on millions of rows because it never uses `OFFSET`.
- **Get** returns the header + items + `processing` (the job and the full attempt log) in one query, filtered by `company_id` (404 for anyone else's — see E1).
- **Retry** returns `202` and re-queues, but *only* a `failed` invoice (the `retry_invoice` function refuses others with `invoice_not_retryable` → 409, under a row lock so two retries can't both win).

**Note:** there is intentionally **no delete/update endpoint** — invoices are immutable (see *Data lifecycle* above). The only mutation is a status change driven by the worker or a retry.

📁 Where to find it: handlers in `backend/src/api/invoice-api.ts`; rules + paging in `backend/src/services/invoice-service.ts`; SQL + error mapping in `backend/src/repositories/supabase-invoice-repository.ts`; thin routes in `frontend/src/app/api/v1/invoices/**/route.ts`.

---

## Part E — Authentication & security

Setup: Company A has User A, Company B has User B. Every request carries `Authorization: Bearer <token>` (a token proves who you are). Supabase issues and verifies the token; our backend then looks up which company that user belongs to.

### E1 — How do we stop User A from reading Company B's invoice by changing the ID in the URL?

First, how we know *who* is calling: every request carries `Authorization: Bearer <token>`. The authenticator parses it (`/^Bearer\s+(\S+)$/`), asks Supabase to verify it (`db.auth.getUser(token)` — a forged/expired token → **401**), then looks up which company that user belongs to (no company yet → **403**). The result is an `AuthContext { userId, companyId }` that the invoice code trusts.

Then, **two layers stop cross-company access:**

1. **Every query is filtered by the caller's company.** The detail lookup is `findById(companyId, invoiceId)` and the SQL filters on **both**:
   ```ts
   .from("invoices").select(...).eq("id", invoiceId).eq("company_id", companyId).maybeSingle()
   ```
   If the ID belongs to Company B, the row doesn't match `company_id = A`, so it returns `null` → the service throws `NotFoundError` → **404**. We deliberately return **404, not 403**, so we never reveal that the ID exists (403 would leak "this is real, just not yours").
2. **Row Level Security (RLS)** — a Postgres rule on every table. Example policy: `own_invoices ... using (company_id = (select my_company_id()))`, where `my_company_id()` reads the company of `auth.uid()`. So even a query that forgot the filter, or a direct database connection with a normal user role, can only ever see its own company's rows. Writes never happen through a plain user — they go through `SECURITY DEFINER` functions, and the server's service-role key is always used *with* an explicit `company_id` filter.

So editing the URL id does nothing: the backend won't return it (404), and the database wouldn't hand it over anyway (RLS).

📁 Where to find it: token + company resolution in `backend/src/auth/supabase-authenticator.ts`; the two-column filter in `backend/src/repositories/supabase-invoice-repository.ts` (`findById`) and the UUID/not-found guard in `backend/src/services/invoice-service.ts` (`get`); RLS policies (`own_company`, `own_user`, `own_invoices`, `own_items`, `own_logs`) and `my_company_id()` in `20260930000000_init.sql`, hardened in `..._0100_hardening.sql`.

### E2 — Where should DB passwords, JWT secrets, and external API credentials be stored?

- All secrets live in **`backend/.env`**, which is **git-ignored** (never committed). The frontend reuses that same file in local dev via `next.config.ts`, so secrets live in exactly one place.
- The **service-role key** (the all-powerful database key that bypasses RLS) is read **server-side only**, in `createBackend()` (`backend/src/index.ts`). It is never bundled into browser code.
- Only two values reach the browser, and only because they are *designed* to be public: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. In Next.js the `NEXT_PUBLIC_` prefix literally means "inline this into the client bundle," so **a real secret must never use that prefix.** (The anon key is safe to expose precisely because RLS limits what it can do.)
- The database URL comes in two forms, both server-side: `DATABASE_URL` (pooled, port **6543**, for the serverless app) and `DIRECT_URL` (direct, port **5432**, for migrations). JWT signing is handled by Supabase, so we don't hold a JWT secret ourselves; if we integrate a real email/government provider, its API key goes in `backend/.env` too — never in `NEXT_PUBLIC_`.

**What must never be in Git:** `.env` files, the service-role key, the database password/URL, any signing secret, and any external API credential. (`node_modules/` and build output are also ignored.)

📁 Where to find it: `backend/.env` (keys only); `frontend/next.config.ts` (loads `backend/.env`, exposes only `NEXT_PUBLIC_*`); service-role key read in `backend/src/index.ts` (`createBackend`); `.gitignore`.

### E3 — What security checks run before accepting an invoice?

Every `POST /api/invoices` passes through this ordered pipeline; each stage can reject:

1. **Body size cap** — the raw body is capped at 1 MB before parsing (`413` if larger), and must be valid JSON (`400` otherwise). Stops oversized/garbage payloads early.
2. **Valid token** — `Authorization: Bearer <token>` is parsed and verified by Supabase (`auth.getUser`); missing/expired → **401**.
3. **Known company** — the user must belong to a company; if not → **403**. Also gives us the `companyId` every later step is scoped to.
4. **Idempotency-Key present & well-formed** — required header, regex `^[A-Za-z0-9_\-:.]{8,128}$`; otherwise **400**.
5. **Strict schema validation (Zod `strictObject`)** — checks every field and **rejects unknown extra keys**: invoice number (≤50, uppercased), a *real* calendar date, customer name/tax-id lengths, a valid email, a real ISO-4217 currency, and 1–500 items each with positive quantity and non-negative price/tax. Failures return **400** with a per-field `details` list.
6. **Server-computed totals** — the server recalculates subtotal/tax/total from the items using exact BigInt cent math and **ignores** any totals the client sent; if the client's totals disagree, it's a **400**. The client can never dictate the stored amount.
7. **Database integrity (inside `create_invoice`)** — unique `(company_id, invoice_number)` and `(company_id, idempotency_key)`, the `ON CONFLICT` logic (→ 409 duplicate / 200 replay / 422 key reuse), plus `CHECK` constraints (`total = subtotal + tax`, non-negative amounts, email format) and the immutability triggers.
8. **RLS** — the final backstop: the row is written for the caller's company and only ever readable by that company.

Unexpected errors never leak internals — `respond()` turns anything that isn't an expected `AppError` into a safe generic **500**.

📁 Where to find it: body cap + safe-500 in `backend/src/api/http.ts`; token/company in `backend/src/auth/supabase-authenticator.ts`; key format in `backend/src/validation/idempotency-key.ts`; field rules in `backend/src/validation/create-invoice-schema.ts`; totals recompute in `backend/src/services/invoice-service.ts` (`assertClientTotalsMatch`) + `backend/src/domain/invoice-totals.ts`; constraints/triggers in `20260930000000_init.sql` and `..._0100_hardening.sql`.

---

## Team invitations (multiple users per company)

**Why:** a company is a business, and a business has more than one person. The `users` table already allows many users to share one `company_id`, and RLS scopes everything by company — so once two users share a company, they automatically see the same invoices. We added an onboarding path to actually *get* a second user into a company.

**How it works (email invitation — the standard approach):**
1. A user who already has a company opens **Invite a teammate**, enters an email → we create a **single-use, expiring** invite (a random token, valid 7 days) and "send" it.
2. The teammate opens the link (`/invite/<token>`), signs in, and the invite is **accepted** → their login is linked to the same company. The invite is then used up.
3. Both users now share the company and all its invoices — no extra work, because RLS already filters by `company_id`.

Sample exchange:
```http
# Owner (User A, in Company A) invites a teammate:
POST /api/invitations   { "email": "teammate@example.com" }   →  HTTP 201
{ "data": { "email": "teammate@example.com",
            "acceptUrl": "http://localhost:3000/invite/Xa8...base64url...",
            "expiresAt": "2026-10-07T..." } }

# Teammate (User B, brand-new account) opens the link and accepts:
POST /api/invitations/accept   { "token": "Xa8...base64url..." }   →  HTTP 200
{ "data": { "id": "<Company A id>", "name": "Company A", "tax_id": "..." } }
# → User B's row now has company_id = Company A. Both users see the same invoices.
```

**Guardrails (all verified against the live database):** only a user who already belongs to the company can invite (else `no_company`/403); a user who already has a company can't accept another (`already_in_company`/409); tokens are single-use (a used or unknown token → `invalid_or_expired_invite`/404) and expire after 7 days; a duplicate pending invite for the same email is refused (`invite_already_pending`); linking the user and marking the invite happen in one transaction.

**Email is behind an interface.** `EmailSender` has a **console/mock** implementation by default that logs the accept link (so the whole flow demos with no email service), and a real provider (Resend/SMTP) can be dropped in with a one-line change — the same dependency-injection pattern as the government client.

📁 Where to find it: migration `backend/supabase/migrations/20260930001000_invitations.sql` (table + `create_invitation`/`accept_invitation`/`list_invitations` RPCs); `backend/src/services/company-service.ts`; `backend/src/services/email/`; UI in `frontend/src/components/invite-teammate-modal.tsx`, `frontend/src/app/invite/[token]/page.tsx`, and the "Join with a code" tab in `frontend/src/app/setup/page.tsx`.

---

## Part F — Frontend

Built with Next.js + React. It has the three screens the PDF asks for.

- **Invoice Dashboard** — a table showing Invoice Number, Customer, Invoice Date, Amount, and Status, plus status-count cards you can click to filter. It searches by invoice number and loads more with a "load more" button. While any invoice is still `pending`/`processing`, the dashboard quietly triggers the worker and refreshes so you see progress live.
- **Create Invoice** — a form to enter invoice info, **add** and **remove** multiple line items, see live totals, submit, and see **validation errors** under each field.
- **Invoice Details** — shows the invoice info, its items, current status, and the processing/error history as a **timeline** (each attempt with its result). For a **failed** invoice, a **Retry** button appears.

The suggested statuses map directly to ours: `PENDING`, `PROCESSING`, `SUBMITTED`, `FAILED` (we also have `REJECTED` for invoices the government refused as invalid).

📁 Where to find it: `frontend/src/components/dashboard.tsx`, `create-invoice-modal.tsx`, `invoice-detail-modal.tsx`, `invoice-table.tsx`, `dashboard-stats.tsx`; timeline in `frontend/src/lib/timeline.ts`.

---

## Part G — External service integration

The government endpoint is `POST /government-api/invoices`. For this assessment it's **mocked** (simulated). Our mock randomly returns the four situations the PDF lists, so we can prove our handling works:

| Situation | HTTP | How Tubo reacts |
|---|---|---|
| Success | 200 | invoice → `submitted`, save the government reference |
| Temporary failure | 503 | keep the job, retry later with backoff |
| Invalid invoice | 400 | invoice → `rejected` (retrying won't help) |
| Timeout | no response | keep the job, retry later with backoff |

The mock also models the crash case (Part I): it remembers every invoice ID it accepted, so re-sending returns the **same** reference — never a duplicate.

**Why a mock behind an interface?** The worker depends on an interface (`GovernmentClient`), not a specific class. To use the real government API later, we write one class that implements the same interface and swap it in one line — no other code changes. This is **dependency injection**.

📁 Where to find it: interface in `backend/src/domain/government-client.ts`; mock in `backend/src/services/mock-government-client.ts`; the swap point in `backend/src/index.ts`.

---

## Part H — Asynchronous processing

**H1 — How to do it asynchronously?** We don't make the client wait for the government. Instead:

```
Client → Tubo API → Database (save invoice + job in one transaction) → return 201
                                   │
                       Worker (background) → Government API
```

The `submission_jobs` table is our **job queue**. A background **worker** picks up due jobs, sends them, and records the result. This is the **transactional outbox** pattern: the "to send" job is written in the same transaction as the invoice, so we can never have an invoice without a job.

**H2 — Accepting vs. submitting (they are different!):**

| | Accepting | Submitting |
|---|---|---|
| When | Instantly, when the API receives the request | Later, in the background |
| Meaning | "We validated and saved it" (status `pending`) | "The government processed it" (status `submitted`) |
| Who | Tubo API | The worker |
| If it fails | Client gets an error right away | Invoice stays queued and is retried |

Sample — the client's view when it creates an invoice (fast, does not wait for the government):
```http
POST /api/v1/invoices        Idempotency-Key: 8f2c...   →   HTTP 201 Created
{ "data": { "id": "7c9e6a1b-...", "status": "pending", "replayed": false } }
```
The status is `pending` immediately; the government call happens later in the worker.

**H3 — What if the government is down for 30 minutes?** We retry with **exponential backoff** (`2^(attempts-1)` seconds, capped at 5 minutes) for **15 attempts**, covering ~33 minutes — safely past 30. This is the real schedule the `complete_submission_attempt` function produces:

| Attempt | Wait before it | Elapsed |
|---|---|---|
| 1 | immediate | 0s |
| 2 | 1s | 1s |
| 3 | 2s | 3s |
| 4 | 4s | 7s |
| 5–9 | 8s…128s | ~4 min |
| 10 | 256s | ~8.5 min |
| 11–15 | 300s (5-min cap each) | **~33 min** |

The invoice stays `pending` while retrying; each attempt is a row in `processing_logs`. After 15 failures the job is `dead` and the invoice `failed` (a user can then retry manually for a fresh budget of 15).

📁 Where to find it: worker in `backend/src/services/submission-worker.ts`; the `next_attempt_at = now() + least(2^(attempts-1) s, 5 min)` backoff in `..._0500_complete_job.sql`; the 15-attempt window in `..._0600_robust_retry.sql`. See also [`DECISIONS.md` §H](./DECISIONS.md).

---

## Part I — Critical failure scenario

**The situation:** the government accepts INV-10001, then Tubo crashes *before* recording success. Tubo restarts and sees the invoice as unfinished.

**I1 — What should happen next?** The worker safely retries:
1. The job's lock (`locked_until`) expired while the server was down, so the worker can re-claim it.
2. It sends the **same invoice ID** to the government again.
3. The government recognizes the ID and returns the **same reference** it gave before.
4. The worker records success; the invoice becomes `submitted`. **No duplicate, nothing lost.**

**I2 — How do we prevent a duplicate submission?** We use the invoice's **database ID** as a stable key that never changes across retries or crashes. The government dedupes on it: same ID = same invoice. Concretely, our mock government client keeps a map of accepted IDs, so a resend returns the *same* reference:
```
Attempt A (before crash):  submit(invoiceId=7c9e...) → { success, externalRef: "GOV-1790-ab12" }
   💥 Tubo crashes before saving that result
Attempt B (after restart): submit(invoiceId=7c9e...) → { success, externalRef: "GOV-1790-ab12" }  ← SAME ref
```
So Tubo records `GOV-1790-ab12` once; the government has exactly one invoice, not two.

**I3 — Idempotency here.** Idempotency = doing it many times = doing it once. Tubo uses it at **two points**:
- **Client → Tubo:** the `Idempotency-Key` header, so a retried create doesn't make a second invoice.
- **Tubo → Government:** the invoice ID, so a retried send doesn't make a second government record.

Each place where a crash could cause a retry has its own idempotency key.

📁 Where to find it: dedupe map in `backend/src/services/mock-government-client.ts`; re-claim of expired jobs in `claim_submission_jobs` (`..._0700_...`). See also [`DECISIONS.md` §I](./DECISIONS.md).

---

## Part J — Concurrency problem

The PDF shows check-then-create code and asks six questions.

1. **Is it safe?** No. It has a **race condition** (also called TOCTOU — Time Of Check vs Time Of Use).
2. **What could happen?** Two duplicate invoices with the same number get created.
3. **Why can both pass the check?** The check (`findOne`) and the action (`create`) are two separate steps. Between them, the other request also checks and also sees "nothing there," so both create.
4. **How to fix it?** Don't check-then-create. Insert directly and let a **unique constraint** decide, using `ON CONFLICT`:
   ```sql
   insert into invoices (company_id, invoice_number, ...) values (...)
   on conflict (company_id, invoice_number) do nothing;
   ```
5. **Is application-level validation enough?** No. There's always a gap between an app check and the write, and app locks don't work across multiple servers. Only the database can guarantee it.
6. **What database mechanism?** A **unique constraint** plus **`ON CONFLICT`** (for creates), and **`FOR UPDATE SKIP LOCKED`** (so two workers never grab the same job).

📁 Where to find it: `on conflict` in the `create_invoice` function (`..._0300_...`); `for update skip locked` in `claim_submission_jobs` (`..._init.sql`, `..._0700_...`). See also [`DECISIONS.md` §J](./DECISIONS.md).

---

## Part K — Scalability

From 10,000/day to 1,000,000/day (~12/second average, higher in spikes).

**K1 — How the architecture changes.** Scale every layer: a **load balancer** in front of **several stateless API servers**; the **database** gets read replicas (writes to the primary, reads from replicas); **more workers** running as their own processes; a **shared rate limiter** (e.g. Redis); **caching** for dashboards; centralized **logging and monitoring**. Our design already supports this because the API is stateless and workers coordinate through the database (`SKIP LOCKED`), so adding more of them needs no code changes.

**K2 — 100,000 invoices in 10 minutes but the government allows only 100/second.** We use a **token-bucket rate limiter**: a bucket holds 100 tokens and refills 100/second; each send spends one token; when empty, workers wait. So no matter how many workers run, total sends stay at 100/second. (100k at 100/s ≈ 17 minutes — within our retry budget.)

**K3 — Process everything at once?** No. All at once would overwhelm the government API and our memory, and one failure would take everything down. Instead: each worker claims a **small bounded batch** (5 jobs), processes them, then claims the next batch — steady and safe.

📁 Where to find it: rate limiter in `backend/src/services/token-bucket-rate-limiter.ts` (interface `backend/src/domain/rate-limiter.ts`); bounded batch in `backend/src/services/submission-worker.ts` (`batchSize`). See also [`DECISIONS.md` §K](./DECISIONS.md).

---

## Part L — Failure & retry design

INV-20001 failed three times. We must be able to see: when each attempt started/ended, the attempt number, the HTTP response, the error, and the status.

We store **one row per attempt** in `processing_logs` (append-only) — we never overwrite. Each row records `attempt_no`, `outcome`, `http_status`, `error`, `duration_ms`, and `created_at`. The current summary (attempt count, last error, next retry) also lives on `submission_jobs`.

**L1 — Overwrite the previous error each time?** No. We keep every attempt as its own row. Overwriting would hide the *pattern* — was it the same error every time (government down) or different each time (our data is wrong)? Only the full history answers that. `submission_jobs.last_error` keeps the latest error for quick display in the UI, but that's *in addition to* the full log, never instead of it.

**L2 — How does a support engineer investigate a 3-day-old failure?** Three queries, with the kind of output they'd actually see:

**Step 1 — find the invoice:**
```sql
select id, invoice_number, status, created_at
  from invoices where invoice_number = 'INV-20001';
```
```
                  id                  | invoice_number | status |       created_at
--------------------------------------+----------------+--------+------------------------
 7c9e6a1b-...-4f2a-...-a1b2c3d4e5f6   | INV-20001      | failed | 2026-09-27 09:59:58+00
```

**Step 2 — check the job (current state + why it stopped):**
```sql
select status, attempts, max_attempts, last_error, next_attempt_at
  from submission_jobs where invoice_id = '7c9e6a1b-...';
```
```
 status | attempts | max_attempts |            last_error            | next_attempt_at
--------+----------+--------------+----------------------------------+-----------------
 dead   |    3     |      15      | Service temporarily unavailable  |  (null)
```
> `dead` + `attempts < max_attempts` here means it was retried and then manually stopped/seeded; in normal life a `dead` job has `attempts = max_attempts`. `last_error` is the most recent message; the full story is in step 3.

**Step 3 — read the full attempt history (the key one):**
```sql
select attempt_no, outcome, http_status, error, duration_ms, created_at
  from processing_logs where invoice_id = '7c9e6a1b-...'
 order by attempt_no;
```
```
 attempt_no |     outcome      | http_status |             error              | duration_ms |       created_at
------------+------------------+-------------+--------------------------------+-------------+------------------------
     1      | retryable_error  |     503     | Service temporarily unavailable|    812      | 2026-09-27 10:00:00+00
     2      | timeout          |    (null)   | No response within 30 seconds  |   30000     | 2026-09-27 10:00:31+00
     3      | retryable_error  |     503     | Service temporarily unavailable|    777      | 2026-09-27 10:00:34+00
```

**What the engineer concludes from that output:**
- All three are `503`/timeout, not `400` → the government service was **down/slow**, our invoice data is fine → safe to retry once it recovers.
- The `created_at` gaps (10:00:00 → 10:00:31 → 10:00:34) show the **exponential backoff** working.
- Attempt 2's `duration_ms = 30000` shows it was a real **timeout**, not an instant reject.

**In the UI**, `buildTimeline()` turns those same `processing_logs` into a visual timeline in the invoice detail modal, so the engineer usually doesn't need SQL at all:
```
📩  Invoice received                              Sep 27, 09:59
⚠️  Attempt 1 — 503 Service unavailable (0.8s)    Sep 27, 10:00
⚠️  Attempt 2 — Timeout (30s)                     Sep 27, 10:00
⚠️  Attempt 3 — 503 Service unavailable (0.8s)    Sep 27, 10:00
❌  Delivery failed after 3 attempts               Sep 27, 10:00
```

📁 Where to find it: `processing_logs` table in `20260930000000_init.sql`; each attempt written by `complete_submission_attempt` in `..._0500_complete_job.sql`; UI timeline in `frontend/src/lib/timeline.ts`. See also [`DECISIONS.md` §L](./DECISIONS.md).

---

## Part M — API versioning

A big customer needs new fields, but existing customers must not break.

**Strategy: URL-based versions.** Old customers keep `POST /api/v1/invoices` (unchanged forever). The new customer uses `POST /api/v2/invoices`, which accepts extra **optional** fields (`due_date`, `notes`, `payment_terms`, `billing_address`). Because the new fields are optional, any valid v1 request is also valid on v2, so customers migrate at their own pace.

In code, `InvoiceApiV2` **extends** `InvoiceApi` and overrides only `createInvoice` (to use the v2 schema). List, get, retry, and summary are inherited — no duplication. Both versions share one service and one database.

Sample — the same old payload still works on both, and v2 accepts more:
```http
POST /api/v1/invoices   { invoice_number, invoice_date, customer_name, ... , items }   → 201 ✅
POST /api/v2/invoices   { ...same v1 fields..., "due_date":"2026-10-30",
                          "payment_terms":"Net 30", "notes":"Thanks" }                 → 201 ✅
POST /api/v2/invoices   { ...only v1 fields, no new ones... }                          → 201 ✅ (still valid)
```
Because every new v2 field is optional, a v1 customer's exact request is a valid v2 request — so nobody's integration breaks and each customer migrates when ready.

**Is URL-path versioning "the standard"?** It's **one of the three accepted industry standards** — and the most common and readable:

| Approach | Example | Who uses it | Trade-off |
|---|---|---|---|
| **URL path** (ours) | `/api/v2/invoices` | GitHub (`/v3`), Twitter, early Stripe | Obvious, easy to test/route/cache. Version is visible in the URL. |
| **Header / media type** | `Accept: application/vnd.tubo.v2+json` | GitHub (newer) | Cleaner URLs, but harder to test and debug. |
| **Date-based** | `Tubo-Version: 2026-01-01` | Stripe (today) | Best for *many* tiny changes; more machinery to maintain. |

We chose **URL path** because it's the simplest to understand, test, and demo, and the change here (a few optional fields) is small — a full date-based scheme would be over-engineering. What makes it *production-grade* is the **lifecycle around it**, which is standard company protocol:
1. **Deploy v2 beside v1** — both live, nothing changes for v1 users.
2. **Announce** v2 and document the new fields.
3. **Deprecation window** — add a `Deprecation` + `Sunset` header to v1 responses and give a clear support window (e.g. 6–12 months).
4. **Monitor** v1 usage; only **retire** v1 once traffic reaches zero.

📁 Where to find it: `backend/src/api/invoice-api-v2.ts` (extends v1), `backend/src/validation/create-invoice-v2-schema.ts` (v1 + optional fields), routes in `frontend/src/app/api/v2/invoices/**`. See also [`DECISIONS.md` §M](./DECISIONS.md).

---

## Part N — Debugging scenario

Metrics: CPU 35%, Memory 55%, DB CPU 20%, API latency normal, **queue waiting jobs 150,000**, workers 5, government API normal. Invoices take hours.

1. **Where to look first?** Worker throughput. Everything else is healthy; the queue is huge. The bottleneck is that 5 workers can't drain 150,000 jobs fast enough.
2. **What the metrics suggest.** Lots of spare capacity (low CPU/DB), the API and government are fine — we're simply **under-provisioned on workers**.
3. **Extra metrics to check.** Jobs processed per minute, average time per job, queue growth rate, worker idle time, rate-limiter wait time, retry/error rate, DB connection-pool usage.
4. **Changes to improve throughput.** Add more workers (biggest win), increase batch size, run workers as a dedicated process, later a dedicated queue.
5. **Prevent overloading something else when adding workers.** The **shared rate limiter** keeps total government requests at 100/second no matter how many workers run; **bounded batches** and **`SKIP LOCKED`** protect the database; **connection pooling** prevents "too many connections."

**The math, concretely:** if each submission takes ~1s and 5 workers each process a batch of 5, that's ~25 in flight ≈ 25/s. Draining 150,000 at 25/s ≈ **100 minutes** — hence "hours." The government allows 100/s, so we have 4× headroom on *that* side; the fix is more workers, not a faster government. Going to ~20 workers → ~100/s → 150,000 drains in ~25 min, and the rate limiter still caps the government at 100/s so we can't overshoot it.

📁 Where to find it: `batchSize` and rate-limiter call in `backend/src/services/submission-worker.ts`. See also [`DECISIONS.md` §N](./DECISIONS.md).

---

## Part O — Code quality (what we actually did, concretely)

The PDF lists nine quality areas. Here is exactly what we did for each, and how it makes the code efficient and easy to change.

**1. Project structure — one folder per responsibility.**
`backend/src/` is split into `domain/` (types, errors, money math), `validation/` (input schemas), `services/` (business rules + worker), `repositories/` (the *only* code that touches the database), `auth/`, and `api/` (HTTP in/out). A new reader finds any piece of logic in seconds because each folder has one job. Everything is wired together in one place — the composition root `backend/src/index.ts` — so you can see the whole system's dependencies at a glance.

**2. Naming — the file name tells you what it does.**
`submission-worker.ts`, `token-bucket-rate-limiter.ts`, `supabase-invoice-repository.ts`. No `utils.ts` grab-bags, no clever abbreviations.

**3. Separation of concerns — layers talk through interfaces, not concretions.**
The API layer knows nothing about SQL; the service layer knows nothing about HTTP; only repositories touch the database. Each boundary is a TypeScript **interface** (`GovernmentClient`, `RateLimiter`, `InvoiceRepository`, `CompanyRepository`, `Authenticator`, `EmailSender`). This is dependency injection: in production we inject the real class, in tests we inject a fake — the code under test never changes. Example: the worker takes a `GovernmentClient` in its constructor, so tests pass a spy and production passes the mock, with zero edits to the worker.

**4. Error handling — typed errors that map to HTTP once, in one place.**
Every expected failure is an `AppError` subclass (`ValidationError` 400, `UnauthorizedError` 401, `ForbiddenError` 403, `NotFoundError` 404, `ConflictError` 409, `UnprocessableError` 422). A single `respond()` wrapper turns them into JSON and turns *anything unexpected* into a safe generic 500 (no stack traces leak). The database's short error names are translated to these types in one method (`translate()` in the invoice repository), so error handling isn't scattered.

**5. Input validation — strict schemas, at the edge, with clear messages.**
Zod `strictObject` schemas validate every request and **reject unknown fields**. Messages are per-field and human ("Enter a real date (YYYY-MM-DD)") so the frontend shows them directly under the input. Validation happens once, at the boundary, before any business logic runs.

**6. Reusable code — shared between frontend and backend, never duplicated.**
The money calculator (`InvoiceTotalsCalculator`) and the create-invoice schema are exported from `@tubo/backend/shared` and imported by *both* the backend and the browser form. So the form's live totals and the server's authoritative totals use the **same** code and can never disagree. DRY where it matters, not abstraction for its own sake.

**7. Database design — integrity enforced by the database, not hoped for in code.**
Unique constraints, `CHECK`s (`total = subtotal + tax`), foreign keys with `on delete cascade`, immutability triggers, indexes on every queried column, and RLS on every table. The database is the last line of defense, so a bug in application code still can't corrupt data.

**8. Security practices.**
RLS on all tables; the service-role key is server-side only; secrets live in git-ignored `.env`; 404-not-403 for cross-company access; all writes go through `SECURITY DEFINER` functions. (See Part E.)

**9. Git usage.**
Small, described commits with clear messages; secrets never committed (`.gitignore`); work checkpointed and pushed.

**Efficiency specifically (why it's not just clean but fast):**
- **No N+1 queries** — a list is one query; the invoice detail loads header + items + job + logs in a single joined select; status counts are one grouped query.
- **Keyset (cursor) pagination**, not `OFFSET` — stays fast on millions of rows.
- **Indexes** match the real access patterns: `(company_id, created_at desc)` for the list, `(company_id, status)` for filters, a partial index on due jobs for the worker.
- **Bounded worker** — claims a small batch with `FOR UPDATE SKIP LOCKED`, so many workers scale without stepping on each other, and a rate limiter caps external calls.
- **Exact money math** with BigInt cents — no floating-point drift, no rounding bugs.
- **Erasable TypeScript** (no enums / no constructor parameter-properties, `.ts` import paths) so Node runs the backend directly with no build step.
- **Tested at every layer** — 115 backend + 55 frontend unit tests *and* a live-database test that proved concurrency, idempotency, RLS, and backoff against real Postgres.

📁 Where to find it: layers under `backend/src/`; DI wiring in `backend/src/index.ts`; shared code via `backend/src/shared.ts`; error mapping in `backend/src/api/http.ts` + `backend/src/domain/errors.ts`; indexes/constraints in `backend/supabase/migrations/`.

---

## Part P — README

The `README.md` at `projects/tubo/README.md` contains: **Setup** (frontend, backend, database), **Architecture** (structure, database design, processing flow, auth), **Assumptions**, and **Production Improvements** — exactly the sections the PDF requests.

📁 Where to find it: `projects/tubo/README.md`.

---

## Part Q — Technical discussion prep

Short, confident answers I can back up by pointing at code.

**Q1 — Why this architecture?** Layered/hexagonal: each layer has one job and talks to the next through an interface. That makes it easy to test (swap in fakes), easy to read (logic is where you'd expect), and easy to change (swap the mock government client for the real one in one line). *Point to:* `backend/src/index.ts`.

**Q2 — Weakest part?** The worker is triggered by the frontend polling `POST /api/worker`, which is fine for a demo but not for production. A dedicated worker process or cron would be more reliable. *Point to:* `frontend/src/components/dashboard.tsx` polling; noted in README assumptions.

**Q3 — With two more days?** Move the worker to a standalone process, add live migration tests in CI, add a real distributed (Redis) rate limiter, and add end-to-end tests.

**Q4 — Database unavailable?** Creates fail loudly with a 5xx (we don't pretend success), so nothing is silently lost. When the DB comes back, queued jobs are still there and the worker resumes. Nothing was half-written because every write is in a transaction.

**Q5 — Worker crashes?** Its jobs have a lease (`locked_until`). When the lease expires, another worker re-claims them via `SKIP LOCKED`. No job is stuck, no duplicate is sent (the invoice ID dedupes on the government side). *Point to:* `claim_submission_jobs` in `..._0700_...`.

**Q6 — Prevent duplicate processing?** Three things: outbox in one transaction, lease-based locking so only one worker holds a job, and idempotent submission (stable invoice ID). *Point to:* `create_invoice`, `claim_submission_jobs`, `mock-government-client.ts`.

**Q7 — Scale workers?** Just run more of them. They coordinate through the database with `SKIP LOCKED`, and the shared rate limiter keeps the government within 100/second. No code change needed.

**Q8 — Protect one company from another?** Every query is filtered by `company_id`, RLS enforces it at the database, and we return 404 (not 403) for other companies' IDs so we don't leak which IDs exist. *Point to:* `supabase-authenticator.ts`, RLS policies.

**Q9 — Monitor in production?** Watch queue depth, jobs/minute, error/retry rate, government latency, and DB connections; alert when queue depth grows or error rate spikes. Centralized logging so all servers' logs are searchable in one place.

**Q10 — Deploy without interrupting processing?** Blue-green (or rolling) deploys: bring up new servers, shift traffic, retire old ones. Because the API is stateless and jobs live in the database, in-flight work is never lost — a leased job is simply re-claimed after the old worker stops. Run database migrations as a separate, backward-compatible step.

---

# API Reference

*(PDF Submission Requirement #4 — API documentation.)*

Human-readable reference for every endpoint. Each one says what it does, why its status code, and which file implements it.

## Basics

- **Base URL (local):** `http://localhost:3000`
- **Auth:** every endpoint needs a header `Authorization: Bearer <Supabase access token>`. The token comes from signing in with Supabase. Without it → **401 Unauthorized**.
- **Content type:** requests and responses are JSON. Successful bodies are wrapped as `{ "data": ... }`.
- **Versions:** invoice endpoints exist as **v1** (`/api/v1/...`) and **v2** (`/api/v2/...`). v2 is identical to v1 except `create` accepts extra optional fields. Old customers stay on v1 forever.

### Error shape

All errors look like this, so the frontend can show them the same way:

```json
{ "error": { "code": "duplicate_invoice_number", "message": "…", "details": [ … ] } }
```

| Status | Meaning | When |
|---|---|---|
| 400 | Bad request | The body/query failed validation (`details` lists each field) |
| 401 | Unauthorized | Missing/expired token |
| 403 | Forbidden | Signed in but no company set up yet |
| 404 | Not found | Unknown id — **also** used for another company's invoice (we don't reveal it exists) |
| 409 | Conflict | Duplicate invoice number, or invoice not in a retryable state |
| 422 | Unprocessable | Reused an `Idempotency-Key` with different invoice data |
| 500 | Server error | Something unexpected (e.g. database down) |

📁 Error → HTTP mapping: `backend/src/api/http.ts`; error types: `backend/src/domain/errors.ts`.

## Account & company

### `GET /api/me`
Who am I, and which company do I belong to (company is `null` until set up).
- **Why:** the frontend calls this first to decide whether to show the dashboard or send the user to the company-setup page.
- **Success:** `200` → `{ "data": { "user": {...}, "company": {...} | null } }`

📁 `backend/src/api/company-api.ts` (`getMe`) · route `frontend/src/app/api/me/route.ts`

### `POST /api/company`
Create the signed-in user's company (only if they don't have one yet).
- **Body:** `{ "name": "ABC Corporation", "tax_id": "123-456-789-000" }`
- **Why 201:** a new company was created.
- **Errors:** 400 invalid, 409 if already registered / tax ID taken.

📁 `backend/src/api/company-api.ts` (`registerCompany`) · route `frontend/src/app/api/company/route.ts`

## Invoices (v1)

All paths below also exist under `/api/v2/...` with the same behavior, except **create** (see [Invoices v2](#invoices-v2--whats-different)).

### `POST /api/v1/invoices` — Create invoice
Validate, compute totals, detect duplicates, save the invoice + its send-job, and return.
- **Required header:** `Idempotency-Key: <8–128 chars>` — a unique id you generate per create attempt. Sending the same key again safely returns the original invoice instead of making a new one.
- **Body (v1):**
  ```json
  {
    "invoice_number": "INV-10001",
    "invoice_date": "2026-09-30",
    "customer_name": "Juan Dela Cruz",
    "customer_tax_id": "123-456-789-000",
    "customer_email": "juan@example.com",
    "currency": "PHP",
    "items": [
      { "description": "Consulting", "quantity": "2", "unit_price": "1500.00", "tax": "360.00" }
    ]
  }
  ```
  You *may* also send `subtotal`, `tax_amount`, `total_amount`, but the server recomputes them and rejects yours if they disagree. **The server's totals always win.**
- **Success:**
  - `201 Created` (+ `Location: /api/invoices/{id}`) — a new invoice was created.
  - `200 OK` (+ `Idempotent-Replayed: true`) — you'd already sent this exact request; here is the original.
- **Why two codes:** 201 means "made something new," 200-replay means "nothing new made, safe repeat." This is how retries stay safe.
- **Errors:** 400 invalid, 401, 409 duplicate invoice number, 422 idempotency key reused with different data.

📁 `backend/src/api/invoice-api.ts` (`createInvoice`) · validation `backend/src/validation/create-invoice-schema.ts` · route `frontend/src/app/api/v1/invoices/route.ts`

### `GET /api/v1/invoices` — List invoices
Return a page of the company's invoices, newest first.
- **Query params:**

  | Param | Meaning |
  |---|---|
  | `status` | one of `pending`, `processing`, `submitted`, `rejected`, `failed` |
  | `invoice_number` | exact match |
  | `date_from`, `date_to` | inclusive range on invoice date (`YYYY-MM-DD`) |
  | `limit` | 1–100, default 20 |
  | `cursor` | pass the previous response's `next_cursor` to get the next page |

- **Success:** `200` → `{ "data": [ …invoices… ], "next_cursor": "…" | null }`
- **Why cursor paging (not page numbers):** it stays fast on millions of rows and doesn't skip/repeat items when new invoices arrive. Cost: no "jump to page 7."
- **Errors:** 400 bad filter (e.g. `date_from` after `date_to`), 401.

📁 `backend/src/api/invoice-api.ts` (`listInvoices`) · query rules `backend/src/validation/list-invoices-query.ts`

### `GET /api/v1/invoices/summary` — Status counts
How many invoices are in each status (for the dashboard cards).
- **Success:** `200` → `{ "data": { "pending": 3, "processing": 1, "submitted": 40, "rejected": 2, "failed": 1, "total": 47 } }`
- **Why:** one small query powers all the count cards instead of counting on the client.

📁 `backend/src/api/invoice-api.ts` (`getSummary`)

### `GET /api/v1/invoices/{id}` — Get one invoice
Header + items + processing information (the job and every attempt).
- **Success:** `200` → `{ "data": { …header…, "items": [...], "processing": { "job": {...}, "attempts": [...] } } }`
- **Why 404 for another company's id:** we return "not found" rather than "forbidden" so we don't reveal which invoice IDs exist.
- **Errors:** 401, 404.

📁 `backend/src/api/invoice-api.ts` (`getInvoice`)

### `POST /api/v1/invoices/{id}/retry` — Retry a failed invoice
Re-queue an invoice that has **failed** so the worker tries again.
- **Success:** `202 Accepted` → `{ "data": { "id": "…", "status": "pending" } }`
- **Why 202:** we accepted the request; the actual re-send happens in the background.
- **Rules:** only a `failed` invoice can be retried (a `rejected` one is invalid — retrying can't fix it; `pending`/`processing` are already being retried automatically). It grants a fresh budget of 15 more attempts.
- **Errors:** 401, 404, 409 not retryable.

📁 `backend/src/api/invoice-api.ts` (`retryInvoice`) · DB rule `retry_invoice` in `backend/supabase/migrations/20260930000600_robust_retry.sql`

## Invoices (v2) — what's different

v2 lives at `/api/v2/invoices...` and behaves **exactly** like v1 for list, get, summary, and retry. The only difference is **create** accepts extra optional fields:

```json
{
  "...": "all the v1 fields",
  "due_date": "2026-10-30",
  "notes": "Thanks for your business",
  "payment_terms": "Net 30",
  "billing_address": { "line1": "…", "city": "…", "postal_code": "…", "country": "…" }
}
```

All new fields are optional, so any valid v1 body also works on v2. This lets existing customers migrate whenever they want.

📁 `backend/src/api/invoice-api-v2.ts` (extends v1, overrides only `createInvoice`) · schema `backend/src/validation/create-invoice-v2-schema.ts` · routes `frontend/src/app/api/v2/invoices/**`

## Worker trigger (internal)

### `POST /api/worker`
Runs one round of the background worker: claim up to a few due jobs, send them to the (mock) government service, record results.
- **Success:** `200` → `{ "processed": <number of jobs handled> }`
- **Why it exists:** in this Next.js + Supabase setup the dashboard calls this every few seconds while invoices are in flight, so you see progress live. In production this would be a dedicated worker process or cron job instead.

📁 `backend/src/services/submission-worker.ts` (`tick`) · route `frontend/src/app/api/worker/route.ts`

---

# Architecture

*(PDF Submission Requirement #5 — architecture diagram.)*

Three diagrams that explain how Tubo is built and how an invoice flows through it.

## 1. The layers (who talks to whom)

Tubo uses a **layered / hexagonal** design: each layer has one job and talks to the next through an **interface**. Interfaces mean we can swap the real database or government client for a fake one in tests, with no other change.

```
   Browser (React)
        │  Authorization: Bearer <token>
        ▼
┌───────────────────────────────────────────────┐
│  Next.js API routes  (frontend/src/app/api)    │  ← thin: 3–8 lines each, just call the backend
└───────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────┐
│  API layer        (backend/src/api)            │  ← Request in, Response out; maps errors to HTTP
├───────────────────────────────────────────────┤
│  Auth             (backend/src/auth)           │  ← verify token, find the caller's company
├───────────────────────────────────────────────┤
│  Services         (backend/src/services)       │  ← business rules, worker, rate limiter
├───────────────────────────────────────────────┤
│  Repositories     (backend/src/repositories)   │  ← the ONLY code that talks to the database
├───────────────────────────────────────────────┤
│  Domain + Validation (backend/src/domain,      │  ← types, errors, money math, input schemas
│                        backend/src/validation) │
└───────────────────────────────────────────────┘
        │
        ▼
   Supabase (PostgreSQL + Auth + Row Level Security)
```

Everything is wired together in one place — the **composition root** — at `backend/src/index.ts`. That's where the concrete database client, the mock government client, and the rate limiter are injected.

**External dependencies behind interfaces (swappable):**

| Interface | Real class | Test / dev double |
|---|---|---|
| `GovernmentClient` | `MockGovernmentClient` (assessment allows a mock) | `SpyGovernmentClient` in tests |
| `RateLimiter` | `TokenBucketRateLimiter` | `NoOpRateLimiter` |
| `InvoiceRepository` | `SupabaseInvoiceRepository` | in-memory repo in tests |
| `Authenticator` | `SupabaseAuthenticator` | fake authenticator in tests |

## 2. How an invoice flows (accept now, send later)

The API does **not** wait for the government. It accepts the invoice, saves it with a send-job in one transaction, and returns immediately. A background worker does the sending.

```
① CREATE
Client ──POST /api/invoices (+ Idempotency-Key)──► API
                                                    │ validate, recompute totals, check duplicates
                                                    ▼
                                        ┌─────────────────────────────┐
                                        │  ONE database transaction    │
                                        │  • insert invoice (pending)  │
                                        │  • insert invoice_items      │
                                        │  • insert submission_job     │   ← the "outbox"
                                        └─────────────────────────────┘
                                                    │
Client ◄────────── 201 Created (status: pending) ──┘   (does NOT wait for the government)


② SEND (background, repeats)
Worker ──claim due jobs (FOR UPDATE SKIP LOCKED, sets invoice→processing)──► DB
   │
   ├─ rate limiter: wait for a token (max 100/sec to the government)
   │
   └─ government.submitInvoice(invoiceId, …)
            │
            ├─ 200 success  → invoice: submitted, job: done, save external_ref
            ├─ 400 rejected → invoice: rejected, job: done  (retrying won't help)
            ├─ 503 error    → keep job, schedule retry with backoff
            └─ timeout      → keep job, schedule retry with backoff

   After 15 failed attempts → invoice: failed, job: dead  (user can retry from the UI)
```

**Why this shape:** the government can be slow or down. If the client had to wait, they'd get timeouts for something that isn't their fault. Accept-now/send-later keeps the client fast and lets us retry safely in the background.

Retry timing is **exponential backoff** (1s, 2s, 4s, … capped at 5 min), 15 attempts ≈ 33 minutes — past the 30-minute outage the PDF asks about.

📁 Create: `create_invoice` in `backend/supabase/migrations/20260930000000_init.sql` (+ `..._0300_...`). Worker: `backend/src/services/submission-worker.ts`. Backoff: `..._0500_complete_job.sql`. Claim: `..._0700_...`.

## 3. The two idempotency boundaries (why nothing duplicates)

There are exactly two places a crash or a dropped network could cause a retry. Each has its own key so retries are safe.

```
          Idempotency-Key header                 stable invoice ID
Client ───────────────────────► Tubo ───────────────────────────► Government
        (protects THIS gap:              (protects THIS gap:
         create request sent twice)       send request sent twice
                                           after a crash)
```

- **Client → Tubo:** the `Idempotency-Key` + a unique `(company_id, idempotency_key)` constraint. Same key = return the original invoice, never a second one.
- **Tubo → Government:** the invoice's database ID, which never changes. The government recognizes it and returns the same reference, never a second record.

Together with the **transactional outbox** (invoice + job saved together) and **lease-based locking** (a crashed worker's job is re-claimed after its lock expires), this is what guarantees: **an invoice is never lost and never duplicated.**

📁 Client key: `backend/src/validation/idempotency-key.ts` + `request-hash.ts`. Government key: `backend/src/services/mock-government-client.ts`. Lease: `claim_submission_jobs`.

## Database at a glance

```
 companies ──< users            (one company, many logins)
 companies ──< invoices         (one company, many invoices)
 invoices  ──< invoice_items    (one invoice, many line items)
 invoices  ──1 submission_jobs  (one invoice, one send-job)      ← the outbox
 invoices  ──< processing_logs  (one invoice, many attempt logs) ← append-only history
```

Every table has **Row Level Security**: a signed-in user can only read rows for their own company. All writes go through the server (service-role key) and secure database functions. Full field-by-field explanation is in [Part C](#part-c--database-design) above.

---

*End of answers. Deeper design notes: [`DECISIONS.md`](./DECISIONS.md). Setup and production notes: [`../README.md`](../README.md).*
