-- Status counts filtered by invoice_date range, for the monthly dashboard cards.
-- Falls back to all invoices when no dates are provided.
create or replace function invoice_status_counts_by_date(
  p_company_id uuid,
  p_from date default null,
  p_to   date default null
) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
    from (
      select status, count(*)::int as n
        from invoices
       where company_id = p_company_id
         and (p_from is null or invoice_date >= p_from)
         and (p_to   is null or invoice_date <= p_to)
       group by status
    ) t
$$;

revoke execute on function invoice_status_counts_by_date(uuid, date, date)
  from public, anon, authenticated;
