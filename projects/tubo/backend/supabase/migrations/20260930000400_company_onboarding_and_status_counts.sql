-- Company onboarding (a new user creates their company) and the status counts behind the dashboard cards.

-- One transaction: create the company and link the user to it. If anything fails, nothing is kept.
create or replace function register_company(p_user_id uuid, p_name text, p_tax_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_company_id uuid;
begin
  if exists (select 1 from users where id = p_user_id) then
    raise exception 'already_registered' using errcode = 'P0001';
  end if;

  begin
    insert into companies (name, tax_id) values (p_name, p_tax_id) returning id into v_company_id;
  exception when unique_violation then
    raise exception 'tax_id_taken' using errcode = 'P0001';
  end;

  begin
    insert into users (id, company_id) values (p_user_id, v_company_id);
  exception when unique_violation then
    -- the same user registered twice at the same moment; the whole call is rolled back
    raise exception 'already_registered' using errcode = 'P0001';
  end;

  return jsonb_build_object('id', v_company_id, 'name', p_name, 'tax_id', p_tax_id);
end $$;

-- One grouped query (served by the (company_id, status) index) instead of five separate counts.
create or replace function invoice_status_counts(p_company_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
    from (select status, count(*)::int as n from invoices where company_id = p_company_id group by status) t
$$;

revoke execute on function register_company(uuid, text, text) from public, anon, authenticated;
revoke execute on function invoice_status_counts(uuid) from public, anon, authenticated;
