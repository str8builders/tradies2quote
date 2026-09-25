-- Location (20260928_location.sql): consent, clock in/out, route points,
-- job sites, who sees what, the 90-day purge, and travel on invoices.
-- Run against an isolated restored database only. All fixtures roll back.
\set ON_ERROR_STOP on
begin;
do $$ begin if current_database() not like 't2q_release_audit_%' then raise exception 'Isolated test database required'; end if; end $$;
create function pg_temp.assert_true(ok boolean, label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
create function pg_temp.assert_rejected(statement text, expected text) returns void language plpgsql as $$ begin begin execute statement; exception when others then if position(expected in sqlerrm)>0 then raise notice 'PASS: rejected %',expected; return; end if; raise; end; raise exception 'FAIL: statement was allowed: %',statement; end $$;
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, true), set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
$$;

insert into auth.users(id,email,email_confirmed_at,aud,role,created_at,updated_at) values
  ('d1000000-0000-0000-0000-000000000001','t2q-loc-owner@example.invalid',now(),'authenticated','authenticated',now(),now()),
  ('d1000000-0000-0000-0000-000000000002','t2q-loc-member@example.invalid',now(),'authenticated','authenticated',now(),now()),
  ('d1000000-0000-0000-0000-000000000003','t2q-loc-other@example.invalid',now(),'authenticated','authenticated',now(),now());
insert into public.subscriptions(user_id,stripe_customer_id,plan,status,current_period_end)
  values('d1000000-0000-0000-0000-000000000001','cus_loc_fixture','crew','active',now()+interval '30 days');
insert into public.clients(id,user_id,name,address) values
  ('d2000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','Site client','14 Kauri Street, Tauranga'),
  ('d2000000-0000-0000-0000-000000000003','d1000000-0000-0000-0000-000000000003','Other client',null);
set local role authenticated;
select pg_temp.as_user('d1000000-0000-0000-0000-000000000001');
select public.manage_team('create','{"name":"Location Crew"}');
reset role;
insert into public.team_members(user_id, team_id)
  select 'd1000000-0000-0000-0000-000000000002', id from public.teams where owner_id='d1000000-0000-0000-0000-000000000001';

set local role authenticated;
-- Member: no consent yet, so clocking in keeps no pin and points are dropped.
select pg_temp.as_user('d1000000-0000-0000-0000-000000000002');
create temp table s1 as select public.clock_in(null, -37.68, 176.16, 8, 'Somewhere', null, 'tap') as id;
select pg_temp.assert_true((select start_lat is null and owner_id='d1000000-0000-0000-0000-000000000001' from public.work_sessions where id=(select id from s1)),'no pin without consent; hours belong to the owner''s business');
select pg_temp.assert_true(public.add_location_points(null, jsonb_build_array(jsonb_build_object('t', extract(epoch from now())*1000, 'lat', -37.68, 'lng', 176.16)))=0,'no route points without consent');
select pg_temp.assert_rejected($q$select public.clock_in()$q$,'Already clocked in');
select pg_temp.assert_rejected($q$insert into public.work_sessions(owner_id,user_id,started_at) values('d1000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000002',now())$q$,'permission denied');

-- Member turns location on (for their business, not their own).
select pg_temp.assert_rejected($q$insert into public.location_consents(user_id,owner_id,granted) values('d1000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000002',true)$q$,'row-level security');
insert into public.location_consents(user_id,owner_id,granted,granted_at,auto_clock) values('d1000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000001',true,now(),true);
select pg_temp.assert_true(public.add_location_points(null, jsonb_build_array(
  jsonb_build_object('t', extract(epoch from now())*1000, 'lat', -37.680, 'lng', 176.160, 'acc', 8),
  jsonb_build_object('t', extract(epoch from now())*1000, 'lat', -37.690, 'lng', 176.170, 'acc', 8),
  jsonb_build_object('t', extract(epoch from now() - interval '2 days')*1000, 'lat', -37.7, 'lng', 176.2),
  jsonb_build_object('t', extract(epoch from now())*1000, 'lat', 99, 'lng', 176.2)))=2,'points while clocked in, inside the session, valid only');
select pg_temp.assert_rejected($q$select public.add_location_points('d1000000-0000-0000-0000-000000000001', '[]'::jsonb)$q$,'Not yours');
select pg_temp.assert_rejected($q$insert into public.location_points(session_id,owner_id,user_id,recorded_at,latitude,longitude) select id,'d1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000002',now(),0,0 from s1$q$,'permission denied');

-- Job sites: a member can pin the business's client, not another business's.
insert into public.job_sites(client_id,owner_id,latitude,longitude,source) values('d2000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001',-37.6812,176.1654,'pinned');
select pg_temp.assert_rejected($q$insert into public.job_sites(client_id,owner_id,latitude,longitude) values('d2000000-0000-0000-0000-000000000003','d1000000-0000-0000-0000-000000000003',0,0)$q$,'row-level security');

