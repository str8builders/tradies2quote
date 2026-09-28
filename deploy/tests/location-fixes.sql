-- Checked on a restored copy of production (28 Sep 2026).
-- Location fixes (20260929_location_fixes.sql) and the business time zone
-- (20260929_profiles_time_zone.sql): no route after the finish, no route for
-- a business the person no longer works for, leaving a team ends work for it,
-- remembered geocode misses, and the stored zone. Run against an isolated
-- restored database only, after both migrations. All fixtures roll back.
\set ON_ERROR_STOP on
begin;
do $$ begin if current_database() not like 't2q_release_audit_%' then raise exception 'Isolated test database required'; end if; end $$;
create function pg_temp.assert_true(ok boolean, label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
create function pg_temp.assert_rejected(statement text, expected text) returns void language plpgsql as $$ begin begin execute statement; exception when others then if position(expected in sqlerrm)>0 then raise notice 'PASS: rejected %',expected; return; end if; raise; end; raise exception 'FAIL: statement was allowed: %',statement; end $$;
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, true), set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
$$;

insert into auth.users(id,email,email_confirmed_at,aud,role,created_at,updated_at) values
  ('e1000000-0000-0000-0000-000000000001','t2q-fix-owner@example.invalid',now(),'authenticated','authenticated',now(),now()),
  ('e1000000-0000-0000-0000-000000000002','t2q-fix-member@example.invalid',now(),'authenticated','authenticated',now(),now()),
  ('e1000000-0000-0000-0000-000000000003','t2q-fix-solo@example.invalid',now(),'authenticated','authenticated',now(),now());
insert into public.subscriptions(user_id,stripe_customer_id,plan,status,current_period_end)
  values('e1000000-0000-0000-0000-000000000001','cus_locfix_fixture','crew','active',now()+interval '30 days');
insert into public.clients(id,user_id,name,address) values
  ('e2000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','Site client','14 Kauri Street, Tauranga'),
  ('e2000000-0000-0000-0000-000000000003','e1000000-0000-0000-0000-000000000003','Solo client','1 Nowhere Road');
insert into public.location_consents(user_id,owner_id,granted,granted_at) values
  ('e1000000-0000-0000-0000-000000000003','e1000000-0000-0000-0000-000000000003',true,now()),
  ('e1000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000001',true,now());
set local role authenticated;
select pg_temp.as_user('e1000000-0000-0000-0000-000000000001');
select public.manage_team('create','{"name":"Fix Crew"}');
reset role;
insert into public.team_members(user_id, team_id)
  select 'e1000000-0000-0000-0000-000000000002'::uuid, id from public.teams where owner_id='e1000000-0000-0000-0000-000000000001';

-- 1. The drive home after a (late) finish isn't kept as the job's route.
-- Yesterday in UTC: 9 am start, a point at 10 am, a finish at noon, a point at 4 pm.
create function pg_temp.yday(h int) returns timestamptz language sql as $$
  select (date_trunc('day', (now() - interval '1 day') at time zone 'UTC') + make_interval(hours => h)) at time zone 'UTC';
$$;
set local role authenticated;
select pg_temp.as_user('e1000000-0000-0000-0000-000000000003');
create temp table solo as select public.clock_in() as id;
reset role;
update public.work_sessions set started_at = pg_temp.yday(9) where id=(select id from solo);
insert into public.location_points(session_id,owner_id,user_id,recorded_at,latitude,longitude)
  select id,'e1000000-0000-0000-0000-000000000003'::uuid,'e1000000-0000-0000-0000-000000000003'::uuid,pg_temp.yday(10),-37.68,176.16 from solo
  union all
  select id,'e1000000-0000-0000-0000-000000000003'::uuid,'e1000000-0000-0000-0000-000000000003'::uuid,pg_temp.yday(16),-37.79,176.16 from solo;
