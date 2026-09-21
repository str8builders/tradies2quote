\set ON_ERROR_STOP on
begin;
do $$ begin
 if current_database() !~ '^t2q_native_rehearsal_[0-9]{8}$' then raise exception 'Refusing a non-rehearsal database'; end if;
end $$;
set local session_replication_role = replica;
insert into auth.users(id,email) values
 ('10101010-1010-4010-8010-101010101010','delete-alice@example.invalid'),
 ('20202020-2020-4020-8020-202020202020','delete-bob@example.invalid');
set local session_replication_role = origin;
insert into public.quotes(id,user_id,status) values('30303030-3030-4030-8030-303030303030','10101010-1010-4010-8010-101010101010','draft');
select public.begin_account_deletion('10101010-1010-4010-8010-101010101010');
select public.begin_account_deletion('10101010-1010-4010-8010-101010101010');
do $$ begin
 if (select count(*) from public.account_deletion_requests where user_id='10101010-1010-4010-8010-101010101010')<>1 then raise exception 'Deletion marker is not idempotent'; end if;
 if exists(select from public.claim_account_deletions(5)) then raise exception 'Claimed an active deletion too early'; end if;
 update public.account_deletion_requests set last_attempt_at=now()-interval '11 minutes' where user_id='10101010-1010-4010-8010-101010101010';
 if (select count(*) from public.claim_account_deletions(5))<>1 then raise exception 'Did not claim an interrupted deletion'; end if;
 if exists(select from public.claim_account_deletions(5)) then raise exception 'Reclaimed the same attempt'; end if;
 begin
  update public.quotes set voice_transcript='late device write' where id='30303030-3030-4030-8030-303030303030';
  raise exception 'Allowed a write after deletion began';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.materials(user_id,name,unit,default_unit_price) values('10101010-1010-4010-8010-101010101010','Late material','each',10);
  raise exception 'Allowed creation after deletion began';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.quote_items(quote_id,type,description,quantity,unit,unit_price,line_total) values('30303030-3030-4030-8030-303030303030','material','Late child',1,'each',10,10);
  raise exception 'Allowed child creation after deletion began';
 exception when insufficient_privilege then null; end;
 -- Another account remains writable.
 insert into public.materials(user_id,name,unit,default_unit_price) values('20202020-2020-4020-8020-202020202020','Other account','each',10);
 delete from public.quotes where id='30303030-3030-4030-8030-303030303030';
 delete from auth.users where id='10101010-1010-4010-8010-101010101010';
 if exists(select from public.account_deletion_requests where user_id='10101010-1010-4010-8010-101010101010') then raise exception 'Deleted account left a request'; end if;
end $$;
set local role authenticated;
do $$ begin
 begin
  perform public.begin_account_deletion('20202020-2020-4020-8020-202020202020');
  raise exception 'Untrusted caller began deletion';
 exception when insufficient_privilege then null; end;
 begin
  perform public.claim_account_deletions(5);
  raise exception 'Untrusted caller claimed deletions';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: durable deletion, idempotent retry, blocked writes/children, other-account isolation, row cleanup and service-only initiation' as result;
