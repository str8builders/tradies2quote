-- Photos attached by a CLIENT through the public "Request a quote" form.
--
-- register_quote_photo (team plans) guards the tradie's own uploads. Client
-- photos arrive through the service role on any plan: same bucket, same
-- attachments table, same 8-photo cap and draft-only rule, no seat check.

create or replace function public.register_request_photo(p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare q public.quotes; u uuid:=(p_data->>'user_id')::uuid; a public.quote_attachments;
begin
  select * into q from public.quotes where id=(p_data->>'quote_id')::uuid and user_id=u and deleted_at is null for update;
  if not found or q.status<>'draft' then raise exception 'Only draft quotes can accept photos.'; end if;
  if (select count(*) from public.quote_attachments where quote_id=q.id and deleted_at is null)>=8 then raise exception 'Maximum 8 photos.'; end if;
  if p_data->>'path' not like u::text||'/'||q.id::text||'/%' then raise exception 'Invalid photo path.'; end if;
  insert into public.quote_attachments(quote_id,user_id,path,name,content_type)
    values(q.id,u,p_data->>'path',left(coalesce(nullif(btrim(p_data->>'name'),''),'Client photo'),150),'image/jpeg')
    returning * into a;
  return jsonb_build_object('id',a.id,'name',a.name);
end $$;

revoke all on function public.register_request_photo(jsonb) from public, anon, authenticated;
grant execute on function public.register_request_photo(jsonb) to service_role;
