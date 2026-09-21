-- Additive native foundation. Rehearse against a schema clone before deployment.
begin;
alter table public.quotes add column if not exists revision uuid not null default gen_random_uuid();
alter table public.quotes add column if not exists updated_at timestamptz not null default now();
create or replace function public.stamp_quote_revision() returns trigger
language plpgsql set search_path = '' as $$ begin
  new.revision := gen_random_uuid(); new.updated_at := clock_timestamp(); return new;
end; $$;
drop trigger if exists stamp_quote_revision on public.quotes;
create trigger stamp_quote_revision before update on public.quotes for each row execute function public.stamp_quote_revision();

create table if not exists public.quote_create_receipts (
  quote_id uuid primary key references public.quotes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null
);
alter table public.quote_create_receipts enable row level security;
revoke all on public.quote_create_receipts from public, anon, authenticated;
grant all on public.quote_create_receipts to service_role;

-- Recompute money inside the transaction as direct RPC calls cannot be trusted.
create or replace function public.normalized_quote_data(p_data jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare line jsonb; lines jsonb := '[]'; qty numeric; price numeric; amount numeric;
  material numeric := 0; labour numeric := 0; markup numeric; taxrate numeric;
  markup_amount numeric; subtotal numeric; tax numeric;
begin
  if jsonb_typeof(p_data) is distinct from 'object'
    or jsonb_typeof(p_data->'line_items') is distinct from 'array'
    or jsonb_array_length(p_data->'line_items') > 400
    or coalesce(p_data->>'currency','') !~ '^[A-Z]{3}$' then
    raise exception 'Invalid quote data' using errcode='22023';
  end if;
  markup := (p_data->>'markup_pct')::numeric; taxrate := (p_data->>'tax_rate')::numeric;
  if markup is null or taxrate is null or markup < 0 or markup > 200 or taxrate < 0 or taxrate > 50 then raise exception 'Invalid tax or markup' using errcode='22023'; end if;
  for line in select value from jsonb_array_elements(p_data->'line_items') loop
    qty := (line->>'quantity')::numeric; price := (line->>'unit_price')::numeric;
    if jsonb_typeof(line->'quantity') is distinct from 'number' or jsonb_typeof(line->'unit_price') is distinct from 'number'
      or qty is null or price is null or qty < 0 or price < 0 or qty > 1000000 or price > 1000000
      or coalesce(line->>'type','') not in ('material','labour','other')
      or length(coalesce(line->>'description','')) not between 1 and 2000
      or length(coalesce(line->>'unit','')) not between 1 and 40 then raise exception 'Invalid quote line' using errcode='22023'; end if;
    amount := round(qty * price, 2);
    line := line || jsonb_build_object('line_total',amount);
    lines := lines || jsonb_build_array(line);
    if line->>'type' = 'labour' then labour := labour + amount; else material := material + amount; end if;
  end loop;
  markup_amount := round(material * markup / 100,2);
  subtotal := material + labour + markup_amount; tax := round(subtotal * taxrate / 100,2);
  return p_data || jsonb_build_object('line_items',lines,'materials_subtotal',material,'labour_subtotal',labour,
    'markup_amount',markup_amount,'subtotal_before_tax',subtotal,'tax_amount',tax,'total',subtotal+tax);
end; $$;
revoke all on function public.normalized_quote_data(jsonb) from public,anon,authenticated;

drop function if exists public.save_quote_atomic(uuid,jsonb,uuid);
create or replace function public.save_quote_atomic(p_quote_id uuid,p_data jsonb,p_expected_revision uuid,p_transcript text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare q public.quotes%rowtype; actor uuid:=auth.uid(); normalized jsonb; line jsonb; next_revision uuid;
begin
  if actor is null then raise exception 'Sign in required' using errcode='28000'; end if;
  select * into q from public.quotes where id=p_quote_id and user_id=actor and deleted_at is null for update;
  if not found then raise exception 'Quote not found' using errcode='P0002'; end if;
  if q.revision is distinct from p_expected_revision then raise exception 'Quote changed on another device. Refresh and compare your local draft.' using errcode='40001'; end if;
  if q.status not in ('draft','sent','viewed','declined') then raise exception 'This quote is locked after acceptance' using errcode='22023'; end if;
  if p_transcript is not null and length(p_transcript)>30000 then raise exception 'Description too long' using errcode='22023'; end if;
  normalized := public.normalized_quote_data(p_data);
  update public.quotes set voice_transcript=coalesce(p_transcript,voice_transcript),quote_data=normalized,total_amount=(normalized->>'total')::numeric,currency=normalized->>'currency'
    where id=p_quote_id returning revision into next_revision;
  delete from public.quote_items where quote_id=p_quote_id;
  for line in select value from jsonb_array_elements(normalized->'line_items') loop
    insert into public.quote_items(id,quote_id,type,description,quantity,unit,unit_price,line_total)
    values(gen_random_uuid(),p_quote_id,line->>'type',line->>'description',(line->>'quantity')::numeric,line->>'unit',(line->>'unit_price')::numeric,(line->>'line_total')::numeric);
  end loop;
  return jsonb_build_object('id',p_quote_id,'revision',next_revision);
end; $$;

create or replace function public.create_quote_atomic(p_quote_id uuid,p_transcript text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); receipt public.quote_create_receipts%rowtype; payload jsonb;
  normalized jsonb; line jsonb; next_revision uuid;
begin
  if actor is null then raise exception 'Sign in required' using errcode='28000'; end if;
  if length(coalesce(p_transcript,'')) > 30000 then raise exception 'Description too long' using errcode='22023'; end if;
  -- Serialise only this operation, including competing first inserts.
  perform pg_advisory_xact_lock(hashtextextended(p_quote_id::text,0));
  payload := jsonb_build_object('transcript',coalesce(p_transcript,''),'data',p_data);
  select * into receipt from public.quote_create_receipts where quote_id=p_quote_id;
  if found then
    if receipt.user_id<>actor or receipt.payload is distinct from payload then raise exception 'Operation already used for a different draft' using errcode='23505'; end if;
    select revision into next_revision from public.quotes where id=p_quote_id and user_id=actor and deleted_at is null;
    if not found then raise exception 'This draft was deleted' using errcode='P0002'; end if;
    return jsonb_build_object('id',p_quote_id,'revision',next_revision,'alreadySaved',true);
  end if;
  if p_data is not null then normalized:=public.normalized_quote_data(p_data); end if;
  if normalized is null and length(trim(coalesce(p_transcript,'')))=0 then raise exception 'Describe the job first' using errcode='22023'; end if;
  insert into public.quotes(id,user_id,status,voice_transcript,quote_data,currency,total_amount)
    values(p_quote_id,actor,'draft',nullif(p_transcript,''),normalized,coalesce(normalized->>'currency','NZD'),coalesce((normalized->>'total')::numeric,0)) returning revision into next_revision;
  for line in select value from jsonb_array_elements(coalesce(normalized->'line_items','[]')) loop
    insert into public.quote_items(id,quote_id,type,description,quantity,unit,unit_price,line_total)
      values(gen_random_uuid(),p_quote_id,line->>'type',line->>'description',(line->>'quantity')::numeric,line->>'unit',(line->>'unit_price')::numeric,(line->>'line_total')::numeric);
  end loop;
  insert into public.quote_create_receipts values(p_quote_id,actor,payload);
  return jsonb_build_object('id',p_quote_id,'revision',next_revision);
end; $$;

create or replace function public.schedule_quote_atomic(p_quote_id uuid,p_date date)
returns text language plpgsql security definer set search_path = '' as $$
declare q public.quotes%rowtype; actor uuid:=auth.uid(); result text;
begin
  if actor is null then raise exception 'Sign in required' using errcode='28000'; end if;
  select * into q from public.quotes where id=p_quote_id and user_id=actor and deleted_at is null for update;
  if not found then raise exception 'Quote not found' using errcode='P0002'; end if;
  if q.status='scheduled' then result:='scheduled';
  else result:=public.transition_quote_lifecycle(p_quote_id,'scheduled',jsonb_build_object('source','schedule','date',p_date)); end if;
  update public.quotes set scheduled_for=p_date::text where id=p_quote_id;
  return result;
end; $$;
revoke all on function public.save_quote_atomic(uuid,jsonb,uuid,text), public.create_quote_atomic(uuid,text,jsonb), public.schedule_quote_atomic(uuid,date) from public,anon;
grant execute on function public.save_quote_atomic(uuid,jsonb,uuid,text), public.create_quote_atomic(uuid,text,jsonb), public.schedule_quote_atomic(uuid,date) to authenticated;
grant select(revision,updated_at) on public.quotes to authenticated;
notify pgrst,'reload schema';

-- Generation also commits header, frozen baseline and detail rows atomically.
-- The service role is used only for public requests whose consent was recorded.
create or replace function public.commit_generated_quote(p_user_id uuid,p_quote_id uuid,p_expected_revision uuid,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); q public.quotes%rowtype; normalized jsonb; line jsonb; next_revision uuid;
begin
  if auth.role()='service_role' then actor:=p_user_id; end if;
  if actor is null or actor<>p_user_id then raise exception 'Not allowed' using errcode='42501'; end if;
  select * into q from public.quotes where id=p_quote_id and user_id=actor and deleted_at is null for update;
  if not found then raise exception 'Quote not found' using errcode='P0002'; end if;
  if q.revision is distinct from p_expected_revision or q.status<>'draft' then raise exception 'Quote changed while generating. Refresh to review it.' using errcode='40001'; end if;
  if not exists(select from public.profiles where id=actor and ai_consent_at is not null and ai_consent_version='2026-09-external-ai-v2') then raise exception 'AI permission was withdrawn' using errcode='42501'; end if;
  normalized:=public.normalized_quote_data(p_data);
  update public.quotes set quote_data=normalized,ai_snapshot=normalized,total_amount=(normalized->>'total')::numeric,currency=normalized->>'currency'
    where id=p_quote_id returning revision into next_revision;
  delete from public.quote_items where quote_id=p_quote_id;
  for line in select value from jsonb_array_elements(normalized->'line_items') loop
    insert into public.quote_items(id,quote_id,type,description,quantity,unit,unit_price,line_total)
      values(gen_random_uuid(),p_quote_id,line->>'type',line->>'description',(line->>'quantity')::numeric,line->>'unit',(line->>'unit_price')::numeric,(line->>'line_total')::numeric);
  end loop;
  return jsonb_build_object('id',p_quote_id,'revision',next_revision);
end $$;
revoke all on function public.commit_generated_quote(uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.commit_generated_quote(uuid,uuid,uuid,jsonb) to authenticated,service_role;
notify pgrst,'reload schema';

commit;
