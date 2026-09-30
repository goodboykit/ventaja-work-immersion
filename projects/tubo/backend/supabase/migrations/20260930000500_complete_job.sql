-- Atomically completes a single submission attempt: logs the outcome, updates the job,
-- and sets the invoice status — all in one transaction so nothing can be half-done.

create or replace function complete_submission_attempt(
  p_job_id        uuid,
  p_invoice_id    uuid,
  p_attempt_no    int,
  p_outcome       text,      -- 'success' | 'rejected' | 'retryable_error' | 'timeout'
  p_http_status   int,       -- null for timeout
  p_error         text,      -- null for success
  p_duration_ms   int,       -- null if unknown
  p_external_ref  text       -- null unless success
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_max    int;
  v_attempts int;
begin
  -- 1) Log the attempt
  insert into processing_logs (job_id, invoice_id, attempt_no, outcome, http_status, error, duration_ms)
  values (p_job_id, p_invoice_id, p_attempt_no, p_outcome, p_http_status, p_error, p_duration_ms);

  -- Read job state
  select max_attempts, attempts into v_max, v_attempts
    from submission_jobs where id = p_job_id for update;

  if p_outcome = 'success' then
    -- Mark job done, invoice submitted
    update submission_jobs set status = 'done', locked_until = null, last_error = null
     where id = p_job_id;
    update invoices set status = 'submitted', external_ref = p_external_ref
     where id = p_invoice_id;

  elsif p_outcome = 'rejected' then
    -- Mark job done, invoice rejected
    update submission_jobs set status = 'done', locked_until = null, last_error = p_error
     where id = p_job_id;
    update invoices set status = 'rejected', rejection_reason = p_error
     where id = p_invoice_id;

  else
    -- retryable_error or timeout: schedule next attempt or give up
    if v_attempts >= v_max then
      update submission_jobs set status = 'dead', locked_until = null, last_error = p_error
       where id = p_job_id;
      update invoices set status = 'failed' where id = p_invoice_id;
    else
      -- Exponential backoff: 2^(attempts-1) seconds, capped at 5 minutes
      update submission_jobs
         set status = 'queued',
             locked_until = null,
             last_error = p_error,
             next_attempt_at = now() + least(make_interval(secs => power(2, v_attempts - 1)::int), interval '5 minutes')
       where id = p_job_id;
      update invoices set status = 'pending' where id = p_invoice_id;
    end if;
  end if;
end $$;

revoke execute on function complete_submission_attempt(uuid, uuid, int, text, int, text, int, text)
  from public, anon, authenticated;
