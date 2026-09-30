-- Fix: claim_submission_jobs must also set the INVOICE status to 'processing'.
--
-- Before this fix, only submission_jobs.status was updated to 'processing' when
-- the worker claimed a job. The invoice stayed 'pending'. Then when the worker
-- tried to write the outcome (e.g. pending → submitted), the guard_invoice_update
-- trigger blocked it because 'pending → submitted' is not an allowed transition.
-- Only 'processing → submitted' is allowed.
--
-- The fix uses a CTE so both the job and the invoice are updated in one atomic
-- statement. This also means the invoice status is guaranteed to be 'processing'
-- before the worker calls complete_submission_attempt.

create or replace function claim_submission_jobs(p_batch int, p_lease_seconds int)
returns setof submission_jobs language sql security definer set search_path = public as $$
  with claimed as (
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
    returning j.*
  ),
  mark_invoices as (
    update invoices set status = 'processing'
     where id in (select invoice_id from claimed)
  )
  select * from claimed;
$$;

-- Fix stuck data: any invoice that is still 'pending' but whose job is 'processing'
-- is stuck because of this bug. Reset them so the worker can re-claim cleanly.
update submission_jobs
   set status = 'queued',
       locked_until = null,
       next_attempt_at = now()
 where status = 'processing'
   and id in (
     select sj.id from submission_jobs sj
       join invoices i on i.id = sj.invoice_id
      where sj.status = 'processing' and i.status = 'pending'
   );

-- Also reset the attempt counter for jobs that were stuck in the infinite loop.
-- They burned through attempts without ever actually completing, so the count is
-- artificially inflated. Reset to 0 so they get a fair budget of max_attempts.
update submission_jobs
   set attempts = 0
 where status = 'queued'
   and attempts > max_attempts;
