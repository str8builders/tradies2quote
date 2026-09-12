-- Additive migration; existing quote ownership and document access stay unchanged.
begin;
set local lock_timeout = '5s';
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 100),
  created_at timestamptz not null default now()
);
create table public.team_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  joined_at timestamptz not null default now()
);
create index on public.team_members(team_id);
create table public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and length(email) <= 254),
  token_hash text not null unique,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.team_invitations(team_id);
create table public.terms_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 100),
  body text not null check (length(btrim(body)) between 1 and 20000),
  created_at timestamptz not null default now()
);
create table public.quote_attachments (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  path text not null unique,
  name text not null,
  content_type text not null check(content_type in ('image/jpeg','image/png','image/webp')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invitations enable row level security;
alter table public.terms_templates enable row level security;
alter table public.quote_attachments enable row level security;
-- Team access is an entitlement, never derived from client-supplied metadata.
create or replace function public.team_seat_limit(p_owner uuid) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select case plan when 'crew' then 5 when 'builder' then 20 else 0 end
    from public.subscriptions where user_id=p_owner and status in ('active','trialing','past_due')
      and current_period_end is not null and current_period_end::timestamptz > now()),0);
$$;
create or replace function public.active_team_owner(p_user uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select t.owner_id from public.team_members m join public.teams t on t.id=m.team_id
    where m.user_id=p_user and public.team_seat_limit(t.owner_id)>0
      and (select count(*) from public.team_members x where x.team_id=t.id)<=public.team_seat_limit(t.owner_id);
$$;
create or replace function public.my_team_owner() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$ select public.active_team_owner(auth.uid()); $$;
create function public.my_team_id() returns uuid language sql stable security definer set search_path=public,pg_temp as $$ select team_id from public.team_members where user_id=auth.uid(); $$;
revoke all on function public.my_team_id() from public,anon;
grant execute on function public.my_team_id() to authenticated,service_role;
create policy team_read on public.teams for select to authenticated using(owner_id=auth.uid() or id=public.my_team_id());
create policy members_read on public.team_members for select to authenticated using(user_id=auth.uid() or team_id in(select id from public.teams where owner_id=auth.uid() or owner_id=public.my_team_owner()));
create policy invitations_read on public.team_invitations for select to authenticated using(team_id in(select id from public.teams where owner_id=auth.uid()));
-- Use the team's owner as the address-book namespace. Personal records stay private.
grant select,insert,update on public.clients to authenticated;
create policy shared_clients_read on public.clients for select to authenticated using(user_id=public.my_team_owner());
create policy shared_clients_insert on public.clients for insert to authenticated with check(user_id=public.my_team_owner());
create policy shared_clients_update on public.clients for update to authenticated using(user_id=public.my_team_owner()) with check(user_id=public.my_team_owner());
create policy templates_read on public.terms_templates for select to authenticated using((user_id=auth.uid() or user_id=public.my_team_owner()) and public.team_seat_limit(user_id)=20);
create policy templates_insert on public.terms_templates for insert to authenticated with check(user_id=auth.uid() and public.team_seat_limit(auth.uid())=20);
create policy templates_update on public.terms_templates for update to authenticated using(user_id=auth.uid() and public.team_seat_limit(auth.uid())=20) with check(user_id=auth.uid());
create policy templates_delete on public.terms_templates for delete to authenticated using(user_id=auth.uid());
create policy attachments_read on public.quote_attachments for select to authenticated using(user_id=auth.uid());
-- Mutations are RPC-only: lock the team so concurrent invitations cannot oversubscribe it.
create function public.manage_team(p_action text, p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := auth.uid(); t public.teams; inv public.team_invitations; lim int; used int; mail text; target uuid;
begin
  if u is null then raise exception 'Sign in to manage your team.'; end if;
  if p_action='create' then
    if public.team_seat_limit(u)<5 then raise exception 'An active Crew or Builder plan is required.'; end if;
    if exists(select 1 from public.team_members where user_id=u) then raise exception 'You already belong to a team.'; end if;
    insert into public.teams(owner_id,name) values(u,btrim(p_data->>'name')) returning * into t;
    insert into public.team_members(user_id,team_id) values(u,t.id);
    return to_jsonb(t);
  elsif p_action='accept' then
    select * into inv from public.team_invitations where token_hash=p_data->>'token_hash';
    if not found then raise exception 'This invitation is invalid or has expired.'; end if;
    select * into t from public.teams where id=inv.team_id for update;
    select * into inv from public.team_invitations where id=inv.id for update;
    if inv.revoked_at is not null or inv.accepted_at is not null or inv.expires_at<=now() then raise exception 'This invitation is invalid or has expired.'; end if;
    select lower(email) into mail from auth.users where id=u and email_confirmed_at is not null;
    if mail is null or mail<>inv.email then raise exception 'Sign in with the verified email address this invitation was sent to.'; end if;
    if exists(select 1 from public.team_members where user_id=u) or exists(select 1 from public.teams where owner_id=u) then raise exception 'Leave your current team before joining another.'; end if;
    if exists(select 1 from public.subscriptions where user_id=u and stripe_subscription_id is not null and status not in ('canceled','incomplete_expired')) then raise exception 'Your account already has a subscription. Finish or cancel it before joining a team.'; end if;
    if exists(select 1 from public.checkout_attempts where user_id=u and created_at>now()-interval '1 hour') then raise exception 'A personal checkout is still open. Join after it expires to avoid overlapping subscriptions.'; end if;
    lim:=public.team_seat_limit(t.owner_id);
    select count(*) into used from public.team_members where team_id=t.id;
    if lim<5 or used>=lim then raise exception 'The team has no available seats. Contact its owner.'; end if;
    insert into public.team_members(user_id,team_id) values(u,t.id);
    update public.team_invitations set accepted_at=now() where id=inv.id;
    return jsonb_build_object('ok',true,'name',t.name);
  end if;
  select * into t from public.teams where owner_id=u for update;
  if not found then
    if p_action='leave' then
      select teams.* into t from public.teams teams join public.team_members m on m.team_id=teams.id where m.user_id=u for update of teams;
      delete from public.team_members where user_id=u;
      return jsonb_build_object('ok',true);
    end if;
    raise exception 'Only the team owner can manage this team.';
  end if;
  if p_action='invite' then
    lim:=public.team_seat_limit(u);
    if lim<5 then raise exception 'An active Crew or Builder plan is required.'; end if;
    mail:=lower(btrim(p_data->>'email'));
    if mail is null or mail !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(mail)>254 then raise exception 'Enter a valid email address.'; end if;
    if exists(select 1 from public.team_members m join auth.users a on a.id=m.user_id where m.team_id=t.id and lower(a.email)=mail) then raise exception 'This person is already on your team.'; end if;
    if exists(select 1 from public.team_invitations where team_id=t.id and email=mail and expires_at>now() and accepted_at is null and revoked_at is null) then raise exception 'Revoke the existing invitation before creating another.'; end if;
    select (select count(*) from public.team_members where team_id=t.id)+(select count(*) from public.team_invitations where team_id=t.id and expires_at>now() and accepted_at is null and revoked_at is null) into used;
    if used>=lim then raise exception 'All seats are in use or reserved by invitations.'; end if;
    if length(p_data->>'token_hash')<>64 then raise exception 'Invalid invitation token.'; end if;
    insert into public.team_invitations(team_id,email,token_hash) values(t.id,mail,p_data->>'token_hash') returning * into inv;
    return jsonb_build_object('id',inv.id,'email',mail,'expires_at',inv.expires_at);
  elsif p_action='revoke' then
    update public.team_invitations set revoked_at=now() where id=(p_data->>'id')::uuid and team_id=t.id and accepted_at is null;
  elsif p_action='remove' then
    target:=(p_data->>'user_id')::uuid;
    if target=u then raise exception 'The owner cannot be removed.'; end if;
    delete from public.team_members where team_id=t.id and user_id=target;
  elsif p_action='rename' then
    update public.teams set name=btrim(p_data->>'name') where id=t.id;
  else raise exception 'Unknown team action.';
  end if;
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.team_seat_limit(uuid),public.active_team_owner(uuid),public.my_team_owner(),public.manage_team(text,jsonb) from public,anon,authenticated;
grant execute on function public.team_seat_limit(uuid),public.active_team_owner(uuid) to service_role;
grant execute on function public.my_team_owner(),public.manage_team(text,jsonb) to authenticated,service_role;
-- RLS template policies call this function as the authenticated role.
grant execute on function public.team_seat_limit(uuid) to authenticated;
grant select on public.teams,public.team_members,public.team_invitations,public.quote_attachments to authenticated;
grant select,insert,update,delete on public.terms_templates to authenticated;
grant all on public.teams,public.team_members,public.team_invitations,public.terms_templates,public.quote_attachments to service_role;
create table public.checkout_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  key uuid not null default gen_random_uuid(),
  plan text not null check(plan in ('solo','crew','builder')),
  pending_until timestamptz,
  created_at timestamptz not null default now()
);
alter table public.checkout_attempts enable row level security;
create function public.claim_checkout(p_plan text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.checkout_attempts; u uuid:=auth.uid();
begin
  if u is null or p_plan not in ('solo','crew','builder') then raise exception 'Invalid checkout.'; end if;
  insert into public.checkout_attempts(user_id,plan) values(u,p_plan) on conflict(user_id) do nothing;
  select * into a from public.checkout_attempts where user_id=u for update;
  if a.pending_until>now() then raise exception 'Checkout is opening. Please wait a moment and try again.'; end if;
  if a.created_at < now()-interval '29 minutes' then
    update public.checkout_attempts set key=gen_random_uuid(),plan=p_plan,created_at=now() where user_id=u returning * into a;
  elsif a.plan<>p_plan then
    update public.checkout_attempts set key=gen_random_uuid(),plan=p_plan,created_at=now() where user_id=u returning * into a;
  end if;
  update public.checkout_attempts set pending_until=now()+interval '5 minutes' where user_id=u;
  return jsonb_build_object('key',a.key,'plan',a.plan,'created_at',a.created_at);
end $$;
revoke all on function public.claim_checkout(text) from public,anon;
grant execute on function public.claim_checkout(text) to authenticated,service_role;
grant all on public.checkout_attempts to service_role;
create function public.team_roster() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare t public.teams;
begin
  select * into t from public.teams where owner_id=auth.uid();
  if not found then return jsonb_build_object('members','[]'::jsonb,'invitations','[]'::jsonb); end if;
  return jsonb_build_object('members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'email',u.email,'owner',m.user_id=t.owner_id)),'[]'::jsonb) from public.team_members m join auth.users u on u.id=m.user_id where m.team_id=t.id),
    'invitations',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'email',email,'expires_at',expires_at)),'[]'::jsonb) from public.team_invitations where team_id=t.id and accepted_at is null and revoked_at is null and expires_at>now()));
