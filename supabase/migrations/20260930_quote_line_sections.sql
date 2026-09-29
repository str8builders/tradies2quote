-- Trade sections on quote lines (Framing, Linings, Joinery…), set by the
-- plan-set reader, so the client's quote page can show each trade under its
-- own heading with a subtotal, as the PDF does.
--
-- 1. get_quote_by_token passes a line's `section` through, and only when the
--    line has one: every existing quote's payload stays byte-for-byte the same.
-- 2. quote_customer_content counts it as content the client sees, the same
--    way: a section change bumps quotes.version and is locked after
--    acceptance like any other visible change. Existing rows compute the
--    same content as before, so nothing is bumped by this migration.
--
-- Both bodies are the live 24 Sep definitions with only that addition;
-- create or replace keeps the owner and grants. Safe to run twice.
-- Rollback: rollback_20260930_quote_line_sections.sql.

create or replace function public.get_quote_by_token(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', q.id, 'status', q.status, 'created_at', q.created_at,
    'sent_at', q.sent_at, 'expires_at', q.expires_at,
    'accepted_at', q.accepted_at, 'accepted_name', q.accepted_name,
    'accepted_quote_version', coalesce(q.accepted_quote_version, 1),
    'version', q.version,
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
      select jsonb_agg((jsonb_build_object(
        'type', item -> 'type', 'description', item -> 'description',
        'quantity', item -> 'quantity', 'unit', item -> 'unit',
        'unit_price', item -> 'unit_price', 'line_total', item -> 'line_total'
      ) || case when jsonb_typeof(item -> 'section') = 'string'
                then jsonb_build_object('section', item -> 'section')
                else '{}'::jsonb end) order by ordinal)
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

create or replace function public.quote_customer_content(p_quote_data jsonb)
returns jsonb language sql immutable parallel safe set search_path = '' as $$
  select jsonb_build_object(
    'client', jsonb_build_object(
      'name', p_quote_data #> '{client,name}',
      'address', p_quote_data #> '{client,address}',
      'email', p_quote_data #> '{client,email}',
      'phone', p_quote_data #> '{client,phone}'
    ),
    'job_summary', p_quote_data -> 'job_summary',
    'line_items', coalesce((
      select jsonb_agg((jsonb_build_object(
        'type', item -> 'type', 'description', item -> 'description',
        'quantity', item -> 'quantity', 'unit', item -> 'unit',
        'unit_price', item -> 'unit_price', 'line_total', item -> 'line_total'
      ) || case when jsonb_typeof(item -> 'section') = 'string'
                then jsonb_build_object('section', item -> 'section')
                else '{}'::jsonb end) order by ordinal)
      from jsonb_array_elements(case when jsonb_typeof(p_quote_data -> 'line_items') = 'array'
        then p_quote_data -> 'line_items' else '[]'::jsonb end)
        with ordinality as items(item, ordinal)
    ), '[]'::jsonb),
    'materials_subtotal', p_quote_data -> 'materials_subtotal',
    'labour_subtotal', p_quote_data -> 'labour_subtotal',
    'markup_pct', p_quote_data -> 'markup_pct',
    'markup_amount', p_quote_data -> 'markup_amount',
    'subtotal_before_tax', p_quote_data -> 'subtotal_before_tax',
    'tax_amount', p_quote_data -> 'tax_amount',
    'tax_label', p_quote_data -> 'tax_label',
    'tax_rate', p_quote_data -> 'tax_rate',
    'total', p_quote_data -> 'total',
    'currency', p_quote_data -> 'currency',
    'terms', p_quote_data -> 'terms'
  );
$$;
