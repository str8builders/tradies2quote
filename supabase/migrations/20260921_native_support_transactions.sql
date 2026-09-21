begin;
create or replace function public.save_kit_atomic(p_id uuid,p_name text,p_trade text,p_notes text,p_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); kit uuid:=coalesce(p_id,gen_random_uuid()); item jsonb; position integer:=0;
begin
 if actor is null then raise exception 'Sign in first' using errcode='28000'; end if;
 if length(trim(p_name)) not between 1 and 150 or length(coalesce(p_trade,''))>150 or length(coalesce(p_notes,''))>10000
  or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>400 then raise exception 'Invalid kit' using errcode='22023'; end if;
 if p_id is not null then
  perform 1 from public.kits where id=kit and user_id=actor for update;
  if not found then raise exception 'Kit not found' using errcode='P0002'; end if;
  update public.kits set name=trim(p_name),trade=p_trade,notes=p_notes,updated_at=now() where id=kit;
 else insert into public.kits(id,user_id,name,trade,notes) values(kit,actor,trim(p_name),p_trade,p_notes); end if;
 delete from public.kit_items where kit_id=kit;
 for item in select value from jsonb_array_elements(p_items) loop
  if coalesce(item->>'type','') not in ('material','labour','other') or length(coalesce(item->>'description','')) not between 1 and 2000
   or jsonb_typeof(item->'quantity') is distinct from 'number' or jsonb_typeof(item->'unit_price') is distinct from 'number'
   or (item->>'quantity')::numeric not between 0 and 1000000 or (item->>'unit_price')::numeric not between 0 and 1000000 then raise exception 'Invalid kit line' using errcode='22023'; end if;
  insert into public.kit_items(kit_id,user_id,type,description,quantity,unit,unit_price,position)
   values(kit,actor,item->>'type',item->>'description',(item->>'quantity')::numeric,item->>'unit',(item->>'unit_price')::numeric,position);
  position:=position+1;
 end loop;
 return kit;
end $$;
revoke all on function public.save_kit_atomic(uuid,text,text,text,jsonb) from public,anon;
grant execute on function public.save_kit_atomic(uuid,text,text,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
