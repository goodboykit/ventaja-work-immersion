-- Record audit events atomically inside the functions that change invoice/company state,
-- so the audit trail can never drift from what actually happened.

-- 1) Invoice created -> audit event (inside create_invoice, only for a genuinely new invoice).
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

  insert into audit_events (company_id, actor_user_id, event_type, summary, metadata)
  values (p_company_id, auth.uid(), 'invoice_created',
          format('Invoice %s was created for %s (%s %s).', p_invoice_number, p_customer_name, p_currency, to_char(v_subtotal + v_tax, 'FM999999990.00')),
          jsonb_build_object('invoice_number', p_invoice_number, 'amount', (v_subtotal + v_tax)::text, 'currency', p_currency));

  return jsonb_build_object('id', v_id, 'status', 'pending', 'replayed', false);
end $$;

-- 2) Submission outcome -> audit event (inside complete_submission_attempt, for terminal states).
create or replace function complete_submission_attempt(
  p_job_id uuid, p_invoice_id uuid, p_attempt_no int, p_outcome text,
  p_http_status int, p_error text, p_duration_ms int, p_external_ref text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_max int; v_attempts int; v_company uuid; v_number text;
begin
  insert into processing_logs (job_id, invoice_id, attempt_no, outcome, http_status, error, duration_ms)
  values (p_job_id, p_invoice_id, p_attempt_no, p_outcome, p_http_status, p_error, p_duration_ms);

  select max_attempts, attempts into v_max, v_attempts from submission_jobs where id = p_job_id for update;
  select company_id, invoice_number into v_company, v_number from invoices where id = p_invoice_id;

  if p_outcome = 'success' then
    update submission_jobs set status = 'done', locked_until = null, last_error = null where id = p_job_id;
    update invoices set status = 'submitted', external_ref = p_external_ref where id = p_invoice_id;
    insert into audit_events (company_id, actor_user_id, event_type, summary, metadata)
    values (v_company, null, 'invoice_submitted',
            format('Invoice %s was accepted by the government service (reference %s).', v_number, p_external_ref),
            jsonb_build_object('invoice_number', v_number, 'external_ref', p_external_ref));

  elsif p_outcome = 'rejected' then
    update submission_jobs set status = 'done', locked_until = null, last_error = p_error where id = p_job_id;
    update invoices set status = 'rejected', rejection_reason = p_error where id = p_invoice_id;
    insert into audit_events (company_id, actor_user_id, event_type, summary, metadata)
    values (v_company, null, 'invoice_rejected',
            format('Invoice %s was rejected by the government service. Reason: %s', v_number, p_error),
            jsonb_build_object('invoice_number', v_number, 'reason', p_error));

  else
    if v_attempts >= v_max then
      update submission_jobs set status = 'dead', locked_until = null, last_error = p_error where id = p_job_id;
      update invoices set status = 'failed' where id = p_invoice_id;
      insert into audit_events (company_id, actor_user_id, event_type, summary, metadata)
      values (v_company, null, 'invoice_failed',
              format('Invoice %s could not be delivered after %s attempts. Last error: %s', v_number, v_attempts, p_error),
              jsonb_build_object('invoice_number', v_number, 'attempts', v_attempts, 'last_error', p_error));
    else
      update submission_jobs
         set status = 'queued', locked_until = null, last_error = p_error,
             next_attempt_at = now() + least(make_interval(secs => power(2, v_attempts - 1)::int), interval '5 minutes')
       where id = p_job_id;
      update invoices set status = 'pending' where id = p_invoice_id;
    end if;
  end if;
end $$;

-- 3) Retry -> audit event (inside retry_invoice).
create or replace function retry_invoice(p_company_id uuid, p_invoice_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_status invoice_status; v_number text;
begin
  select status, invoice_number into v_status, v_number from invoices
   where id = p_invoice_id and company_id = p_company_id for update;
  if not found then raise exception 'invoice_not_found' using errcode = 'P0001'; end if;
  if v_status <> 'failed' then raise exception 'invoice_not_retryable' using errcode = 'P0001', detail = v_status::text; end if;

  update invoices set status = 'pending' where id = p_invoice_id;
  update submission_jobs
     set status = 'queued', max_attempts = attempts + 15, next_attempt_at = now(), locked_until = null, last_error = null
   where invoice_id = p_invoice_id;

  insert into audit_events (company_id, actor_user_id, event_type, summary, metadata)
  values (p_company_id, auth.uid(), 'invoice_retried',
          format('Invoice %s was retried manually.', v_number),
          jsonb_build_object('invoice_number', v_number));

  return jsonb_build_object('id', p_invoice_id, 'status', 'pending');
end $$;

-- 4) Teammate joined -> audit event (inside accept_invitation).
create or replace function accept_invitation(p_user_id uuid, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_invite invitations%rowtype; v_company companies%rowtype;
begin
  select * into v_invite from invitations where token = p_token for update;
  if not found or v_invite.status <> 'pending' then raise exception 'invalid_or_expired_invite' using errcode = 'P0001'; end if;
  if v_invite.expires_at <= now() then
    update invitations set status = 'expired' where id = v_invite.id;
    raise exception 'invalid_or_expired_invite' using errcode = 'P0001';
  end if;
  if exists (select 1 from users where id = p_user_id) then raise exception 'already_in_company' using errcode = 'P0001'; end if;

  insert into users (id, company_id) values (p_user_id, v_invite.company_id);
  update invitations set status = 'accepted' where id = v_invite.id;
  select * into v_company from companies where id = v_invite.company_id;

  insert into audit_events (company_id, actor_user_id, event_type, summary, metadata)
  values (v_company.id, p_user_id, 'teammate_joined',
          format('A teammate (%s) joined the company.', v_invite.email),
          jsonb_build_object('email', v_invite.email));

  return jsonb_build_object('id', v_company.id, 'name', v_company.name, 'tax_id', v_company.tax_id);
end $$;

revoke execute on function create_invoice(uuid, text, text, text, date, text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function complete_submission_attempt(uuid, uuid, int, text, int, text, int, text) from public, anon, authenticated;
revoke execute on function retry_invoice(uuid, uuid) from public, anon, authenticated;
revoke execute on function accept_invitation(uuid, text) from public, anon, authenticated;
