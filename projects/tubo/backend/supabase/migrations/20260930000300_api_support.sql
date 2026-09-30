-- Support for the REST API: stable item order, and a safe "retry failed invoice" operation.

-- 1) Items need a stable order so an invoice always reads the same way.
alter table invoice_items add column line_number int not null check (line_number > 0);
alter table invoice_items add constraint invoice_items_line_unique unique (invoice_id, line_number);

-- 2) create_invoice now records the line number of each item.
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
    v_id := null;
  end;

  if v_id is null then
    select * into v_existing from invoices
     where company_id = p_company_id and idempotency_key = p_idempotency_key;

    if v_existing.id is null then
      raise exception 'duplicate_invoice_number' using errcode = 'P0001';
    end if;
    if v_existing.request_hash <> p_request_hash then
      raise exception 'idempotency_key_reuse' using errcode = 'P0001';
    end if;
    return jsonb_build_object('id', v_existing.id, 'status', v_existing.status, 'replayed', true);
  end if;

  insert into invoice_items (invoice_id, line_number, description, quantity, unit_price, tax, line_total)
  select v_id, ordinality, i->>'description', (i->>'quantity')::numeric, (i->>'unit_price')::numeric,
         coalesce((i->>'tax')::numeric, 0),
         round((i->>'quantity')::numeric * (i->>'unit_price')::numeric, 2) + coalesce((i->>'tax')::numeric, 0)
    from jsonb_array_elements(p_items) with ordinality as t(i, ordinality);

  insert into submission_jobs (invoice_id) values (v_id);
  return jsonb_build_object('id', v_id, 'status', 'pending', 'replayed', false);
end $$;

-- 3) Retry: only a FAILED invoice can be retried (a rejected one is invalid; retrying cannot fix it).
--    The row lock makes two simultaneous retries safe: the second one sees "pending" and is refused.
--    attempts is kept (the log stays numbered correctly); max_attempts grows to give a fresh retry budget.
create or replace function retry_invoice(p_company_id uuid, p_invoice_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_status invoice_status;
begin
  select status into v_status from invoices
   where id = p_invoice_id and company_id = p_company_id
   for update;

  if not found then
    raise exception 'invoice_not_found' using errcode = 'P0001';
  end if;
  if v_status <> 'failed' then
    raise exception 'invoice_not_retryable' using errcode = 'P0001', detail = v_status::text;
  end if;

  update invoices set status = 'pending' where id = p_invoice_id;
  update submission_jobs
     set status = 'queued', max_attempts = attempts + 8, next_attempt_at = now(),
         locked_until = null, last_error = null
   where invoice_id = p_invoice_id;

  return jsonb_build_object('id', p_invoice_id, 'status', 'pending');
end $$;

revoke execute on function create_invoice(uuid, text, text, text, date, text, text, text, text, jsonb)
  from public, anon, authenticated;
revoke execute on function retry_invoice(uuid, uuid) from public, anon, authenticated;
