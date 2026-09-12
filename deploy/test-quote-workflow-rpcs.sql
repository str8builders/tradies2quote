\set ON_ERROR_STOP on
begin;
do $$
declare
  audit_id uuid := '9a809b06-4eee-4363-9c11-8fc8b871926a';
  owner_id uuid; target text; first_invoice uuid; second_invoice uuid; before_data jsonb;
begin
  if current_database() not like 't2q_release_audit_%' then
    raise exception 'This test requires an isolated release audit database';
  end if;
  select user_id, quote_data into owner_id, before_data from public.quotes where id = audit_id;
  if owner_id is null then raise exception 'Missing restored audit fixture'; end if;
  update public.quotes set status = 'draft', deleted_at = null, chat_disabled = false,
    quote_data = quote_data || '{"chat_history":[]}'::jsonb where id = audit_id;

  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.transition_quote_lifecycle(audit_id, 'sent');
    raise exception 'Anonymous transition succeeded';
  exception when sqlstate '28000' then null; end;
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  begin
    perform public.transition_quote_lifecycle(audit_id, 'sent');
    raise exception 'Cross-account transition succeeded';
  exception when sqlstate '42501' then null; end;
  begin
    perform public.create_invoice_from_quote(audit_id);
    raise exception 'Cross-account invoice succeeded';
  exception when sqlstate '42501' then null; end;

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  begin
    perform public.create_invoice_from_quote(audit_id);
    raise exception 'Draft quote invoiced';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.transition_quote_lifecycle(audit_id, 'completed');
    raise exception 'Skipped lifecycle states';
  exception when sqlstate '22023' then null; end;
  foreach target in array array['sent', 'accepted', 'scheduled', 'in_progress', 'completed'] loop
    if public.transition_quote_lifecycle(audit_id, target) <> target then raise exception 'Transition failed'; end if;
  end loop;
  if exists(select 1 from public.quotes where id = audit_id and
    (sent_at is null or accepted_at is null or started_at is null or completed_at is null)) then
    raise exception 'Lifecycle timestamps missing';
  end if;
  begin
    perform public.transition_quote_lifecycle(audit_id, 'sent');
    raise exception 'Reverse lifecycle transition succeeded';
  exception when sqlstate '22023' then null; end;

  first_invoice := public.create_invoice_from_quote(audit_id);
  second_invoice := public.create_invoice_from_quote(audit_id);
  if first_invoice is distinct from second_invoice then raise exception 'Duplicate invoice created'; end if;
  if not exists(select 1 from public.invoices where id = first_invoice and status = 'draft'
    and total_amount = 172.50 and subtotal = 150 and tax_amount = 22.50
    and user_id = owner_id and sent_at is null and paid_at is null
    and due_date = now() + interval '7 days') then raise exception 'Invoice snapshot/terms incorrect'; end if;

  perform public.append_quote_chat_messages(audit_id, '[{"role":"customer","content":"Audit question"}]'::jsonb);
  perform public.append_quote_chat_messages(audit_id, '[{"role":"assistant","content":"Audit reply"}]'::jsonb);
  if (select jsonb_array_length(quote_data -> 'chat_history') from public.quotes where id = audit_id) <> 2 then
    raise exception 'Chat history did not append';
  end if;
  if (select quote_data - 'chat_history' from public.quotes where id = audit_id) is distinct from before_data - 'chat_history' then
    raise exception 'Appending chat changed quote data';
  end if;
  if (select invoice_data -> 'chat_history' from public.invoices where id = first_invoice) <> '[]'::jsonb then
    raise exception 'Frozen invoice changed with quote';
  end if;
  update public.quotes set chat_disabled = true where id = audit_id;
  begin
    perform public.append_quote_chat_messages(audit_id, '[]'::jsonb);
    raise exception 'Disabled chat accepted a write';
  exception when sqlstate 'P0002' then null; end;
  if has_function_privilege('anon', 'public.transition_quote_lifecycle(uuid,text,jsonb)', 'execute')
    or has_function_privilege('anon', 'public.create_invoice_from_quote(uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.append_quote_chat_messages(uuid,jsonb)', 'execute') then
    raise exception 'RPC role boundary is too broad';
  end if;
end $$;
rollback;
\echo Quote workflow ownership, lifecycle, invoice snapshot/idempotency and chat checks passed.
