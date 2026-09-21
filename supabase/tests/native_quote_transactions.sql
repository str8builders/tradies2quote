-- Run ONLY in the schema-only rehearsal database. Fixture changes roll back.
\set ON_ERROR_STOP on
begin;
do $$ begin
  if current_database() !~ '^t2q_native_rehearsal_[0-9]{8}$' then raise exception 'Refusing to seed a non-rehearsal database'; end if;
end $$;
-- Avoid signup notifications during fixture insertion.
set local session_replication_role = replica;
insert into auth.users(id,email) values
 ('10101010-1010-4010-8010-101010101010','alice@example.invalid'),
 ('20202020-2020-4020-8020-202020202020','bob@example.invalid') on conflict do nothing;
set local session_replication_role = origin;
select set_config('request.jwt.claim.sub','10101010-1010-4010-8010-101010101010',true);
do $$
declare draft jsonb:='{"client":{"name":"Customer"},"future":{"x":true},"job_summary":"Deck","currency":"NZD","markup_pct":20,"tax_rate":15,"total":999999,"line_items":[{"type":"material","description":"Boards","quantity":3,"unit":"each","unit_price":0.335,"t2qcal_source_key":"deck.boards"},{"type":"labour","description":"Build","quantity":2,"unit":"hour","unit_price":75}]}';
  result jsonb; first_revision uuid; count_rows integer; normalized jsonb;
begin
  result:=public.create_quote_atomic('30303030-3030-4030-8030-303030303030','Deck job',draft);
  first_revision:=(result->>'revision')::uuid;
  select quote_data into normalized from public.quotes where id='30303030-3030-4030-8030-303030303030';
  if (normalized->>'total')::numeric<>173.89 then raise exception 'Incorrect total'; end if;
  if normalized#>>'{line_items,0,t2qcal_source_key}'<>'deck.boards' then raise exception 'Lost provenance'; end if;
  result:=public.create_quote_atomic('30303030-3030-4030-8030-303030303030','Deck job',draft);
  if result->>'alreadySaved'<>'true' then raise exception 'Retry was not idempotent'; end if;
  select count(*) into count_rows from public.quote_items where quote_id='30303030-3030-4030-8030-303030303030';
  if count_rows<>2 then raise exception 'Duplicate or missing line items'; end if;
  begin
    perform public.create_quote_atomic('30303030-3030-4030-8030-303030303030','Different job',draft);
    raise exception 'Reused operation accepted';
  exception when unique_violation then null; end;
  result:=public.save_quote_atomic('30303030-3030-4030-8030-303030303030',draft,first_revision);
  if (result->>'revision')::uuid=first_revision then raise exception 'Revision not changed'; end if;
  begin
    perform public.save_quote_atomic('30303030-3030-4030-8030-303030303030',draft,first_revision);
    raise exception 'Stale save accepted';
  exception when sqlstate 'PT409' then null; end;
  first_revision:=(result->>'revision')::uuid;
  begin
    perform public.save_quote_atomic('30303030-3030-4030-8030-303030303030',jsonb_set(draft,'{line_items,0,quantity}','-1'),first_revision);
    raise exception 'Invalid negative quantity accepted';
  exception when invalid_parameter_value then null; end;
  if (select revision from public.quotes where id='30303030-3030-4030-8030-303030303030')<>first_revision then raise exception 'Failed save mutated record'; end if;
end $$;
select set_config('request.jwt.claim.sub','20202020-2020-4020-8020-202020202020',true);
set local role authenticated;
do $$ begin
  if exists(select from public.quotes where id='30303030-3030-4030-8030-303030303030') then raise exception 'RLS leaked another account'; end if;
  begin
    perform public.save_quote_atomic('30303030-3030-4030-8030-303030303030','{}',gen_random_uuid());
    raise exception 'Cross-account save accepted';
  exception when no_data_found then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','10101010-1010-4010-8010-101010101010',true);
update public.quotes set status='accepted' where id='30303030-3030-4030-8030-303030303030';
select public.schedule_quote_atomic('30303030-3030-4030-8030-303030303030','2026-10-01');
do $$ begin
  if not exists(select from public.quotes where id='30303030-3030-4030-8030-303030303030' and status='scheduled' and scheduled_for='2026-10-01') then raise exception 'Schedule not atomic'; end if;
end $$;
do $$
declare kit uuid; lines jsonb:='[{"type":"material","description":"Boards","quantity":2,"unit":"each","unit_price":10}]'; revision uuid;
begin
 kit:=public.save_kit_atomic(null,'Original kit',null,null,lines);
 begin
  perform public.save_kit_atomic(kit,'Broken update',null,null,jsonb_set(lines,'{0,quantity}','-1'));
  raise exception 'Invalid kit saved';
 exception when invalid_parameter_value then null; end;
 if (select name from public.kits where id=kit)<>'Original kit' or (select count(*) from public.kit_items where kit_id=kit)<>1 then raise exception 'Failed kit update lost prior data'; end if;
 revision:=(public.create_quote_atomic('50505050-5050-4050-8050-505050505050','Before update','{"currency":"NZD","markup_pct":20,"tax_rate":15,"line_items":[]}')->>'revision')::uuid;
 revision:=(public.save_quote_atomic('50505050-5050-4050-8050-505050505050','{"currency":"NZD","markup_pct":20,"tax_rate":15,"line_items":[]}',revision,'Updated description')->>'revision')::uuid;
 if (select voice_transcript from public.quotes where id='50505050-5050-4050-8050-505050505050')<>'Updated description' then raise exception 'Transcript was not saved'; end if;
 begin
  perform public.commit_generated_quote('10101010-1010-4010-8010-101010101010','50505050-5050-4050-8050-505050505050',revision,'{"currency":"NZD","markup_pct":20,"tax_rate":15,"line_items":[]}');
  raise exception 'Generation committed without consent';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'PASS: totals, provenance, idempotency, duplicate rejection, stale revision, invalid-input rollback, RLS isolation, atomic schedule' as result;
