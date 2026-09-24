\set ON_ERROR_STOP on
begin;
do $$
begin
  if current_database() not like 't2q_release_audit_%' then
    raise exception 'This test requires an isolated release audit database';
  end if;
end $$;

do $$
declare
  audit_quote_id uuid := '9a809b06-4eee-4363-9c11-8fc8b871926a';
  token text := 'isolated-audit-token-20260913';
  payload jsonb;
  item jsonb;
  view_count integer;
  state text;
begin
  if not exists(select 1 from public.quotes where id = audit_quote_id) then
    raise exception 'Expected the restored synthetic audit quote';
  end if;
  -- Status on its own first: since 24 Sep the content guard refuses content
  -- edits while the restored fixture is accepted or later.
  update public.quotes set status = 'draft' where id = audit_quote_id;
  update public.quotes set public_token = token, status = 'sent', deleted_at = null,
    expires_at = now() + interval '30 days', viewed_at = null,
    quote_data = quote_data || jsonb_build_object(
      'transcript', 'INTERNAL-AUDIT-SECRET', 'notes', jsonb_build_array('INTERNAL-AUDIT-SECRET'),
      'compliance_review', jsonb_build_object('private', 'INTERNAL-AUDIT-SECRET'),
      'line_items', jsonb_build_array(jsonb_build_object(
        'type', 'labour', 'description', 'Audit labour', 'quantity', 2, 'unit', 'hour',
        'unit_price', 75, 'line_total', 150, 'price_source', 'INTERNAL-AUDIT-SECRET',
        'confidence', 'INTERNAL-AUDIT-SECRET', 'material_id', 'INTERNAL-AUDIT-SECRET'
      )))
  where id = audit_quote_id;

  payload := public.get_quote_by_token(token);
  if payload is null or (payload ->> 'total')::numeric <> 172.50 then raise exception 'Quote totals missing'; end if;
  if payload::text like '%INTERNAL-AUDIT-SECRET%' then raise exception 'Private data leaked'; end if;
  item := payload #> '{line_items,0}';
  if (select count(*) from jsonb_object_keys(item)) <> 6 then raise exception 'Unexpected public line fields'; end if;
  if payload ?| array['user_id', 'quote_data', 'voice_transcript', 'accepted_ip', 'pdf_path', 'pdf_version', 'signature_path'] then
    raise exception 'Private columns leaked';
  end if;
  if (payload ->> 'version')::integer is distinct from (select version from public.quotes where id = audit_quote_id) then
    raise exception 'Public payload missing the quote version';
  end if;
  if public.get_quote_by_token('missing-audit-token') is not null then raise exception 'Invalid token resolved'; end if;
  if has_function_privilege('anon', 'public.get_quote_by_token(text)', 'execute')
    or has_function_privilege('authenticated', 'public.get_quote_by_token(text)', 'execute')
    or has_function_privilege('anon', 'public.mark_quote_viewed(text)', 'execute')
    or not has_function_privilege('service_role', 'public.get_quote_by_token(text)', 'execute') then
    raise exception 'Unexpected RPC grants';
  end if;

  select count(*) into view_count from public.quote_events e where e.quote_id = audit_quote_id and e.type = 'viewed';
  perform public.mark_quote_viewed(token);
  perform public.mark_quote_viewed(token);
  if (select status from public.quotes where id = audit_quote_id) <> 'viewed' then raise exception 'View not recorded'; end if;
  if (select count(*) from public.quote_events e where e.quote_id = audit_quote_id and e.type = 'viewed') <> view_count + 1 then
    raise exception 'View event not idempotent';
  end if;
  foreach state in array array['draft', 'declined', 'expired', 'accepted'] loop
    update public.quotes set status = state where id = audit_quote_id;
    perform public.mark_quote_viewed(token);
    if (select status from public.quotes where id = audit_quote_id) <> state then raise exception 'Invalid lifecycle transition'; end if;
  end loop;
  update public.quotes set status = 'sent', expires_at = now() - interval '1 day' where id = audit_quote_id;
  perform public.mark_quote_viewed(token);
  if (select status from public.quotes where id = audit_quote_id) <> 'sent' then raise exception 'Expired quote counted as viewed'; end if;
  update public.quotes set deleted_at = now(), expires_at = now() + interval '1 day' where id = audit_quote_id;
  if public.get_quote_by_token(token) is not null then raise exception 'Deleted quote resolved'; end if;
  perform public.mark_quote_viewed(token);
  if (select status from public.quotes where id = audit_quote_id) <> 'sent' then raise exception 'Deleted quote counted as viewed'; end if;
