-- Tubo schema (DRAFT - not applied to any database yet).
-- Integrity model: invoice + items + submission job are created in ONE transaction
-- (transactional outbox). A worker claims jobs with SKIP LOCKED and retries with backoff.
-- The government service is called with a stable key (invoice id) so retries cannot duplicate.

create type invoice_status as enum ('pending', 'processing', 'submitted', 'rejected', 'failed');
create type job_status     as enum ('queued', 'processing', 'done', 'dead');

-- Seller / company
create table companies (
  id     uuid primary key default gen_random_uuid(),
  name   text not null check (length(name) between 1 and 200),
  tax_id text not null unique
);

-- Users: login identity and password live in Supabase auth.users; this row links a login to ONE company.
-- Many users can belong to the same company.
create table users (
  id         uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references companies(id)
);
create index on users (company_id);

-- Invoice header
create table invoices (
  id               uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id),
  invoice_number   text not null check (length(invoice_number) between 1 and 50),
  invoice_date     date not null,
  customer_name    text not null check (length(customer_name) between 1 and 200),
  customer_tax_id  text not null,
  customer_email   text not null check (customer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  currency         char(3) not null check (currency = upper(currency)),
  subtotal         numeric(14,2) not null check (subtotal >= 0),
  tax_amount       numeric(14,2) not null check (tax_amount >= 0),
  total_amount     numeric(14,2) not null,
  status           invoice_status not null default 'pending',
  -- operational fields
  idempotency_key  text not null check (length(idempotency_key) between 8 and 128),
  request_hash     text not null,
  external_ref     text,
  rejection_reason text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint total_is_sum check (total_amount = subtotal + tax_amount),
  unique (company_id, invoice_number),
  unique (company_id, idempotency_key)
);
create index invoices_list_idx   on invoices (company_id, created_at desc);
create index invoices_status_idx on invoices (company_id, status);

-- Invoice items (line_total is tax-inclusive: quantity * unit_price + tax)
create table invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references invoices(id) on delete cascade,
  description text not null check (length(description) between 1 and 500),
  quantity    numeric(12,3) not null check (quantity > 0),
  unit_price  numeric(14,2) not null check (unit_price >= 0),
  tax         numeric(14,2) not null default 0 check (tax >= 0),
  line_total  numeric(14,2) not null,
  constraint line_total_is_sum check (line_total = round(quantity * unit_price, 2) + tax)
);
create index on invoice_items (invoice_id);

-- Retry queue (outbox)
create table submission_jobs (
  id              uuid primary key default gen_random_uuid(),
  invoice_id      uuid not null unique references invoices(id) on delete cascade,
  status          job_status not null default 'queued',
  attempts        int not null default 0,
  max_attempts    int not null default 8,
  next_attempt_at timestamptz not null default now(),
  locked_until    timestamptz,
  last_error      text
);
create index submission_jobs_due_idx on submission_jobs (next_attempt_at)
  where status in ('queued', 'processing');

-- One row per try to the government service
create table processing_logs (
  id          bigint generated always as identity primary key,
  job_id      uuid not null references submission_jobs(id) on delete cascade,
  invoice_id  uuid not null references invoices(id) on delete cascade,
  attempt_no  int not null,
  outcome     text not null check (outcome in ('success', 'rejected', 'retryable_error', 'timeout')),
  http_status int,
  error       text,
  duration_ms int,
  created_at  timestamptz not null default now()
);
create index on processing_logs (invoice_id);

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger invoices_touch before update on invoices
  for each row execute function touch_updated_at();