set local role authenticated;
select pg_temp.as_user('e1000000-0000-0000-0000-000000000003');
select public.clock_out(pg_temp.yday(12), null, null, null, null, null, 0, 'UTC');
select pg_temp.assert_true((select count(*) from public.location_points where session_id=(select id from solo))=1,'points after the finish are dropped at clock-out');
select pg_temp.assert_true((select bool_and(p.recorded_at <= s.ended_at) from public.location_points p join public.work_sessions s on s.id=p.session_id where s.id=(select id from solo)),'the point kept is inside the session');

-- 2. No route for a business the person no longer (actively) works for.
select pg_temp.as_user('e1000000-0000-0000-0000-000000000002');
create temp table member as select public.clock_in() as id;
select pg_temp.assert_true((select owner_id='e1000000-0000-0000-0000-000000000001' from public.work_sessions where id=(select id from member)),'a member''s session is the owner''s');
select pg_temp.assert_true(public.add_location_points(null, jsonb_build_array(jsonb_build_object('t', extract(epoch from now())*1000, 'lat', -37.68, 'lng', 176.16)))=1,'route kept while in the team');
reset role;
update public.subscriptions set status='canceled' where user_id='e1000000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.as_user('e1000000-0000-0000-0000-000000000002');
select pg_temp.assert_true(public.add_location_points(null, jsonb_build_array(jsonb_build_object('t', extract(epoch from now())*1000, 'lat', -37.68, 'lng', 176.16)))=0,'no route once the team is no longer the person''s business');
reset role;
update public.subscriptions set status='active' where user_id='e1000000-0000-0000-0000-000000000001';

-- 3. Leaving the team ends the session for the old owner, with its hours, and stops sharing the setting.
update public.work_sessions set started_at = now() - interval '10 minutes' where id=(select id from member);
set local role authenticated;
select pg_temp.as_user('e1000000-0000-0000-0000-000000000002');
select public.manage_team('leave');
reset role;
select pg_temp.assert_true((select ended_at is not null from public.work_sessions where id=(select id from member)),'leaving ends the open session');
select pg_temp.assert_true((
  select (s.time_entry_id is not null) = ((s.started_at at time zone public.person_time_zone(s.user_id))::date = (s.ended_at at time zone public.person_time_zone(s.user_id))::date)
  from public.work_sessions s where s.id=(select id from member)),'its hours are made when they fit in one day');
select pg_temp.assert_true((select coalesce(bool_and(e.owner_id='e1000000-0000-0000-0000-000000000001' and e.break_minutes=0), true)
  from public.time_entries e where e.session_id=(select id from member)),'those hours belong to the old business');
select pg_temp.assert_true((select owner_id='e1000000-0000-0000-0000-000000000002' from public.location_consents where user_id='e1000000-0000-0000-0000-000000000002'),'the location setting is the person''s own again');
set local role authenticated;
select pg_temp.as_user('e1000000-0000-0000-0000-000000000001');
select pg_temp.assert_true((select count(*) from public.location_consents where user_id='e1000000-0000-0000-0000-000000000002')=0,'the old owner no longer reads it');
select pg_temp.assert_true((select count(*) from public.work_sessions where user_id='e1000000-0000-0000-0000-000000000002' and ended_at is null)=0,'nothing open for the old owner''s map');
select pg_temp.as_user('e1000000-0000-0000-0000-000000000002');
create temp table again as select public.clock_in() as id;
select pg_temp.assert_true((select owner_id='e1000000-0000-0000-0000-000000000002' from public.work_sessions where id=(select id from again)),'the person can clock in for themselves straight away');

-- 4. Remembered geocode misses: the business's own, same access as job_sites.
select pg_temp.as_user('e1000000-0000-0000-0000-000000000001');
insert into public.job_site_misses(client_id,owner_id,address,reason) values('e2000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','14 Kauri Street, Tauranga','not_found');
select pg_temp.assert_rejected($q$insert into public.job_site_misses(client_id,owner_id,address) values('e2000000-0000-0000-0000-000000000003','e1000000-0000-0000-0000-000000000003','1 Nowhere Road')$q$,'row-level security');
select pg_temp.assert_rejected($q$insert into public.job_site_misses(client_id,owner_id,address,reason) values('e2000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','x','maybe')$q$,'job_site_misses_reason');
select pg_temp.as_user('e1000000-0000-0000-0000-000000000003');
select pg_temp.assert_true((select count(*) from public.job_site_misses)=0,'another business sees no misses');

