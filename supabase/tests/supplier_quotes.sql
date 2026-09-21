\set ON_ERROR_STOP on
begin;
do $$ begin
 if current_database() !~ '^t2q_native_rehearsal_[0-9]{8}$' then raise exception 'Refusing a non-rehearsal database'; end if;
end $$;
set local session_replication_role = replica;
insert into auth.users(id,email) values('10101010-1010-4010-8010-101010101010','supplier-fixture@example.invalid');
set local session_replication_role = origin;
select set_config('request.jwt.claim.sub','10101010-1010-4010-8010-101010101010',true);
create function public.supplier_test_reject_item() returns trigger language plpgsql as $$ begin
 if new.description='Reject supplier line' then raise exception 'Injected item write failure' using errcode='23514'; end if;
 return new;
end $$;
create trigger supplier_test_failure before insert on public.quote_items for each row execute function public.supplier_test_reject_item();
do $$ declare
 draft jsonb:='{"job_summary":"Supplier quote","currency":"NZD","markup_pct":0,"tax_rate":15,"supplier_source":{"source_total":23,"reconciliation_status":"ok"},"line_items":[{"type":"material","description":"Timber","quantity":2,"unit":"each","unit_price":10,"source_line_total":20}]}';
 result jsonb; saved jsonb; baseline jsonb;
begin
 result:=public.create_supplier_quote_atomic('30303030-3030-4030-8030-303030303030','Supplier',draft);
 select quote_data,ai_snapshot into saved,baseline from public.quotes where id='30303030-3030-4030-8030-303030303030';
 if saved is distinct from baseline or saved->>'total'<>'23.00' then raise exception 'Missing frozen baseline or incorrect total'; end if;
 if (select count(*) from public.quote_items where quote_id='30303030-3030-4030-8030-303030303030')<>1 then raise exception 'Missing item rows'; end if;
 perform public.save_quote_atomic('30303030-3030-4030-8030-303030303030',jsonb_set(draft,'{job_summary}','"Customer edited"'),(result->>'revision')::uuid);
 result:=public.create_supplier_quote_atomic('30303030-3030-4030-8030-303030303030','Supplier',draft);
 if result->>'alreadySaved'<>'true' then raise exception 'Lost receipt after editing'; end if;
 select quote_data,ai_snapshot into saved,baseline from public.quotes where id='30303030-3030-4030-8030-303030303030';
 if saved->>'job_summary'<>'Customer edited' or baseline->>'job_summary'<>'Supplier quote' then raise exception 'Retry overwrote working or source'; end if;
 begin
  perform public.create_supplier_quote_atomic('30303030-3030-4030-8030-303030303030','Supplier',jsonb_set(draft,'{job_summary}','"Different operation"'));
  raise exception 'Accepted conflicting receipt';
 exception when unique_violation then null; end;
 begin
  perform public.create_supplier_quote_atomic('40404040-4040-4040-8040-404040404040','Supplier',jsonb_set(draft,'{line_items,0,description}','"Reject supplier line"'));
  raise exception 'Ignored item failure';
 exception when check_violation then null; end;
 if exists(select from public.quotes where id='40404040-4040-4040-8040-404040404040') or exists(select from public.quote_create_receipts where quote_id='40404040-4040-4040-8040-404040404040') then raise exception 'Partial supplier creation survived failure'; end if;
end $$;
set local role anon;
do $$ begin
 begin
  perform public.create_supplier_quote_atomic(gen_random_uuid(),'Supplier','{}');
  raise exception 'Anonymous creation allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: atomic supplier header/items/source/receipt, rollback on item failure, immutable source and edited-quote retry' as result;
