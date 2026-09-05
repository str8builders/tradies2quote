-- Restore the callable contracts and service-only RPC boundaries lost during reconstruction.
-- The quote acceptance route validates consent/signature and calls as service_role.
-- Keep acceptance totals and lifecycle checks inside the locked transaction.
create extension if not exists pg_trgm with schema extensions;
create or replace function public.accept_quote(p_token text,p_name text,p_email text,p_signature_path text,p_ip text,p_user_agent text,p_total numeric,p_version integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare q_record record;
begin
  select * into q_record from public.quotes where public_token=p_token and deleted_at is null limit 1 for update;
  if q_record is null then return jsonb_build_object('error','not_found'); end if;
  if q_record.status='accepted' then return jsonb_build_object('error','already_accepted'); end if;
  if q_record.expires_at is not null and q_record.expires_at<now() then return jsonb_build_object('error','expired'); end if;
  if q_record.status='declined' then return jsonb_build_object('error','declined'); end if;
  if q_record.status not in ('sent','viewed') then return jsonb_build_object('error','not_available'); end if;
  if q_record.total_amount is null or q_record.total_amount<0 or q_record.total_amount::text in ('NaN','Infinity','-Infinity') then return jsonb_build_object('error','not_available'); end if;
  -- The page may have been edited between its server read and this row lock.
  if p_total is distinct from q_record.total_amount then return jsonb_build_object('error','quote_changed'); end if;
  update public.quotes set status='accepted',accepted_at=now(),accepted_name=p_name,
    accepted_email=p_email,signature_path=p_signature_path,accepted_ip=p_ip,
    accepted_user_agent=p_user_agent,accepted_total=q_record.total_amount,
    accepted_quote_version=greatest(coalesce(q_record.accepted_quote_version,0),1)
  where id=q_record.id;
  insert into public.quote_events(quote_id,type,metadata) values(q_record.id,'accepted',jsonb_build_object('name',p_name));
  return jsonb_build_object('ok',true,'quote_id',q_record.id);
end $function$;
revoke all on function public.accept_quote(text,text,text,text,text,text,numeric,integer) from public,anon,authenticated;
grant execute on function public.accept_quote(text,text,text,text,text,text,numeric,integer) to service_role;
revoke all on function public.record_app_error(text,text,text,text,text,text,text,text,text,text,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_app_error(text,text,text,text,text,text,text,text,text,text,integer,text,jsonb) to service_role;
revoke all on function public.handle_new_user() from public,anon,authenticated;

-- The deployed client already sends p_treatment_class. Restore its seven-argument
-- lookup so a requested timber treatment cannot fall through to a different grade.
drop function if exists public.search_materials(text, text, text, text, text, int);
drop function if exists public.search_materials(text, text, text, text, text, int, text);

create function public.search_materials(
  p_query           text,
  p_country         text default 'NZ',
  p_category        text default null,
  p_brand           text default null,
  p_supplier        text default null,
  p_limit           int  default 25,
  p_treatment_class text default null
) returns table (
  id uuid, user_id uuid, name text, brand text, category text, unit text,
  price numeric, attributes jsonb, match_source text, match_score real, tier_rank int
) language plpgsql security invoker set search_path = public, extensions, pg_temp as $$
declare
  q_norm text := lower(trim(coalesce(p_query, '')));
  uid    uuid := auth.uid();
  lim    int  := least(greatest(coalesce(p_limit, 25), 1), 100);
begin
  if q_norm = '' then return; end if;
  return query
  with matches as (
    -- Direct name match
    select m.id, m.user_id, m.name, m.brand, m.category, m.unit,
           m.default_unit_price as price, m.attributes,
           case when m.user_id is not null and m.user_id = uid then 'direct_user' else 'direct_global' end as match_source,
           similarity(coalesce(m.normalized_name, lower(m.name)), q_norm) as match_score,
           case when m.user_id is not null and m.user_id = uid then 1 else 3 end as tier_rank
    from public.materials m
    where m.active
      and (p_country         is null or m.country  = p_country)
      and (p_category        is null or m.category = p_category)
      and (p_brand           is null or m.brand    = p_brand)
      and (p_supplier        is null or m.supplier = p_supplier)
      -- HARD FILTER on treatment_class when caller specifies it
      and (p_treatment_class is null or m.attributes->>'treatment_class' = p_treatment_class)
      and similarity(coalesce(m.normalized_name, lower(m.name)), q_norm) > 0.2
      and (m.user_id is null or m.user_id = uid)

    union all

    -- Alias match (same hard filter on treatment_class)
    select m.id, m.user_id, m.name, m.brand, m.category, m.unit,
           m.default_unit_price as price, m.attributes,
           case when m.user_id is not null and m.user_id = uid then 'alias_user' else 'alias_global' end,
           similarity(a.normalized_alias, q_norm),
           case when m.user_id is not null and m.user_id = uid then 2 else 4 end
    from public.material_aliases a
    join public.materials m on m.id = a.material_id
    where m.active
      and (p_country         is null or m.country  = p_country)
      and (p_category        is null or m.category = p_category)
      and (p_brand           is null or m.brand    = p_brand)
      and (p_supplier        is null or m.supplier = p_supplier)
      and (p_treatment_class is null or m.attributes->>'treatment_class' = p_treatment_class)
      and similarity(a.normalized_alias, q_norm) > 0.3
      and (m.user_id is null or m.user_id = uid)
  ),
  ranked as (
    select mt.*, row_number() over (partition by mt.id order by mt.tier_rank asc, mt.match_score desc) as rn
    from matches mt
  )
  select r.id, r.user_id, r.name, r.brand, r.category, r.unit, r.price, r.attributes,
         r.match_source, r.match_score, r.tier_rank
  from ranked r where r.rn = 1
  order by r.tier_rank asc, r.match_score desc
  limit lim;
end; $$;

revoke all on function public.search_materials(text, text, text, text, text, int, text) from public, anon;
grant  execute on function public.search_materials(text, text, text, text, text, int, text) to authenticated;

grant execute on function public.search_materials(text,text,text,text,text,int,text) to service_role;
notify pgrst, 'reload schema';