-- 5. The stored zone: the person's own, checked, and used only inside their country.
select pg_temp.as_user('e1000000-0000-0000-0000-000000000003');
update public.profiles set time_zone='Australia/Perth' where id='e1000000-0000-0000-0000-000000000003';
select pg_temp.assert_rejected($q$update public.profiles set time_zone='not a zone' where id='e1000000-0000-0000-0000-000000000003'$q$,'profiles_time_zone_name');
reset role;
select pg_temp.assert_true((select time_zone='Australia/Perth' from public.profiles where id='e1000000-0000-0000-0000-000000000003'),'the person saves their own zone');
update public.profiles set country='AU', currency='AUD' where id='e1000000-0000-0000-0000-000000000003';
select pg_temp.assert_true(public.person_time_zone('e1000000-0000-0000-0000-000000000003')='Australia/Perth','a zone in the country is used');
update public.profiles set country='NZ', currency='NZD' where id='e1000000-0000-0000-0000-000000000003';
select pg_temp.assert_true(public.person_time_zone('e1000000-0000-0000-0000-000000000003')='Pacific/Auckland','a zone outside the country is not');
select pg_temp.assert_true(public.person_time_zone('e1000000-0000-0000-0000-00000000ffff')='Pacific/Auckland','no profile: New Zealand');
set local role authenticated;
select pg_temp.as_user('e1000000-0000-0000-0000-000000000001');
update public.profiles set time_zone='Pacific/Chatham' where id='e1000000-0000-0000-0000-000000000003';
reset role;
select pg_temp.assert_true((select time_zone='Australia/Perth' from public.profiles where id='e1000000-0000-0000-0000-000000000003'),'nobody else can change it');
-- 6. Deleting an account still works with a team member clocked in (the
-- trigger writes nothing for an account on its way out).
reset role;
insert into auth.users(id,email,email_confirmed_at,aud,role,created_at,updated_at) values
  ('e1000000-0000-0000-0000-000000000004','t2q-fix-owner2@example.invalid',now(),'authenticated','authenticated',now(),now()),
  ('e1000000-0000-0000-0000-000000000005','t2q-fix-member2@example.invalid',now(),'authenticated','authenticated',now(),now()),
  ('e1000000-0000-0000-0000-000000000006','t2q-fix-member3@example.invalid',now(),'authenticated','authenticated',now(),now());
insert into public.subscriptions(user_id,stripe_customer_id,plan,status,current_period_end)
  values('e1000000-0000-0000-0000-000000000004','cus_locfix_fixture2','crew','active',now()+interval '30 days');
set local role authenticated;
select pg_temp.as_user('e1000000-0000-0000-0000-000000000004');
select public.manage_team('create','{"name":"Fix Crew Two"}');
reset role;
insert into public.team_members(user_id, team_id)
  select u, id from public.teams, (values ('e1000000-0000-0000-0000-000000000005'::uuid), ('e1000000-0000-0000-0000-000000000006'::uuid)) v(u)
  where owner_id='e1000000-0000-0000-0000-000000000004';
set local role authenticated;
select pg_temp.as_user('e1000000-0000-0000-0000-000000000005');
select public.clock_in();
select pg_temp.as_user('e1000000-0000-0000-0000-000000000006');
select public.clock_in();
reset role;
delete from auth.users where id='e1000000-0000-0000-0000-000000000006';
select pg_temp.assert_true((select count(*) from public.work_sessions where user_id='e1000000-0000-0000-0000-000000000006')=0,'a member''s own account deletion goes through');
delete from auth.users where id='e1000000-0000-0000-0000-000000000004';
select pg_temp.assert_true((select count(*) from public.work_sessions where owner_id='e1000000-0000-0000-0000-000000000004')=0
  and (select count(*) from public.time_entries where owner_id='e1000000-0000-0000-0000-000000000004')=0,'the owner''s account deletion goes through, taking the team''s open session');
rollback;
\echo 'Location fixes and business time zone checks passed.'
