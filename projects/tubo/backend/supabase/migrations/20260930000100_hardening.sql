-- Hardening: faster RLS, valid status changes only, and invoices that cannot be altered after creation.

-- 1) RLS speed: (select ...) makes Postgres compute the company ONCE per query instead of once per row.
drop policy if exists own_company  on companies;
drop policy if exists own_user     on users;
drop policy if exists own_invoices on invoices;
drop policy if exists own_items    on invoice_items;
drop policy if exists own_logs     on processing_logs;

create policy own_company  on companies       for select using (id = (select my_company_id()));
create policy own_user     on users           for select using (id = (select auth.uid()));
create policy own_invoices on invoices        for select using (company_id = (select my_company_id()));
create policy own_items    on invoice_items   for select
  using (invoice_id in (select id from invoices where company_id = (select my_company_id())));
create policy own_logs     on processing_logs for select
  using (invoice_id in (select id from invoices where company_id = (select my_company_id())));

-- 2) Status must match its supporting data.
alter table invoices add constraint submitted_has_reference
  check (status <> 'submitted' or external_ref is not null);
alter table invoices add constraint rejected_has_reason
  check (status <> 'rejected' or rejection_reason is not null);

-- 3) Only valid status changes; the invoice's own data is frozen once created.
--    Allowed: pending -> processing -> (submitted | rejected | failed | pending for a retry); failed -> pending.
create or replace function guard_invoice_update() returns trigger language plpgsql as $$
begin
  if (old.company_id, old.invoice_number, old.invoice_date, old.customer_name, old.customer_tax_id,
      old.customer_email, old.currency, old.subtotal, old.tax_amount, old.total_amount,
      old.idempotency_key, old.request_hash)
     is distinct from
     (new.company_id, new.invoice_number, new.invoice_date, new.customer_name, new.customer_tax_id,
      new.customer_email, new.currency, new.subtotal, new.tax_amount, new.total_amount,
      new.idempotency_key, new.request_hash) then
    raise exception 'invoice_is_immutable' using errcode = 'P0001';
  end if;

  if new.status is distinct from old.status and not (
       (old.status = 'pending'    and new.status = 'processing')
    or (old.status = 'processing' and new.status in ('submitted', 'rejected', 'failed', 'pending'))
    or (old.status = 'failed'     and new.status = 'pending')
  ) then
    raise exception 'invalid_status_transition: % -> %', old.status, new.status using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger invoices_guard before update on invoices
  for each row execute function guard_invoice_update();

-- Items never change after creation, and can only be added while the invoice is still pending.
create or replace function guard_invoice_item() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'invoice_items_are_immutable' using errcode = 'P0001';
  end if;
  if (select status from invoices where id = new.invoice_id) <> 'pending' then
    raise exception 'invoice_is_locked' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger invoice_items_guard before insert or update on invoice_items
  for each row execute function guard_invoice_item();