-- Clock out makes the hours, in the business's time zone.
reset role;
update public.work_sessions set started_at = (date_trunc('day', now() at time zone 'Pacific/Auckland') - interval '1 day' + interval '7 hours') at time zone 'Pacific/Auckland' where id=(select id from s1);
set local role authenticated;
select pg_temp.as_user('d1000000-0000-0000-0000-000000000002');
create temp table out1 as select public.clock_out(
  (date_trunc('day', now() at time zone 'Pacific/Auckland') - interval '1 day' + interval '15 hours 30 minutes') at time zone 'Pacific/Auckland',
  -37.681, 176.165, 6, 'At Site client', 'd2000000-0000-0000-0000-000000000001', 30, 'Pacific/Auckland') as r;
select pg_temp.assert_true((select start_time='07:00' and end_time='15:30' and break_minutes=30 and client_id='d2000000-0000-0000-0000-000000000001'
  and owner_id='d1000000-0000-0000-0000-000000000001' and session_id=(select id from s1)
  from public.time_entries where id=(select (r->>'time_entry_id')::uuid from out1)),'clocking out makes 7:00 to 3:30 with the break, for the client');
select pg_temp.assert_true((select end_place='At Site client' and ended_at is not null from public.work_sessions where id=(select id from s1)),'finish pin kept');
select pg_temp.assert_rejected($q$select public.clock_out()$q$,'Not clocked in');
select pg_temp.assert_true(public.add_location_points(null, jsonb_build_array(jsonb_build_object('t', extract(epoch from now())*1000, 'lat', -37.68, 'lng', 176.16)))=0,'no points once clocked out');
select pg_temp.assert_rejected($q$select public.clock_in(now() - interval '13 hours')$q$,'out of range');
select pg_temp.assert_rejected($q$select public.clock_in(now() + interval '1 hour')$q$,'out of range');

-- Who sees what.
select pg_temp.as_user('d1000000-0000-0000-0000-000000000001');
select pg_temp.assert_true((select count(*) from public.work_sessions)=1 and (select count(*) from public.location_points)=2 and (select count(*) from public.location_consents)=1,'the owner sees the team''s sessions, route and consent');
select pg_temp.as_user('d1000000-0000-0000-0000-000000000003');
select pg_temp.assert_true((select count(*) from public.work_sessions)=0 and (select count(*) from public.location_points)=0 and (select count(*) from public.job_sites)=0,'another business sees nothing');
select pg_temp.assert_rejected($q$select public.purge_location_history()$q$,'permission denied');

-- Travel on a timesheet invoice: allowed as km lines; anything else still refused.
select pg_temp.as_user('d1000000-0000-0000-0000-000000000001');
select pg_temp.assert_rejected(format($q$select public.create_timesheet_invoice(array[%L]::uuid[],'d2000000-0000-0000-0000-000000000001',
  '{"currency":"NZD","line_items":[{"type":"labour","description":"Labour","quantity":8,"unit":"h","unit_price":80,"line_total":640},{"type":"other","description":"Travel","quantity":10,"unit":"each","unit_price":1,"line_total":10}],"subtotal_before_tax":650,"tax_amount":97.5,"total":747.5}'::jsonb)$q$,
  (select r->>'time_entry_id' from out1)),'travel in km');
create temp table inv as select public.create_timesheet_invoice(array[(select (r->>'time_entry_id')::uuid from out1)],'d2000000-0000-0000-0000-000000000001',
  '{"client":{"name":"Site client","email":null,"address":null,"phone":null},"job_summary":"Labour","currency":"NZD","tax_label":"GST","tax_rate":15,"markup_pct":0,"markup_amount":0,"materials_subtotal":35,"labour_subtotal":640,"terms":"","notes":[],"line_items":[{"type":"labour","description":"Labour, today","quantity":8,"unit":"h","unit_price":80,"line_total":640},{"type":"other","description":"Travel, today","quantity":35,"unit":"km","unit_price":1,"line_total":35}],"subtotal_before_tax":675,"tax_amount":101.25,"total":776.25}'::jsonb) as r;
select pg_temp.assert_true((select total_amount=776.25 from public.invoices where id=(select (r->>'invoice_id')::uuid from inv)),'labour plus travel invoiced');

-- The purge: route points and unbilled pins go after 90 days; billed pins stay.
reset role;
update public.location_points set recorded_at = now() - interval '91 days';
update public.work_sessions set started_at = now() - interval '91 days', ended_at = now() - interval '91 days' + interval '8 hours';
select pg_temp.assert_true((public.purge_location_history()->>'points')::int = 2,'route points older than 90 days deleted');
select pg_temp.assert_true((select end_place is not null from public.work_sessions limit 1),'pins on invoiced hours kept');
update public.invoices set deleted_at = now() where id=(select (r->>'invoice_id')::uuid from inv);
create temp table purged as select public.purge_location_history() as r;
select pg_temp.assert_true((select (r->>'pins')::int from purged) = 1 and (select end_place is null and end_lat is null from public.work_sessions limit 1),'unbilled pins cleared after 90 days');
rollback;
\echo 'Location consent, clock in/out, route, sites, access, purge and travel checks passed.'
