-- Timesheet access and invoicing (20260927_time_entries.sql).
-- Run against an isolated restored database only. All fixtures roll back.
\set ON_ERROR_STOP on
begin;
do $$ begin if current_database() not like 't2q_release_audit_%' then raise exception 'Isolated test database required'; end if; end $$;
create function pg_temp.assert_true(ok boolean, label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
create function pg_temp.assert_rejected(statement text, expected text) returns void language plpgsql as $$ begin begin execute statement; exception when others then if position(expected in sqlerrm)>0 then raise notice 'PASS: rejected %',expected; return; end if; raise; end; raise exception 'FAIL: statement was allowed: %',statement; end $$;
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, true), set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
$$;

-- O owns a crew business, M works for O, X is someone else entirely.
insert into auth.users(id,email,email_confirmed_at,aud,role,created_at,updated_at) values
  ('c1000000-0000-0000-0000-000000000001','t2q-ts-owner@example.invalid',now(),'authenticated','authenticated',now(),now()),
  ('c1000000-0000-0000-0000-000000000002','t2q-ts-member@example.invalid',now(),'authenticated','authenticated',now(),now()),
  ('c1000000-0000-0000-0000-000000000003','t2q-ts-other@example.invalid',now(),'authenticated','authenticated',now(),now());
insert into public.subscriptions(user_id,stripe_customer_id,plan,status,current_period_end)
  values('c1000000-0000-0000-0000-000000000001','cus_ts_fixture','crew','active',now()+interval '30 days');
insert into public.clients(id,user_id,name,email) values
  ('c2000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','Timesheet client','ts-client@example.invalid'),
  ('c2000000-0000-0000-0000-000000000003','c1000000-0000-0000-0000-000000000003','Other business client','ts-other@example.invalid');

set local role authenticated;
select pg_temp.as_user('c1000000-0000-0000-0000-000000000001');
select public.manage_team('create','{"name":"Timesheet Crew"}');
reset role;
insert into public.team_members(user_id, team_id)
  select 'c1000000-0000-0000-0000-000000000002', id from public.teams where owner_id='c1000000-0000-0000-0000-000000000001';

-- A member logs hours for the owner's business and client.
set local role authenticated;
select pg_temp.as_user('c1000000-0000-0000-0000-000000000002');
insert into public.time_entries(id,owner_id,user_id,client_id,work_date,start_time,end_time,break_minutes,note) values
  ('c3000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000002',
   'c2000000-0000-0000-0000-000000000001','2026-09-21','07:00','15:30',30,'Framing');
select pg_temp.assert_true((select count(*) from public.time_entries)=1,'member reads their own hours');
select pg_temp.assert_rejected($q$insert into public.time_entries(owner_id,user_id,work_date,start_time,end_time) values('c1000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000002','2026-09-21','07:00','08:00')$q$,'row-level security');
select pg_temp.assert_rejected($q$insert into public.time_entries(owner_id,user_id,client_id,work_date,start_time,end_time) values('c1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000002','c2000000-0000-0000-0000-000000000003','2026-09-21','07:00','08:00')$q$,'row-level security');
select pg_temp.assert_rejected($q$insert into public.time_entries(owner_id,user_id,work_date,start_time,end_time) values('c1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','2026-09-21','07:00','08:00')$q$,'row-level security');
select pg_temp.assert_rejected($q$insert into public.time_entries(owner_id,user_id,work_date,start_time,end_time,invoice_id) values('c1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000002','2026-09-21','07:00','08:00',gen_random_uuid())$q$,'permission denied');
select pg_temp.assert_rejected($q$insert into public.time_entries(owner_id,user_id,work_date,start_time,end_time) values('c1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000002','2026-09-21','15:00','07:00')$q$,'violates check constraint');
select pg_temp.assert_rejected($q$insert into public.time_entries(owner_id,user_id,work_date,start_time,end_time,break_minutes) values('c1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000002','2026-09-21','07:00','08:00',60)$q$,'time_entries_break');
select pg_temp.assert_rejected($q$select public.create_timesheet_invoice(array['c3000000-0000-0000-0000-000000000001']::uuid[],'c2000000-0000-0000-0000-000000000001','{}'::jsonb)$q$,'Client not found');

-- The owner logs their own hours and sees the whole team's.
select pg_temp.as_user('c1000000-0000-0000-0000-000000000001');
insert into public.time_entries(id,owner_id,user_id,client_id,work_date,start_time,end_time,break_minutes) values
  ('c3000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001',
   'c2000000-0000-0000-0000-000000000001','2026-09-21','07:00','12:00',0);
