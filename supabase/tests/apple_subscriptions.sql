\set ON_ERROR_STOP on
begin;
do $$ begin
 if current_database() !~ '^t2q_native_rehearsal_[0-9]{8}$' then raise exception 'Refusing to seed a non-rehearsal database'; end if;
end $$;
set local session_replication_role = replica;
insert into auth.users(id,email) values
 ('10101010-1010-4010-8010-101010101010','alice@example.invalid'),
 ('20202020-2020-4020-8020-202020202020','bob@example.invalid') on conflict do nothing;
set local session_replication_role = origin;
do $$
declare actor uuid:='10101010-1010-4010-8010-101010101010'; state jsonb; result jsonb;
begin
 state:=jsonb_build_object('environment','Sandbox','originalTransactionID','test-original','transactionID','test-renewal',
  'accountToken',actor,'productID','com.str8builders.tradies2quote.crew.monthly','plan','crew','status','active',
  'expiresAt',now()+interval '1 day','accessUntil',now()+interval '1 day','signedAt',now(),'observedAt',now(),'autoRenews',true);
 perform public.apply_apple_subscription(state);
 if public.effective_subscription(actor)->>'source'<>'apple' or public.team_seat_limit(actor)<>5 then raise exception 'Apple entitlement not granted'; end if;
 perform public.apply_apple_subscription(state);
 if (select count(*) from public.apple_subscriptions where user_id=actor)<>1 then raise exception 'Duplicate renewal'; end if;
 begin
  perform public.apply_apple_subscription(jsonb_set(state,'{accountToken}','"20202020-2020-4020-8020-202020202020"'));
  raise exception 'Purchase reassigned';
 exception when insufficient_privilege then null; end;
 result:=public.apply_apple_subscription(state||jsonb_build_object('observedAt',now()-interval '1 day','status','revoked'));
 if result->>'stale'<>'true' or public.effective_subscription(actor)->>'plan'<>'crew' then raise exception 'Out of order observation changed access'; end if;
 perform public.apply_apple_subscription(state||jsonb_build_object('observedAt',now()+interval '1 second','status','revoked','accessUntil',now()));
 if public.effective_subscription(actor) is not null then raise exception 'Refund retained access'; end if;
 perform public.apply_apple_subscription(state||jsonb_build_object('observedAt',now()+interval '2 seconds','status','grace'));
 if public.effective_subscription(actor)->>'plan'<>'crew' then raise exception 'Grace not granted'; end if;
 perform public.apply_apple_subscription(state||jsonb_build_object('observedAt',now()+interval '3 seconds','status','retry'));
 if public.effective_subscription(actor) is not null then raise exception 'Retry granted access without grace'; end if;
 -- Replayed notification UUID is idempotent, but cannot be reused for another payload.
 result:=public.record_apple_notification('40404040-4040-4040-8040-404040404040','hash-a','DID_RENEW');
 if result->>'handled'<>'false' then raise exception 'New event marked handled'; end if;
 perform public.finish_apple_notification('40404040-4040-4040-8040-404040404040');
 result:=public.record_apple_notification('40404040-4040-4040-8040-404040404040','hash-a','DID_RENEW');
 if result->>'handled'<>'true' then raise exception 'Replay not identified'; end if;
 begin
  perform public.record_apple_notification('40404040-4040-4040-8040-404040404040','hash-b','DID_RENEW');
  raise exception 'Notification payload replaced';
 exception when unique_violation then null; end;
 delete from auth.users where id=actor;
 if exists(select from public.apple_subscriptions where user_id=actor) then raise exception 'Deleted account remains attached'; end if;
 perform public.apply_apple_subscription(state||jsonb_build_object('observedAt',now()+interval '4 seconds'));
 if public.effective_subscription(actor) is not null then raise exception 'Deleted account restored'; end if;
end $$;
set local role authenticated;
do $$ begin
 begin
  perform public.apply_apple_subscription('{}');
  raise exception 'Untrusted account granted itself access';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: Apple renewal idempotency, ownership, stale events, refunds, grace, retry, notification replay, deleted account, service-role boundary' as result;
