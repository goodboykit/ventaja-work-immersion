# Tubo project rules (Ventaja work immersion)

## Goal
Tubo is an invoicing platform: validate and store invoices, then submit them to an external government service. Invoices must never be lost or duplicated. Stack: Next.js + Supabase.

## Code standards
- **OOP**: single-responsibility classes, constructor dependency injection, interfaces for external services (real and mock government client interchangeable), encapsulated state. Do not over-abstract.
- **Structure**: one folder per responsibility (see projects/tubo layout); database access only in repositories.
- **Easy to understand**: simple, predictable structure. Descriptive names (a file's name says what it does), shallow folders, small focused files and functions, plain language. Prefer the obvious solution over a clever one. A new reader should find any piece of logic in seconds.
- **Efficiency**: index queried columns, no N+1 queries, batch work, bounded worker claims, pooled connections (port 6543 for serverless, 5432 for migrations/worker).
- **Integrity**: idempotency keys, transactional outbox, retries with backoff, stable key to the external service.
- **Security**: RLS on every table, secrets only in .env.local (never read or commit), service-role key server-side only.

## Folder layout (projects/tubo)
- npm workspaces at `projects/tubo` (run `npm install` there). `backend/` is the package `@tubo/backend`; `frontend/` imports it.
- `backend/` — all business logic (`src/`: domain, validation, services, repositories, auth, api), migrations (`supabase/migrations`), scripts, tests. Secrets live in `backend/.env`. Run backend commands from that folder (`npm test`, `npx tsc --noEmit`).
- `frontend/` — the Next.js app. Its `src/app/api/**/route.ts` files stay thin and call the backend. `next.config.ts` loads `backend/.env` in local dev so secrets live in one place; never use a `NEXT_PUBLIC_` name for a secret.
- Decisions and the API reference: `projects/tubo/docs/DECISIONS.md`.
- Backend TypeScript must stay erasable (no enums or constructor parameter properties) and use `.ts` import extensions, so Node can run it directly.

## Testing rules (database and backend)
- Every database or backend change must be tested, and ALL tests must pass before reporting it done.
- Test migrations and concurrency against the real database using throwaway data (unique TEST-prefixed rows), then DELETE the test data and the temporary test script afterwards. Confirm nothing is left behind.
- A failing test is a finding: fix the cause, re-run until clean (repeat flaky/concurrency tests several times).

## Working rules
- Do not apply migrations to the live Supabase project until the structure is approved.
- Explain each step and why, in plain beginner-friendly language.
- Present output in a structured way (headings, tables, short lists).
- Record important decisions in projects/tubo/docs/DECISIONS.md.
