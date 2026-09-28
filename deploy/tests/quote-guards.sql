-- Run against an isolated restored database only. All fixtures roll back.
-- Covers 20260929_quote_chat_history_guard.sql and 20260929_quote_acceptance_guard.sql.
\set ON_ERROR_STOP on
begin;
do $$ begin if current_database() not like 't2q_release_audit_%' then raise exception 'Isolated test database required'; end if; end $$;
create function pg_temp.assert_true(ok boolean, label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
create function pg_temp.assert_rejected(statement text, expected text) returns void language plpgsql as $$ begin begin execute statement; exception when others then if position(expected in sqlerrm)>0 then raise notice 'PASS: rejected %',expected; return; end if; raise; end; raise exception 'FAIL: statement was allowed: %',statement; end $$;

insert into auth.users(id,email,email_confirmed_at,aud,role,created_at,updated_at)
values ('c1000000-0000-0000-0000-000000000001','t2q-guard-fixture@example.invalid',now(),'authenticated','authenticated',now(),now());

-- A new quote never starts with chat copied from another quote.
insert into public.quotes(id,user_id,public_token,status,total_amount,currency,quote_data)
values ('d1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','guard-fixture-token','draft',115,'NZD',
  '{"job_summary":"Deck","total":115,"chat_history":[{"role":"customer","content":"copied"}]}');
select pg_temp.assert_true((select not (quote_data ? 'chat_history') from public.quotes where id='d1000000-0000-0000-0000-000000000001'),'insert drops copied chat history');

-- The client's chat is appended by the service role.
select public.append_quote_chat_messages('d1000000-0000-0000-0000-000000000001','[{"role":"customer","content":"Can you start Monday?"}]');
select pg_temp.assert_true((select jsonb_array_length(quote_data->'chat_history') from public.quotes where id='d1000000-0000-0000-0000-000000000001')=1,'append adds the message');
select pg_temp.assert_rejected($q$select public.append_quote_chat_messages('d1000000-0000-0000-0000-00000000ffff','[]')$q$,'Quote chat unavailable');

set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-000000000001',true);

-- The tradie saves the quote as their page loaded it (before the message).
update public.quotes set quote_data='{"job_summary":"Deck and steps","total":115,"chat_history":[]}'
where id='d1000000-0000-0000-0000-000000000001';
select pg_temp.assert_true((select quote_data->>'job_summary'='Deck and steps' and jsonb_array_length(quote_data->'chat_history')=1
  from public.quotes where id='d1000000-0000-0000-0000-000000000001'),'a stale save keeps the newer chat and saves the edit');
update public.quotes set quote_data='{"job_summary":"Deck, steps and rail","total":115}'
where id='d1000000-0000-0000-0000-000000000001';
select pg_temp.assert_true((select jsonb_array_length(quote_data->'chat_history')=1
  from public.quotes where id='d1000000-0000-0000-0000-000000000001'),'a save without chat keeps the chat');

-- Sending moves between editable statuses; locking is only for the job steps.
update public.quotes set status='sent', sent_at=now() where id='d1000000-0000-0000-0000-000000000001';
select pg_temp.assert_true((select status='sent' from public.quotes where id='d1000000-0000-0000-0000-000000000001'),'owner can mark a draft sent');
select pg_temp.assert_rejected($q$update public.quotes set status='accepted' where id='d1000000-0000-0000-0000-000000000001'$q$,'through the job steps');
select pg_temp.assert_rejected($q$update public.quotes set accepted_total=1 where id='d1000000-0000-0000-0000-000000000001'$q$,'cannot be edited');

reset role;
select pg_temp.assert_true((select public.accept_quote('guard-fixture-token','Sam','sam@example.invalid','d1000000-0000-0000-0000-000000000001/signature.png','127.0.0.1','test',115,
  (select version from public.quotes where id='d1000000-0000-0000-0000-000000000001'))->>'ok'='true'),'the client can accept');

set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-000000000001',true);
select pg_temp.assert_rejected($q$update public.quotes set status='draft' where id='d1000000-0000-0000-0000-000000000001'$q$,'through the job steps');
select pg_temp.assert_rejected($q$update public.quotes set signature_path='someone-else/signature.png' where id='d1000000-0000-0000-0000-000000000001'$q$,'cannot be edited');
select pg_temp.assert_rejected($q$update public.quotes set accepted_total=999 where id='d1000000-0000-0000-0000-000000000001'$q$,'cannot be edited');
select pg_temp.assert_rejected($q$update public.quotes set quote_data='{"job_summary":"Changed","total":999}' where id='d1000000-0000-0000-0000-000000000001'$q$,'locked after acceptance');
update public.quotes set scheduled_for='2026-10-05' where id='d1000000-0000-0000-0000-000000000001';
select pg_temp.assert_true((select scheduled_for='2026-10-05' from public.quotes where id='d1000000-0000-0000-0000-000000000001'),'owner can still set the job date');
select public.transition_quote_lifecycle('d1000000-0000-0000-0000-000000000001','scheduled','{}');
select pg_temp.assert_true((select status='scheduled' from public.quotes where id='d1000000-0000-0000-0000-000000000001'),'the job steps still move the quote on');

reset role;
select public.append_quote_chat_messages('d1000000-0000-0000-0000-000000000001','[{"role":"customer","content":"Thanks!"}]');
select pg_temp.assert_true((select jsonb_array_length(quote_data->'chat_history')=2 from public.quotes where id='d1000000-0000-0000-0000-000000000001'),'chat still appends after acceptance');
select pg_temp.assert_true((select status='scheduled' and accepted_total=115 from public.quotes where id='d1000000-0000-0000-0000-000000000001'),'acceptance record intact');

rollback;
\echo quote guards passed
