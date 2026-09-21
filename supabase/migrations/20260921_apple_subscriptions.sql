begin;
set local lock_timeout = '5s';
create table if not exists public.apple_subscriptions (
  environment text not null check(environment in ('Production','Sandbox')),
  original_transaction_id text not null,
  transaction_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  account_token uuid not null,
  product_id text not null,
  plan text not null check(plan in ('solo','crew','builder')),
  status text not null check(status in ('active','grace','expired','retry','revoked')),
  expires_at timestamptz not null,
  access_until timestamptz not null,
  signed_at timestamptz not null,
  observed_at timestamptz not null,
  auto_renews boolean not null,
  updated_at timestamptz not null default now(),
  primary key(environment,original_transaction_id)
);
create index if not exists apple_subscriptions_user on public.apple_subscriptions(user_id);
alter table public.apple_subscriptions enable row level security;
revoke all on public.apple_subscriptions from public,anon,authenticated;
grant all on public.apple_subscriptions to service_role;
-- Minimal transaction lineage is retained after deletion to prevent restoring
-- a deleted account's purchase onto another account. Personal content is not
-- stored here. Operator retention policy must cover this billing record.
create table if not exists public.apple_notification_events (
  id uuid primary key, payload_hash text not null, notification_type text not null,
  received_at timestamptz not null default now(), handled_at timestamptz
);
alter table public.apple_notification_events enable row level security;
revoke all on public.apple_notification_events from public,anon,authenticated;
grant all on public.apple_notification_events to service_role;

create or replace function public.record_apple_notification(p_id uuid,p_hash text,p_type text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare event public.apple_notification_events;
begin
  insert into public.apple_notification_events(id,payload_hash,notification_type) values(p_id,p_hash,p_type) on conflict(id) do nothing;
  select * into event from public.apple_notification_events where id=p_id;
  if event.payload_hash<>p_hash then raise exception 'Notification identifier reused' using errcode='23505'; end if;
  return jsonb_build_object('handled',event.handled_at is not null);
end $$;
create or replace function public.finish_apple_notification(p_id uuid)
returns void language sql security definer set search_path='' as $$ update public.apple_notification_events set handled_at=now() where id=p_id; $$;

create or replace function public.apply_apple_subscription(p_state jsonb,p_event_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior public.apple_subscriptions; actor uuid:=(p_state->>'accountToken')::uuid; owner_exists boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended((p_state->>'environment')||':'||(p_state->>'originalTransactionID'),0));
  select * into prior from public.apple_subscriptions where environment=p_state->>'environment' and original_transaction_id=p_state->>'originalTransactionID' for update;
  if found and prior.account_token<>actor then raise exception 'Purchase belongs to another account' using errcode='42501'; end if;
  if found and prior.observed_at>(p_state->>'observedAt')::timestamptz then
    if p_event_id is not null then perform public.finish_apple_notification(p_event_id); end if;
    return jsonb_build_object('ok',true,'stale',true);
  end if;
  select exists(select from auth.users where id=actor) into owner_exists;
  -- Deleted accounts stay detached even if that UUID is reintroduced later.
  if prior.original_transaction_id is not null and prior.user_id is null then owner_exists:=false; end if;
  insert into public.apple_subscriptions(environment,original_transaction_id,transaction_id,user_id,account_token,product_id,plan,status,expires_at,access_until,signed_at,observed_at,auto_renews)
  values(p_state->>'environment',p_state->>'originalTransactionID',p_state->>'transactionID',case when owner_exists then actor else null end,actor,p_state->>'productID',p_state->>'plan',p_state->>'status',
    (p_state->>'expiresAt')::timestamptz,(p_state->>'accessUntil')::timestamptz,(p_state->>'signedAt')::timestamptz,(p_state->>'observedAt')::timestamptz,(p_state->>'autoRenews')::boolean)
  on conflict(environment,original_transaction_id) do update set transaction_id=excluded.transaction_id,product_id=excluded.product_id,plan=excluded.plan,status=excluded.status,
    expires_at=excluded.expires_at,access_until=excluded.access_until,signed_at=excluded.signed_at,observed_at=excluded.observed_at,auto_renews=excluded.auto_renews,updated_at=now();
  if p_event_id is not null then perform public.finish_apple_notification(p_event_id); end if;
  return jsonb_build_object('ok',true,'attached',owner_exists);
end $$;

-- Entitlements from independent billing sources are combined, never overwritten.
create or replace function public.effective_subscription(p_user uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('plan',plan,'source',source,'expiresAt',expires_at) from (
    select case when plan='pro_monthly' then 'solo' else plan end as plan,'stripe' as source,current_period_end::timestamptz as expires_at
      from public.subscriptions where user_id=p_user and status in ('active','trialing','past_due') and current_period_end::timestamptz>now()
    union all
    select plan,'apple' as source,access_until as expires_at from public.apple_subscriptions where user_id=p_user and status in ('active','grace') and access_until>now()
  ) entitled where plan in ('solo','crew','builder')
  order by case plan when 'builder' then 20 when 'crew' then 5 else 1 end desc,expires_at desc limit 1;
$$;
create or replace function public.team_seat_limit(p_owner uuid) returns integer
language sql stable security definer set search_path='' as $$
  select case public.effective_subscription(p_owner)->>'plan' when 'crew' then 5 when 'builder' then 20 else 0 end;
$$;
create or replace function public.prevent_apple_team_overlap() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select from public.teams where id=new.team_id and owner_id<>new.user_id)
    and exists(select from public.apple_subscriptions where user_id=new.user_id and ((status in ('active','grace') and access_until>now()) or auto_renews and status='retry')) then
    raise exception 'This account has an Apple subscription. Manage it before joining a team.' using errcode='22023';
  end if;
  return new;
end $$;
drop trigger if exists prevent_apple_team_overlap on public.team_members;
create trigger prevent_apple_team_overlap before insert on public.team_members for each row execute function public.prevent_apple_team_overlap();
revoke all on function public.record_apple_notification(uuid,text,text),public.finish_apple_notification(uuid),public.apply_apple_subscription(jsonb,uuid),public.effective_subscription(uuid) from public,anon,authenticated;
grant execute on function public.record_apple_notification(uuid,text,text),public.finish_apple_notification(uuid),public.apply_apple_subscription(jsonb,uuid),public.effective_subscription(uuid) to service_role;
notify pgrst,'reload schema';
commit;
