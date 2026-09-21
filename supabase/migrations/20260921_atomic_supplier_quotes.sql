begin;
create or replace function public.create_supplier_quote_atomic(p_quote_id uuid,p_transcript text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; next_revision uuid;
begin
  if jsonb_typeof(p_data->'supplier_source') is distinct from 'object' then
    raise exception 'Supplier source is required' using errcode='22023';
  end if;
  -- Nested functions share the transaction: header, items, frozen source and
  -- operation receipt either all commit, or all roll back.
  result:=public.create_quote_atomic(p_quote_id,p_transcript,p_data);
  if not coalesce((result->>'alreadySaved')::boolean,false) then
    update public.quotes set ai_snapshot=quote_data
      where id=p_quote_id and user_id=auth.uid() returning revision into next_revision;
    result:=result || jsonb_build_object('revision',next_revision);
  end if;
  return result;
end $$;
revoke all on function public.create_supplier_quote_atomic(uuid,text,jsonb) from public,anon;
grant execute on function public.create_supplier_quote_atomic(uuid,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