end $$;

-- 24 Sep: quote versioning, restored accept_quote guards and the post-acceptance lock.
do $$
declare
  audit_quote_id uuid := '9a809b06-4eee-4363-9c11-8fc8b871926a';
  token text := 'isolated-audit-token-20260913';
  owner_id uuid; v integer; agreed numeric; result jsonb; state text; accepted_events integer;
begin
  update public.quotes set deleted_at = null, status = 'draft', expires_at = now() + interval '30 days',
    accepted_at = null, accepted_total = null where id = audit_quote_id;
  select user_id, version, total_amount into owner_id, v, agreed from public.quotes where id = audit_quote_id;
  select count(*) into accepted_events from public.quote_events where quote_id = audit_quote_id and type = 'accepted';

  -- Internal-only edits (chat, transcript, notes) and direct version writes keep the version.
  update public.quotes set quote_data = quote_data || '{"chat_history":[{"role":"customer","content":"Audit"}],
    "transcript":{"cleaned":"Audit"},"notes":["Audit"]}'::jsonb where id = audit_quote_id;
  update public.quotes set version = v + 40 where id = audit_quote_id;
  if (select version from public.quotes where id = audit_quote_id) <> v then raise exception 'Version moved without a content change'; end if;

  -- A sent quote edited after the customer loaded it: the stale page is refused.
  update public.quotes set status = 'sent' where id = audit_quote_id;
  update public.quotes set quote_data = jsonb_set(quote_data, '{line_items,0,description}', '"Audit labour (revised)"')
    where id = audit_quote_id;
  if (select version from public.quotes where id = audit_quote_id) <> v + 1 then raise exception 'Content edit did not bump the version'; end if;
  result := public.accept_quote(token, 'Audit Customer', 'customer@example.invalid', 'audit/signature.png', null, null, agreed, v);
  if result ->> 'error' is distinct from 'quote_changed' then raise exception 'Stale version accepted: %', result; end if;
  update public.quotes set total_amount = agreed + 10 where id = audit_quote_id;
  if (select version from public.quotes where id = audit_quote_id) <> v + 2 then raise exception 'Total change did not bump the version'; end if;
  result := public.accept_quote(token, 'Audit Customer', 'customer@example.invalid', 'audit/signature.png', null, null, agreed, v + 2);
  if result ->> 'error' is distinct from 'quote_changed' then raise exception 'Stale total accepted: %', result; end if;
  update public.quotes set total_amount = agreed where id = audit_quote_id;
  v := v + 3;

  -- Only a live offer can be accepted; refusals leave the row untouched.
  foreach state in array array['draft', 'expired', 'scheduled', 'in_progress', 'completed', 'declined', 'accepted'] loop
    update public.quotes set status = state where id = audit_quote_id;
    result := public.accept_quote(token, 'Audit Customer', 'customer@example.invalid', 'audit/signature.png', null, null, agreed, v);
    if result ->> 'error' is distinct from (case state when 'declined' then 'declined'
        when 'accepted' then 'already_accepted' else 'not_available' end) then
      raise exception 'Unexpected accept result for %: %', state, result;
    end if;
    if (select status from public.quotes where id = audit_quote_id) <> state then raise exception 'Refused accept changed %', state; end if;
  end loop;
  update public.quotes set status = 'viewed', expires_at = now() - interval '1 day' where id = audit_quote_id;
  if public.accept_quote(token, 'A', 'a@example.invalid', 'p', null, null, agreed, v) ->> 'error' <> 'expired' then raise exception 'Expired quote accepted'; end if;
  update public.quotes set expires_at = now() + interval '1 day', deleted_at = now() where id = audit_quote_id;
  if public.accept_quote(token, 'A', 'a@example.invalid', 'p', null, null, agreed, v) ->> 'error' <> 'not_found' then raise exception 'Deleted quote accepted'; end if;
  if public.accept_quote('missing-audit-token', 'A', 'a@example.invalid', 'p', null, null, agreed, v) ->> 'error' <> 'not_found' then raise exception 'Unknown token accepted'; end if;
  update public.quotes set deleted_at = null where id = audit_quote_id;
  if exists(select 1 from public.quotes where id = audit_quote_id and (accepted_at is not null or accepted_total is not null))
    or (select count(*) from public.quote_events where quote_id = audit_quote_id and type = 'accepted') <> accepted_events then
    raise exception 'A refused accept recorded an acceptance';
  end if;

  -- The current version and total are accepted; the agreed figures come from the row.
  result := public.accept_quote(token, 'Audit Customer', 'customer@example.invalid', 'audit/signature.png', null, null, agreed, v);
  if (result ->> 'ok')::boolean is not true then raise exception 'Current version refused: %', result; end if;
  if not exists(select 1 from public.quotes where id = audit_quote_id and status = 'accepted'
      and accepted_total = agreed and accepted_quote_version = v and version = v and accepted_name = 'Audit Customer') then
    raise exception 'Acceptance not recorded from the locked row';
  end if;
  if (select count(*) from public.quote_events where quote_id = audit_quote_id and type = 'accepted') <> accepted_events + 1 then
    raise exception 'Acceptance event missing';
  end if;
  if public.accept_quote(token, 'Replay', 'r@example.invalid', 'p', null, null, agreed, v) ->> 'error' <> 'already_accepted' then
    raise exception 'Acceptance replayed';
  end if;

  -- Accepted and every later or unknown status is locked, for owners and the service role alike.
  foreach state in array array['accepted', 'scheduled', 'in_progress', 'completed', 'invoiced'] loop
    update public.quotes set status = state where id = audit_quote_id;
    begin
      update public.quotes set total_amount = total_amount + 1 where id = audit_quote_id;
      raise exception 'Locked % total changed', state;
    exception when sqlstate '55000' then null; end;
    begin
      update public.quotes set quote_data = jsonb_set(quote_data, '{line_items,0,unit_price}', '999') where id = audit_quote_id;
      raise exception 'Locked % price changed', state;
    exception when sqlstate '55000' then null; end;
    begin
      update public.quotes set quote_data = null, total_amount = null where id = audit_quote_id;
      raise exception 'Locked % quote wiped', state;
    exception when sqlstate '55000' then null; end;
  end loop;
  begin
    update public.quotes set status = 'draft', quote_data = jsonb_set(quote_data, '{terms}', '"Changed"') where id = audit_quote_id;
    raise exception 'Locked quote edited while leaving its status';
  exception when sqlstate '55000' then null; end;
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  set local role authenticated;
  begin
    update public.quotes set quote_data = jsonb_set(quote_data, '{client,name}', '"Someone else"') where id = audit_quote_id;
    raise exception 'Owner edited a locked quote';
  exception when sqlstate '55000' then null; end;
  update public.quotes set quote_data = quote_data || '{"transcript":{"cleaned":"Owner note"}}'::jsonb where id = audit_quote_id;
  reset role;
  set local role service_role;
  begin
    update public.quotes set total_amount = 1 where id = audit_quote_id;
    raise exception 'Service role repriced a locked quote';
  exception when sqlstate '55000' then null; end;
  reset role;
  perform public.append_quote_chat_messages(audit_quote_id, '[{"role":"customer","content":"After acceptance"}]'::jsonb);
  if not exists(select 1 from public.quotes where id = audit_quote_id and version = v and total_amount = agreed
      and quote_data #>> '{line_items,0,description}' = 'Audit labour (revised)') then
    raise exception 'Locked quote content or version changed';
  end if;

  -- Revisable offers stay editable by their owner, and each edit is versioned.
  update public.quotes set status = 'draft' where id = audit_quote_id;
  set local role authenticated;
  update public.quotes set quote_data = jsonb_set(quote_data, '{terms}', '"Owner revision"') where id = audit_quote_id;
  reset role;
  if (select version from public.quotes where id = audit_quote_id) <> v + 1 then raise exception 'Owner draft edit not versioned'; end if;
  set local role service_role;
  update public.quotes set quote_data = jsonb_set(quote_data, '{terms}', '"Service revision"') where id = audit_quote_id;
  reset role;
  if (select version from public.quotes where id = audit_quote_id) <> v + 2 then raise exception 'Service-role draft edit not versioned'; end if;

  if has_function_privilege('anon', 'public.accept_quote(text,text,text,text,text,text,numeric,integer)', 'execute')
    or has_function_privilege('authenticated', 'public.accept_quote(text,text,text,text,text,text,numeric,integer)', 'execute')
    or not has_function_privilege('service_role', 'public.accept_quote(text,text,text,text,text,text,numeric,integer)', 'execute')
    or has_function_privilege('anon', 'public.quote_customer_content(jsonb)', 'execute') then
    raise exception 'Unexpected accept/guard grants';
  end if;
end $$;
rollback;
\echo Public quote RPC privacy, totals, grants, lifecycle, idempotency, versioning, accept and lock checks passed.