end $$;
create function public.save_client_contact(p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); book uuid; c public.clients; mail text:=nullif(lower(btrim(p_data->>'email')),'');
begin
  if u is null then raise exception 'Sign in first.'; end if;
  if length(btrim(p_data->>'name')) not between 1 and 150 or p_data->>'name' is null or length(coalesce(p_data->>'address',''))>500 or length(coalesce(p_data->>'phone',''))>100 or length(coalesce(mail,''))>254 then raise exception 'Invalid contact details.'; end if;
  if mail is not null and mail !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid email.'; end if;
  book:=coalesce(public.active_team_owner(u),u);
  perform pg_advisory_xact_lock(hashtextextended(book::text,0));
  if p_data->>'id' is not null then
    select * into c from public.clients where id=(p_data->>'id')::uuid and user_id=book for update;
    if not found then raise exception 'Client not found.'; end if;
  elsif mail is not null then
    select * into c from public.clients where user_id=book and lower(email)=mail order by created_at limit 1 for update;
  end if;
  if c.id is null then
    insert into public.clients(user_id,name,email,phone,address) values(book,btrim(p_data->>'name'),mail,nullif(btrim(p_data->>'phone'),''),nullif(btrim(p_data->>'address'),'')) returning * into c;
  else
    update public.clients set name=btrim(p_data->>'name'),email=mail,phone=nullif(btrim(p_data->>'phone'),''),address=nullif(btrim(p_data->>'address'),'') where id=c.id returning * into c;
  end if;
  return jsonb_build_object('id',c.id,'name',c.name,'email',c.email,'phone',c.phone,'address',c.address);
