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
  if payload ?| array['user_id', 'quote_data', 'voice_transcript', 'accepted_ip', 'pdf_path', 'signature_path'] then
    raise exception 'Private columns leaked';
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
rollback;
\echo Public quote RPC privacy, totals, grants, lifecycle and idempotency checks passed.
