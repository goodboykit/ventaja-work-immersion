-- Seed: insert realistic "failed" invoices so the UI can show the failed state
-- and retry button without waiting 33 minutes for a real outage simulation.
-- Walks through valid status transitions: pending → processing → failed.

do $$
declare
  v_company_id uuid;
  v_invoice_id uuid;
  v_job_id     uuid;
  v_seeds text[][] := array[
    array['FAIL-001', 'Test Failed Corp',       '111-222-333-000', 'failed@example.com',    'PHP', '1000.00', '120.00', '1120.00', 'Consulting Services',    '10', '100.00', '120.00', '1120.00'],
    array['FAIL-002', 'Broken Systems Inc',      '444-555-666-000', 'broken@example.com',    'PHP', '5000.00', '600.00', '5600.00', 'Cloud Hosting (Annual)',  '1',  '5000.00','600.00', '5600.00'],
    array['FAIL-003', 'Timeout Industries',      '777-888-999-000', 'timeout@example.com',   'USD', '250.00',  '30.00',  '280.00',  'API Integration Support', '5',  '50.00',  '30.00',  '280.00']
  ];
  v_seed text[];
begin
  select id into v_company_id from companies limit 1;
  if v_company_id is null then
    raise notice 'No company found — skipping failed invoice seeds';
    return;
  end if;

  foreach v_seed slice 1 in array v_seeds loop
    -- Skip if already seeded
    if exists (select 1 from invoices where company_id = v_company_id and invoice_number = v_seed[1]) then
      raise notice 'Seed invoice % already exists — skipping', v_seed[1];
      continue;
    end if;

    v_invoice_id := gen_random_uuid();
    v_job_id     := gen_random_uuid();

    -- 1) Insert invoice as 'pending' (default status)
    insert into invoices (
      id, company_id, invoice_number, invoice_date,
      customer_name, customer_tax_id, customer_email,
      currency, subtotal, tax_amount, total_amount,
      idempotency_key, request_hash,
      created_at, updated_at
    ) values (
      v_invoice_id, v_company_id, v_seed[1], current_date,
      v_seed[2], v_seed[3], v_seed[4],
      v_seed[5], v_seed[6]::numeric, v_seed[7]::numeric, v_seed[8]::numeric,
      'seed-' || lower(v_seed[1]), 'seed-hash-' || lower(v_seed[1]),
      now() - interval '35 minutes', now()
    );

    -- 2) Insert line item while invoice is still 'pending'
    insert into invoice_items (invoice_id, line_number, description, quantity, unit_price, tax, line_total)
    values (v_invoice_id, 1, v_seed[9], v_seed[10]::numeric, v_seed[11]::numeric, v_seed[12]::numeric, v_seed[13]::numeric);

    -- 3) Walk through valid status transitions: pending → processing → failed
    update invoices set status = 'processing' where id = v_invoice_id;
    update invoices set status = 'failed'     where id = v_invoice_id;

    -- 4) Insert the dead submission job (all 15 attempts exhausted)
    insert into submission_jobs (id, invoice_id, status, attempts, max_attempts, last_error, next_attempt_at, locked_until)
    values (v_job_id, v_invoice_id, 'dead', 15, 15,
            'Service temporarily unavailable', now(), null);

    -- 5) Insert 15 processing log entries showing the full retry history
    insert into processing_logs (job_id, invoice_id, attempt_no, outcome, http_status, error, duration_ms, created_at)
    select
      v_job_id, v_invoice_id, n,
      'retryable_error', 503, 'Service temporarily unavailable',
      400 + (random() * 600)::int,
      now() - interval '35 minutes' + (n - 1) * interval '2 minutes'
    from generate_series(1, 15) as n;

    raise notice 'Seeded failed invoice % with 15 attempt logs', v_seed[1];
  end loop;
end $$;
