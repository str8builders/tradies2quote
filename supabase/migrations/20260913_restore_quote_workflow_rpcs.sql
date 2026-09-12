-- Restore remaining callable contracts referenced by the existing quote UI.
create or replace function public.transition_quote_lifecycle(
  p_quote_id uuid, p_target text, p_metadata jsonb default '{}'::jsonb
) returns text language plpgsql security definer set search_path = '' as $$
declare q public.quotes%rowtype; actor uuid := auth.uid(); permitted boolean;
begin
  if actor is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  select * into q from public.quotes where id = p_quote_id and deleted_at is null for update;
  if not found then raise exception 'Quote not found' using errcode = 'P0002'; end if;
  if q.user_id <> actor then raise exception 'Quote belongs to another account' using errcode = '42501'; end if;
  -- Mirrors OWNER_TRANSITIONS in src/lib/lifecycle/stages.ts. Automatic
  -- sent -> viewed belongs to the separate service-only mark_quote_viewed.
  permitted := case q.status
    when 'draft' then p_target in ('sent', 'declined')
    when 'sent' then p_target in ('accepted', 'declined')
    when 'viewed' then p_target in ('accepted', 'declined')
    when 'accepted' then p_target = 'scheduled'
    when 'scheduled' then p_target = 'in_progress'
    when 'in_progress' then p_target = 'completed'
    else false end;
  if permitted is not true then raise exception 'Invalid lifecycle transition' using errcode = '22023'; end if;
  update public.quotes set status = p_target,
    sent_at = case when p_target = 'sent' then coalesce(sent_at, now()) else sent_at end,
    accepted_at = case when p_target = 'accepted' then coalesce(accepted_at, now()) else accepted_at end,
    accepted_total = case when p_target = 'accepted' then total_amount else accepted_total end,
    started_at = case when p_target = 'in_progress' then coalesce(started_at, now()) else started_at end,
    completed_at = case when p_target = 'completed' then coalesce(completed_at, now()) else completed_at end,
    declined_at = case when p_target = 'declined' then coalesce(declined_at, now()) else declined_at end
  where id = p_quote_id;
  insert into public.quote_events(quote_id, type, metadata)
    values (p_quote_id, p_target, coalesce(p_metadata, '{}'::jsonb));
  return p_target;
end;
$$;

create or replace function public.create_invoice_from_quote(p_quote_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  q public.quotes%rowtype; actor uuid := auth.uid(); invoice_id uuid;
  invoice_total numeric; invoice_tax numeric; invoice_subtotal numeric;
begin
  if actor is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  select * into q from public.quotes where id = p_quote_id and deleted_at is null for update;
  if not found then raise exception 'Quote not found' using errcode = 'P0002'; end if;
  if q.user_id <> actor then raise exception 'Quote belongs to another account' using errcode = '42501'; end if;
  if q.status <> 'completed' then raise exception 'Quote must be completed' using errcode = '22023'; end if;
  select i.id into invoice_id from public.invoices i
    where i.quote_id = p_quote_id and i.user_id = actor and i.deleted_at is null
    order by i.created_at limit 1;
  if invoice_id is not null then return invoice_id; end if;
  if q.quote_data is null or jsonb_typeof(q.quote_data -> 'line_items') is distinct from 'array' then
    raise exception 'Quote has no line items' using errcode = '22023';
  end if;
  if jsonb_array_length(q.quote_data -> 'line_items') = 0 then
    raise exception 'Quote has no line items' using errcode = '22023';
  end if;
  invoice_total := round((q.quote_data ->> 'total')::numeric, 2);
  invoice_tax := round((q.quote_data ->> 'tax_amount')::numeric, 2);
  invoice_subtotal := round((q.quote_data ->> 'subtotal_before_tax')::numeric, 2);
  if invoice_total is null or invoice_tax is null or invoice_subtotal is null
    or invoice_total <= 0 or invoice_tax < 0 or invoice_subtotal < 0
    or invoice_total::text in ('NaN', 'Infinity', '-Infinity')
    or invoice_tax::text in ('NaN', 'Infinity', '-Infinity')
    or invoice_subtotal::text in ('NaN', 'Infinity', '-Infinity')
    or invoice_total is distinct from q.total_amount
    or invoice_total <> invoice_subtotal + invoice_tax then
    raise exception 'Quote totals must be consistent' using errcode = '22023';
  end if;
  invoice_id := gen_random_uuid();
  insert into public.invoices(id, user_id, quote_id, invoice_number, status,
    total_amount, tax_amount, subtotal, currency, invoice_data, due_date)
  values (invoice_id, actor, p_quote_id, 'INV-' || upper(left(invoice_id::text, 8)), 'draft',
    invoice_total, invoice_tax, invoice_subtotal,
    coalesce(nullif(q.currency, ''), 'NZD'), q.quote_data, now() + interval '7 days');
  return invoice_id;
end;
$$;

create or replace function public.append_quote_chat_messages(p_quote_id uuid, p_messages jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if jsonb_typeof(p_messages) is distinct from 'array' then
    raise exception 'Messages must be an array' using errcode = '22023';
  end if;
  update public.quotes set quote_data = jsonb_set(coalesce(quote_data, '{}'::jsonb), '{chat_history}',
    (case when jsonb_typeof(quote_data -> 'chat_history') = 'array'
      then quote_data -> 'chat_history' else '[]'::jsonb end) || p_messages, true)
  where id = p_quote_id and deleted_at is null and chat_disabled is not true;
  if not found then raise exception 'Quote chat unavailable' using errcode = 'P0002'; end if;
end;
$$;

revoke all on function public.transition_quote_lifecycle(uuid, text, jsonb) from public, anon;
revoke all on function public.create_invoice_from_quote(uuid) from public, anon;
revoke all on function public.append_quote_chat_messages(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.transition_quote_lifecycle(uuid, text, jsonb) to authenticated;
grant execute on function public.create_invoice_from_quote(uuid) to authenticated;
grant execute on function public.append_quote_chat_messages(uuid, jsonb) to service_role;
notify pgrst, 'reload schema';