select pg_temp.assert_true((select count(*) from public.time_entries)=2,'owner reads the team''s hours');
with u as (update public.time_entries set note='owner edit' where id='c3000000-0000-0000-0000-000000000001' returning 1)
  select pg_temp.assert_true((select count(*) from u)=0,'owner cannot change a member''s row');
select pg_temp.assert_true(public.time_entry_hours('07:00','15:30',30)=8.00 and public.time_entry_hours('07:00','12:00',0)=5.00
  and public.time_entry_hours('06:45','15:05',20)=8.00,'hours from start, finish and break');

-- Someone else sees nothing.
select pg_temp.as_user('c1000000-0000-0000-0000-000000000003');
select pg_temp.assert_true((select count(*) from public.time_entries)=0,'another business sees no hours');

-- Invoicing: hours must match, then one invoice, then locked.
select pg_temp.as_user('c1000000-0000-0000-0000-000000000001');
select pg_temp.assert_rejected($q$select public.create_timesheet_invoice(array['c3000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000002']::uuid[],'c2000000-0000-0000-0000-000000000001',
  '{"currency":"NZD","line_items":[{"type":"labour","description":"Labour, Mon 21 Sept","quantity":12,"unit":"h","unit_price":80,"line_total":960}],"subtotal_before_tax":960,"tax_amount":144,"total":1104}'::jsonb)$q$,'must match the timesheet');
select pg_temp.assert_rejected($q$select public.create_timesheet_invoice(array['c3000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000002']::uuid[],'c2000000-0000-0000-0000-000000000001',
  '{"currency":"NZD","line_items":[{"type":"material","description":"Timber","quantity":13,"unit":"h","unit_price":80,"line_total":1040}],"subtotal_before_tax":1040,"tax_amount":156,"total":1196}'::jsonb)$q$,'labour hours');
create temp table billed as
  select public.create_timesheet_invoice(array['c3000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000002']::uuid[],'c2000000-0000-0000-0000-000000000001',
    '{"client":{"name":"Timesheet client","email":"ts-client@example.invalid","address":null,"phone":null},"job_summary":"Labour, 21 to 27 Sept","currency":"NZD","tax_label":"GST","tax_rate":15,"markup_pct":0,"markup_amount":0,"materials_subtotal":0,"labour_subtotal":1040,"terms":"","notes":[],"line_items":[{"type":"labour","description":"Labour, Mon 21 Sept","quantity":13,"unit":"h","unit_price":80,"line_total":1040}],"subtotal_before_tax":1040,"tax_amount":156,"total":1196}'::jsonb) as r;
select pg_temp.assert_true((select count(*) from public.invoices i join billed b on i.id=(b.r->>'invoice_id')::uuid where i.total_amount=1196 and i.status='draft')=1,'invoice made with the right total');
select pg_temp.assert_true((select status='completed' and client_id='c2000000-0000-0000-0000-000000000001' from public.quotes q join billed b on q.id=(b.r->>'quote_id')::uuid),'finished job saved for the client');
select pg_temp.assert_true((select count(*) from public.time_entries e join billed b on e.invoice_id=(b.r->>'invoice_id')::uuid)=2,'hours stamped with the invoice');
select pg_temp.assert_rejected($q$select public.create_timesheet_invoice(array['c3000000-0000-0000-0000-000000000002']::uuid[],'c2000000-0000-0000-0000-000000000001',
  '{"currency":"NZD","line_items":[{"type":"labour","description":"x","quantity":5,"unit":"h","unit_price":80,"line_total":400}],"subtotal_before_tax":400,"tax_amount":60,"total":460}'::jsonb)$q$,'already invoiced');

-- Billed hours are locked for the person who logged them; a deleted invoice frees them.
select pg_temp.as_user('c1000000-0000-0000-0000-000000000002');
with u as (update public.time_entries set note='changed' where id='c3000000-0000-0000-0000-000000000001' returning 1)
  select pg_temp.assert_true((select count(*) from u)=0,'billed hours cannot be changed');
with d as (delete from public.time_entries where id='c3000000-0000-0000-0000-000000000001' returning 1)
  select pg_temp.assert_true((select count(*) from d)=0,'billed hours cannot be deleted');
reset role;
update public.invoices set deleted_at=now() where id=(select (r->>'invoice_id')::uuid from billed);
set local role authenticated;
select pg_temp.as_user('c1000000-0000-0000-0000-000000000002');
with u as (update public.time_entries set note='after delete' where id='c3000000-0000-0000-0000-000000000001' returning 1)
  select pg_temp.assert_true((select count(*) from u)=1,'a deleted invoice frees its hours');
reset role;
rollback;
\echo 'Timesheet access, hours, invoicing and locking checks passed.'