end $$;
revoke all on function public.team_roster(),public.save_client_contact(jsonb) from public,anon;
grant execute on function public.team_roster(),public.save_client_contact(jsonb) to authenticated,service_role;
create function public.finish_checkout(p_key uuid) returns void language sql security definer set search_path=public,pg_temp as $$
  update public.checkout_attempts set pending_until=null where user_id=auth.uid() and key=p_key;
$$;
revoke all on function public.finish_checkout(uuid) from public,anon;
grant execute on function public.finish_checkout(uuid) to authenticated,service_role;
alter table public.subscriptions add column stripe_created_at bigint, add column stripe_observed_at timestamptz;
-- Service-only, atomic reconciliation: old subscriptions and late API reads cannot win.
create function public.sync_stripe_subscription(p_data jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.subscriptions; observed timestamptz:=(p_data->>'observed_at')::timestamptz; created bigint:=(p_data->>'created')::bigint;
begin
  select * into s from public.subscriptions where stripe_customer_id=p_data->>'customer' for update;
  if not found then raise exception 'Subscription customer is not mapped yet.'; end if;
  if p_data->>'user_id' is not null and s.user_id<>(p_data->>'user_id')::uuid then raise exception 'Subscription account does not match.'; end if;
  if s.stripe_subscription_id is distinct from p_data->>'id' and coalesce(s.stripe_created_at,0)>created then return; end if;
  if s.stripe_subscription_id=p_data->>'id' and s.stripe_observed_at>observed then return; end if;
  if p_data->>'plan' not in ('solo','crew','builder') or created is null or observed is null then raise exception 'Invalid subscription state.'; end if;
  update public.subscriptions set stripe_subscription_id=p_data->>'id',status=p_data->>'status',plan=p_data->>'plan',
    current_period_end=(p_data->>'period_end')::timestamptz,stripe_created_at=created,stripe_observed_at=observed,updated_at=now() where user_id=s.user_id;
end $$;
revoke all on function public.sync_stripe_subscription(jsonb) from public,anon,authenticated;
grant execute on function public.sync_stripe_subscription(jsonb) to service_role;
-- Private photo registration shares the quote lock with sending/acceptance.
create function public.register_quote_photo(p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare q public.quotes; u uuid:=(p_data->>'user_id')::uuid; a public.quote_attachments;
begin
  select * into q from public.quotes where id=(p_data->>'quote_id')::uuid and user_id=u and deleted_at is null for update;
  if not found or q.status<>'draft' then raise exception 'Only draft quotes can accept photos.'; end if;
  if public.team_seat_limit(coalesce(public.active_team_owner(u),u))<5 then raise exception 'A team plan is required.'; end if;
  if (select count(*) from public.quote_attachments where quote_id=q.id and deleted_at is null)>=8 then raise exception 'Maximum 8 photos.'; end if;
  if p_data->>'path' not like u::text||'/'||q.id::text||'/%' then raise exception 'Invalid photo path.'; end if;
  insert into public.quote_attachments(quote_id,user_id,path,name,content_type) values(q.id,u,p_data->>'path',left(p_data->>'name',150),'image/jpeg') returning * into a;
  return jsonb_build_object('id',a.id,'name',a.name);
end $$;
create function public.remove_quote_photo(p_id uuid,p_user uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare q public.quotes;
begin
  select quotes.* into q from public.quotes quotes join public.quote_attachments a on a.quote_id=quotes.id where a.id=p_id and quotes.user_id=p_user and quotes.deleted_at is null for update of quotes;
  if not found or q.status<>'draft' then raise exception 'Only draft photos can be removed.'; end if;
  update public.quote_attachments set deleted_at=now() where id=p_id and user_id=p_user;
end $$;
revoke all on function public.register_quote_photo(jsonb),public.remove_quote_photo(uuid,uuid) from public,anon,authenticated;
grant execute on function public.register_quote_photo(jsonb),public.remove_quote_photo(uuid,uuid) to service_role;
commit;
