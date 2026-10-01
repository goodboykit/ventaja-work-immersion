-- Seed audit events for every invoice that already exists in the database but
-- has no corresponding audit trail entry (i.e. invoices created by earlier seed
-- migrations that bypassed the create_invoice() function).
-- Idempotent: skips invoices that already have an 'invoice_created' event.

do $$
declare
  inv record;
begin
  for inv in
    select i.id, i.company_id, i.invoice_number, i.total_amount, i.currency,
           i.status, i.created_at
      from invoices i
     where not exists (
       select 1 from audit_events ae
        where ae.company_id = i.company_id
          and ae.event_type = 'invoice_created'
          and ae.metadata->>'invoice_id' = i.id::text
     )
     order by i.created_at
  loop
    -- Record the creation event (back-dated to the invoice's created_at).
    insert into audit_events (company_id, actor_user_id, event_type, summary, metadata, created_at)
    values (
      inv.company_id,
      null,
      'invoice_created',
      format('Invoice %s created for %s %s', inv.invoice_number, inv.total_amount, inv.currency),
      jsonb_build_object('invoice_id', inv.id, 'invoice_number', inv.invoice_number,
                         'amount', inv.total_amount, 'currency', inv.currency),
      inv.created_at
    );

    -- If the invoice ended up submitted, record a submission event.
    if inv.status = 'submitted' then
      insert into audit_events (company_id, actor_user_id, event_type, summary, metadata, created_at)
      values (
        inv.company_id, null, 'invoice_submitted',
        format('Invoice %s accepted by the government service', inv.invoice_number),
        jsonb_build_object('invoice_id', inv.id, 'invoice_number', inv.invoice_number),
        inv.created_at + interval '2 minutes'
      );
    end if;

    -- If the invoice was rejected, record a rejection event.
    if inv.status = 'rejected' then
      insert into audit_events (company_id, actor_user_id, event_type, summary, metadata, created_at)
      values (
        inv.company_id, null, 'invoice_rejected',
        format('Invoice %s rejected by the government service', inv.invoice_number),
        jsonb_build_object('invoice_id', inv.id, 'invoice_number', inv.invoice_number),
        inv.created_at + interval '2 minutes'
      );
    end if;

    -- If the invoice failed, record a failure event.
    if inv.status = 'failed' then
      insert into audit_events (company_id, actor_user_id, event_type, summary, metadata, created_at)
      values (
        inv.company_id, null, 'invoice_failed',
        format('Invoice %s delivery failed after maximum retries', inv.invoice_number),
        jsonb_build_object('invoice_id', inv.id, 'invoice_number', inv.invoice_number),
        inv.created_at + interval '33 minutes'
      );
    end if;
  end loop;
end;
$$;
