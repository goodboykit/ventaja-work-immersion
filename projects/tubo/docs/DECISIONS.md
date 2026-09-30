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
