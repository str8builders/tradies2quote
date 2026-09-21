begin;
set local lock_timeout = '5s';
alter table public.apple_subscriptions add column if not exists last_reconcile_attempt_at timestamptz;
create index if not exists apple_subscriptions_reconcile_due on public.apple_subscriptions(last_reconcile_attempt_at) where user_id is not null;

-- Each batch claims under row locks. Failures rotate to the end of the queue
-- and become eligible again after 15 minutes instead of starving later rows.
create or replace function public.claim_apple_reconciliation(p_limit integer default 10)
returns table(environment text,original_transaction_id text,user_id uuid)
language sql security definer set search_path='' as $$
  with due as (
    select s.environment,s.original_transaction_id from public.apple_subscriptions s
    where s.user_id is not null
      and (s.last_reconcile_attempt_at is null or s.last_reconcile_attempt_at < now()-interval '15 minutes')
    order by s.last_reconcile_attempt_at nulls first,s.environment,s.original_transaction_id
    limit greatest(1,least(coalesce(p_limit,10),25)) for update skip locked
  ), claimed as (
    update public.apple_subscriptions s set last_reconcile_attempt_at=now()
    from due where s.environment=due.environment and s.original_transaction_id=due.original_transaction_id
    returning s.environment,s.original_transaction_id,s.user_id
  ) select * from claimed;
$$;
revoke all on function public.claim_apple_reconciliation(integer) from public,anon,authenticated;
grant execute on function public.claim_apple_reconciliation(integer) to service_role;
notify pgrst,'reload schema';
commit;
