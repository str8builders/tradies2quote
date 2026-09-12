-- Restore the two server-only contracts used by public quote pages.
-- Explicit projection is required: quote_data contains private AI metadata.
create or replace function public.get_quote_by_token(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', q.id, 'status', q.status, 'created_at', q.created_at,
    'sent_at', q.sent_at, 'expires_at', q.expires_at,
    'accepted_at', q.accepted_at, 'accepted_name', q.accepted_name,
    'accepted_quote_version', coalesce(q.accepted_quote_version, 1),
    'currency', coalesce(nullif(q.currency, ''), 'NZD'),
    'has_pdf', q.pdf_path is not null,
    'has_signature', q.signature_path is not null,
    'has_logo', p.logo_url is not null,
    'business_name', p.business_name, 'business_email', p.email,
    'business_phone', p.phone,
    'client', jsonb_build_object(
      'name', q.quote_data #>> '{client,name}',
      'address', q.quote_data #>> '{client,address}',
      'email', q.quote_data #>> '{client,email}',
      'phone', q.quote_data #>> '{client,phone}'
    ),
    'job_summary', q.quote_data ->> 'job_summary',
    'line_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', item -> 'type', 'description', item -> 'description',
        'quantity', item -> 'quantity', 'unit', item -> 'unit',
        'unit_price', item -> 'unit_price', 'line_total', item -> 'line_total'
      ) order by ordinal)
      from jsonb_array_elements(case when jsonb_typeof(q.quote_data -> 'line_items') = 'array'
        then q.quote_data -> 'line_items' else '[]'::jsonb end)
        with ordinality as items(item, ordinal)
    ), '[]'::jsonb),
    'materials_subtotal', coalesce(q.quote_data -> 'materials_subtotal', '0'::jsonb),
    'labour_subtotal', coalesce(q.quote_data -> 'labour_subtotal', '0'::jsonb),
    'markup_amount', coalesce(q.quote_data -> 'markup_amount', '0'::jsonb),
    'subtotal_before_tax', coalesce(q.quote_data -> 'subtotal_before_tax', '0'::jsonb),
    'tax_amount', coalesce(q.quote_data -> 'tax_amount', '0'::jsonb),
    'total', q.total_amount,
    'tax_label', coalesce(q.quote_data ->> 'tax_label', 'GST'),
    'tax_rate', coalesce(q.quote_data -> 'tax_rate', '0'::jsonb),
    'terms', q.quote_data ->> 'terms'
  )
  from public.quotes q
  left join public.profiles p on p.id = q.user_id
  where q.public_token = p_token and q.deleted_at is null
  limit 1;
$$;

create or replace function public.mark_quote_viewed(p_token text)
returns void language plpgsql security definer set search_path = '' as $$
declare viewed_quote_id uuid;
begin
  -- Atomic predicate prevents concurrent page requests recording two views.
  update public.quotes set status = 'viewed', viewed_at = coalesce(viewed_at, now())
  where public_token = p_token and status = 'sent' and deleted_at is null
    and (expires_at is null or expires_at >= now())
  returning id into viewed_quote_id;
  if viewed_quote_id is not null then
    insert into public.quote_events(quote_id, type, metadata)
      values (viewed_quote_id, 'viewed', '{}'::jsonb);
  end if;
end;
$$;

revoke all on function public.get_quote_by_token(text) from public, anon, authenticated;
revoke all on function public.mark_quote_viewed(text) from public, anon, authenticated;
grant execute on function public.get_quote_by_token(text) to service_role;
grant execute on function public.mark_quote_viewed(text) to service_role;
notify pgrst, 'reload schema';
