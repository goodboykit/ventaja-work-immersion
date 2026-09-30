-- Part H: Make the retry strategy robust enough to survive a 30-minute outage.
--
-- With 8 max attempts and exponential backoff (1s, 2s, 4s, 8s, 16s, 32s, 64s, 128s)
-- the total retry window was only ~4.5 minutes — far too short.
--
-- With 15 attempts the schedule becomes:
--   1s, 2s, 4s, 8s, 16s, 32s, 64s, 128s, 256s, 300s, 300s, 300s, 300s, 300s
--   Total ≈ 33 minutes — comfortably covers a 30-minute government API outage.
--
-- The cap stays at 5 minutes so we don't wait too long between individual retries.

-- 1) Change the DEFAULT for new jobs from 8 to 15.
alter table submission_jobs alter column max_attempts set default 15;

-- 2) Bump any existing queued/processing jobs that still have the old budget.
--    This is safe: it only gives them MORE room; it never reduces attempts.
update submission_jobs
   set max_attempts = greatest(max_attempts, 15)
 where status in ('queued', 'processing');

-- 3) Update the retry function to give a fresh budget of 15 (not 8).
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
     set status = 'queued', max_attempts = attempts + 15, next_attempt_at = now(),
         locked_until = null, last_error = null
   where invoice_id = p_invoice_id;

  return jsonb_build_object('id', p_invoice_id, 'status', 'pending');
end $$;

revoke execute on function retry_invoice(uuid, uuid) from public, anon, authenticated;
