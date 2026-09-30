-- Team invitations: let a user who already has a company invite teammates by email.
-- The invited person accepts a single-use, expiring token, which links their login to the
-- same company. RLS already scopes every table by company_id, so once linked, both users
-- see the same invoices automatically. This is what makes "many users, one company" real.

create table invitations (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  email       text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  token       text not null unique check (length(token) between 16 and 128),
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by  uuid not null references users(id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index invitations_company_idx on invitations (company_id, created_at desc);
-- At most one live (pending) invite per email per company. Case-insensitive on the email.
create unique index invitations_pending_unique on invitations (company_id, lower(email))
  where status = 'pending';

alter table invitations enable row level security;
-- A user can read only their own company's invitations.
create policy own_invitations on invitations for select
  using (company_id = (select my_company_id()));

-- Create an invitation. Only a user who already belongs to a company can invite,
-- and the invite is always for THAT company (a user cannot invite into someone else's).
create or replace function create_invitation(p_inviter uuid, p_email text, p_token text, p_expires timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
  v_id uuid;
begin
  select company_id into v_company_id from users where id = p_inviter;
  if v_company_id is null then
    raise exception 'no_company' using errcode = 'P0001';
  end if;

  -- If this email already belongs to a user in this company, there is nothing to invite.
  if exists (
    select 1 from users u
      join auth.users au on au.id = u.id
     where u.company_id = v_company_id and lower(au.email) = lower(p_email)
  ) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;

  begin
    insert into invitations (company_id, email, token, invited_by, expires_at)
    values (v_company_id, p_email, p_token, p_inviter, p_expires)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'invite_already_pending' using errcode = 'P0001';
  end;

  return jsonb_build_object(
    'id', v_id, 'company_id', v_company_id, 'email', p_email,
    'token', p_token, 'status', 'pending', 'expires_at', p_expires
  );
end $$;

-- Accept an invitation: link the accepting user to the invite's company.
-- Single-use (the invite is marked accepted) and one-company-per-user (a user who already
-- has a company is refused). Both writes happen in one transaction.
create or replace function accept_invitation(p_user_id uuid, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_invite invitations%rowtype;
  v_company companies%rowtype;
begin
  select * into v_invite from invitations where token = p_token for update;

  if not found or v_invite.status <> 'pending' then
    raise exception 'invalid_or_expired_invite' using errcode = 'P0001';
  end if;
  if v_invite.expires_at <= now() then
    update invitations set status = 'expired' where id = v_invite.id;
    raise exception 'invalid_or_expired_invite' using errcode = 'P0001';
  end if;
  if exists (select 1 from users where id = p_user_id) then
    raise exception 'already_in_company' using errcode = 'P0001';
  end if;

  insert into users (id, company_id) values (p_user_id, v_invite.company_id);
  update invitations set status = 'accepted' where id = v_invite.id;

  select * into v_company from companies where id = v_invite.company_id;
  return jsonb_build_object('id', v_company.id, 'name', v_company.name, 'tax_id', v_company.tax_id);
end $$;

-- List a company's pending invitations (for the "Invite teammates" screen).
create or replace function list_invitations(p_company_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'email', email, 'status', status,
           'created_at', created_at, 'expires_at', expires_at
         ) order by created_at desc), '[]'::jsonb)
    from invitations
   where company_id = p_company_id and status = 'pending';
$$;

revoke execute on function create_invitation(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function accept_invitation(uuid, text) from public, anon, authenticated;
revoke execute on function list_invitations(uuid) from public, anon, authenticated;
