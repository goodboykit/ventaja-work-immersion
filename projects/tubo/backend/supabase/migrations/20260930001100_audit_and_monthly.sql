-- Audit trail (business events over past months/years) and month-scoped totals for the dashboard.

-- One row per meaningful business action, kept forever (the historical record).
create table audit_events (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  actor_user_id uuid references users(id),           -- who did it (null for system actions)
  event_type    text not null check (event_type in (
                  'invoice_created', 'invoice_submitted', 'invoice_rejected',
                  'invoice_failed', 'invoice_retried', 'teammate_invited', 'teammate_joined')),
  summary       text not null,                        -- a formal, human sentence
  metadata      jsonb not null default '{}'::jsonb,   -- e.g. { invoice_number, amount }
  created_at    timestamptz not null default now()
);
create index audit_events_list_idx on audit_events (company_id, created_at desc);

alter table audit_events enable row level security;
create policy own_audit on audit_events for select using (company_id = (select my_company_id()));

-- Record one audit event (server-only).
create or replace function record_audit_event(
  p_company_id uuid, p_actor uuid, p_event_type text, p_summary text, p_metadata jsonb
) returns void language sql security definer set search_path = public as $$
  insert into audit_events (company_id, actor_user_id, event_type, summary, metadata)
  values (p_company_id, p_actor, p_event_type, p_summary, coalesce(p_metadata, '{}'::jsonb));
$$;

-- List audit events in a date range (inclusive on created_at date), newest first.
create or replace function list_audit_events(p_company_id uuid, p_from date, p_to date, p_limit int)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row order by created_at desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'id', id, 'event_type', event_type, 'summary', summary,
               'metadata', metadata, 'created_at', created_at
             ) as row, created_at
        from audit_events
       where company_id = p_company_id
         and (p_from is null or created_at >= p_from)
         and (p_to   is null or created_at <  (p_to + 1))   -- inclusive of the whole p_to day
       order by created_at desc
       limit least(coalesce(p_limit, 200), 500)
    ) t;
$$;

-- Per-month totals for the dashboard: counts by status + summed amount, for invoices whose
-- invoice_date falls in [p_from, p_to]. One grouped query, uses the (company_id, ...) indexes.
create or replace function monthly_status_counts(p_company_id uuid, p_from date, p_to date)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'counts', coalesce((
      select jsonb_object_agg(status, n)
        from (select status, count(*)::int n
                from invoices
               where company_id = p_company_id and invoice_date between p_from and p_to
               group by status) s
    ), '{}'::jsonb),
    'total_count', (
      select count(*)::int from invoices
       where company_id = p_company_id and invoice_date between p_from and p_to
    ),
    'total_amount', (
      select coalesce(sum(total_amount), 0)::text from invoices
       where company_id = p_company_id and invoice_date between p_from and p_to
    )
  );
$$;

revoke execute on function record_audit_event(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function list_audit_events(uuid, date, date, int) from public, anon, authenticated;
revoke execute on function monthly_status_counts(uuid, date, date) from public, anon, authenticated;