-- Atomic, idempotent intake. The DATABASE computes every total; client numbers are never trusted.
-- p_items: [{"description":..., "quantity":..., "unit_price":..., "tax":...}, ...]
create or replace function create_invoice(
  p_company_id uuid, p_idempotency_key text, p_request_hash text,
  p_invoice_number text, p_invoice_date date, p_customer_name text,
  p_customer_tax_id text, p_customer_email text, p_currency text, p_items jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_existing invoices%rowtype; v_subtotal numeric(14,2); v_tax numeric(14,2);
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'invoice_requires_items' using errcode = 'P0001';
  end if;

  select coalesce(sum(round((i->>'quantity')::numeric * (i->>'unit_price')::numeric, 2)), 0),
         coalesce(sum(coalesce((i->>'tax')::numeric, 0)), 0)
    into v_subtotal, v_tax from jsonb_array_elements(p_items) i;

  begin
    insert into invoices (company_id, idempotency_key, request_hash, invoice_number, invoice_date,
                          customer_name, customer_tax_id, customer_email, currency,
                          subtotal, tax_amount, total_amount)
    values (p_company_id, p_idempotency_key, p_request_hash, p_invoice_number, p_invoice_date,
            p_customer_name, p_customer_tax_id, p_customer_email, p_currency,
            v_subtotal, v_tax, v_subtotal + v_tax)
    on conflict (company_id, idempotency_key) do nothing
    returning id into v_id;
  exception when unique_violation then
    -- same company + invoice number, but a different idempotency key
    raise exception 'duplicate_invoice_number' using errcode = 'P0001';
  end;

  if v_id is null then
    select * into v_existing from invoices
     where company_id = p_company_id and idempotency_key = p_idempotency_key;
    if v_existing.request_hash <> p_request_hash then
      raise exception 'idempotency_key_reuse' using errcode = 'P0001';
    end if;
    return jsonb_build_object('id', v_existing.id, 'status', v_existing.status, 'replayed', true);
  end if;

  insert into invoice_items (invoice_id, description, quantity, unit_price, tax, line_total)
  select v_id, i->>'description', (i->>'quantity')::numeric, (i->>'unit_price')::numeric,
         coalesce((i->>'tax')::numeric, 0),
         round((i->>'quantity')::numeric * (i->>'unit_price')::numeric, 2) + coalesce((i->>'tax')::numeric, 0)
    from jsonb_array_elements(p_items) i;

  insert into submission_jobs (invoice_id) values (v_id);
  return jsonb_build_object('id', v_id, 'status', 'pending', 'replayed', false);
end $$;

-- Worker claims due jobs. SKIP LOCKED prevents two workers taking the same job;
-- an expired locked_until lets a crashed worker's job be retried.
create or replace function claim_submission_jobs(p_batch int, p_lease_seconds int)
returns setof submission_jobs language sql security definer set search_path = public as $$
  update submission_jobs j
     set status = 'processing', attempts = j.attempts + 1,
         locked_until = now() + make_interval(secs => p_lease_seconds)
   where j.id in (
     select id from submission_jobs
      where (status = 'queued' and next_attempt_at <= now())
         or (status = 'processing' and locked_until < now())
      order by next_attempt_at
      limit p_batch
      for update skip locked)
  returning j.*;
$$;

-- Row Level Security: users can only READ their own company's data; all writes go through the server.
alter table companies       enable row level security;
alter table users           enable row level security;
alter table invoices        enable row level security;
alter table invoice_items   enable row level security;
alter table submission_jobs enable row level security;
alter table processing_logs enable row level security;

create function my_company_id() returns uuid language sql stable security definer set search_path = public as $$
  select company_id from users where id = auth.uid()
$$;

create policy own_company  on companies       for select using (id = my_company_id());
create policy own_user     on users           for select using (id = auth.uid());
create policy own_invoices on invoices        for select using (company_id = my_company_id());
create policy own_items    on invoice_items   for select
  using (invoice_id in (select id from invoices where company_id = my_company_id()));
create policy own_logs     on processing_logs for select
  using (invoice_id in (select id from invoices where company_id = my_company_id()));

revoke execute on function create_invoice(uuid, text, text, text, date, text, text, text, text, jsonb)
  from public, anon, authenticated;
revoke execute on function claim_submission_jobs(int, int) from public, anon, authenticated;
