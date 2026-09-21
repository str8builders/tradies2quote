begin;
set local lock_timeout = '5s';
create table if not exists public.account_deletion_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  last_attempt_at timestamptz not null default now()
);
alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from public,anon,authenticated;
grant select on public.account_deletion_requests to authenticated;
grant all on public.account_deletion_requests to service_role;
drop policy if exists own_deletion_request on public.account_deletion_requests;
create policy own_deletion_request on public.account_deletion_requests for select to authenticated using(user_id=auth.uid());

create or replace function public.begin_account_deletion(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  -- Same lock as write guards: prior writes finish before the durable marker.
  perform pg_advisory_xact_lock(hashtextextended('account-delete:'||p_user::text,0));
  insert into public.account_deletion_requests(user_id) values(p_user)
    on conflict(user_id) do update set last_attempt_at=now();
end $$;
revoke all on function public.begin_account_deletion(uuid) from public,anon,authenticated;
grant execute on function public.begin_account_deletion(uuid) to service_role;

create or replace function public.claim_account_deletions(p_limit integer default 5)
returns table(user_id uuid) language sql security definer set search_path='' as $$
  with due as (
    select r.user_id from public.account_deletion_requests r
    where r.last_attempt_at < now()-interval '10 minutes'
    order by r.last_attempt_at,r.user_id limit greatest(1,least(coalesce(p_limit,5),10)) for update skip locked
  ), claimed as (
    update public.account_deletion_requests r set last_attempt_at=now()
    from due where r.user_id=due.user_id returning r.user_id
  ) select * from claimed;
$$;
revoke all on function public.claim_account_deletions(integer) from public,anon,authenticated;
grant execute on function public.claim_account_deletions(integer) to service_role;

create or replace function public.reject_writes_during_account_deletion() returns trigger
language plpgsql security definer set search_path='' as $$
declare row_data jsonb:=to_jsonb(new); owners uuid[]:='{}'; actor uuid; target uuid; candidate text;
begin
  if tg_table_schema='storage' then
    -- Covers ordinary user uploads, service-role paths and quote signatures.
    -- Parse only validated UUIDs; use indexed lookups, never scan all accounts
    -- or quotes for each upload. Lock even before a deletion marker exists.
    for candidate in select v from unnest(array[row_data->>'owner_id',row_data->>'owner',split_part(row_data->>'name','/',1)]) v loop
      if candidate ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        owners:=array_append(owners,candidate::uuid);
        select user_id into target from public.quotes where id=candidate::uuid;
        owners:=array_append(owners,target);
      end if;
    end loop;
  else
    if row_data->>'user_id' is not null then owners:=array_append(owners,(row_data->>'user_id')::uuid); end if;
    if row_data->>'owner_id' is not null then owners:=array_append(owners,(row_data->>'owner_id')::uuid); end if;
    if tg_table_name='profiles' then owners:=array_append(owners,(row_data->>'id')::uuid); end if;
    if row_data->>'quote_id' is not null then
      select user_id into target from public.quotes where id=(row_data->>'quote_id')::uuid;
      owners:=array_append(owners,target);
    end if;
    if row_data->>'team_id' is not null then
      select owner_id into target from public.teams where id=(row_data->>'team_id')::uuid;
      owners:=array_append(owners,target);
    end if;
  end if;
  for actor in select distinct v from unnest(owners) v where v is not null order by v loop
    perform pg_advisory_xact_lock(hashtextextended('account-delete:'||actor::text,0));
    if exists(select from public.account_deletion_requests where user_id=actor) then
      raise exception 'Account deletion is in progress. Retry deletion from Settings or contact support.' using errcode='42501';
    end if;
  end loop;
  return new;
end $$;
revoke all on function public.reject_writes_during_account_deletion() from public,anon,authenticated;

-- Apply only to owned application records and storage metadata. Billing
-- tombstones can still detach user_id to NULL when auth removes the account.
do $$ declare t record; begin
  for t in select distinct c.table_name from information_schema.columns c
    join information_schema.tables b on b.table_schema=c.table_schema and b.table_name=c.table_name
    where c.table_schema='public' and b.table_type='BASE TABLE'
      and c.table_name<>'account_deletion_requests'
      and ((c.column_name in ('user_id','owner_id','quote_id','team_id') and c.udt_name='uuid') or c.table_name='profiles' and c.column_name='id')
  loop
    execute format('drop trigger if exists account_deletion_write_guard on public.%I',t.table_name);
    execute format('create trigger account_deletion_write_guard before insert or update on public.%I for each row execute function public.reject_writes_during_account_deletion()',t.table_name);
  end loop;
end $$;
drop trigger if exists account_deletion_write_guard on storage.objects;
create trigger account_deletion_write_guard before insert or update on storage.objects for each row execute function public.reject_writes_during_account_deletion();
notify pgrst,'reload schema';
commit;
