-- Audit 2026-09-24 — quote lifecycle integrity. Additive: two new quote columns
-- with defaults, one trigger, and replacements for two service-only RPCs. No
-- customer row is deleted or rewritten.
--
-- 1. Post-acceptance lock. Once a quote is accepted (or scheduled, in progress,
--    completed, or any status that is not a revisable offer) its
--    customer-visible content — everything the public page, the quote PDF and
--    create_invoice_from_quote read — can no longer change. Mirrors
--    isQuoteLocked() in src/lib/lifecycle/lock.ts, which every app writer
--    checks first; this trigger is the authority (SQLSTATE 55000).
-- 2. Versioning. quotes.version increments whenever that content changes, so
--    the public accept can prove the customer saw the current revision.
--    quotes.pdf_version records the revision the stored send-time PDF was
--    rendered from; the public PDF route re-renders whenever the two differ.
--    Existing stored PDFs have no recorded revision (null), so they are
--    re-rendered from the current quote until the tradie next sends.
-- 3. accept_quote keeps the live 15 Sep behaviour (declined guard, deleted ->
--    not_found) and restores the 6 Sep guards that replacement dropped: only a
--    sent/viewed quote with a valid total can be accepted, the caller's
--    version and total must match the locked row (quote_changed), and
--    accepted_total / accepted_quote_version come from the row, never the
--    caller.
-- 4. get_quote_by_token also returns the version the public page renders.
--
-- Order: apply this BEFORE activating the matching app release (the new app
-- selects quotes.version / pdf_version). The previous app keeps working with
-- it, except that a quote edited after this is applied cannot be accepted
-- through the old accept route (it refuses as quote_changed) until the new
-- release is live. Checks: deploy/test-public-quote-rpcs.sql and
-- deploy/test-quote-workflow-rpcs.sql.
begin;
set local lock_timeout = '5s';

alter table public.quotes add column if not exists version integer not null default 1;
alter table public.quotes add column if not exists pdf_version integer;
comment on column public.quotes.version is
  'Revision of the customer-visible content. Maintained only by the quotes_guard_content trigger; accept_quote requires the caller to present it.';
comment on column public.quotes.pdf_version is
  'Revision the stored send-time PDF (pdf_path) was rendered from. The public PDF is re-rendered when this differs from version.';

-- The fields a customer sees: the public page projection (get_quote_by_token)
-- plus the quote PDF's extra markup_pct/total/currency. Internal keys such as
-- chat_history, transcript, notes and review metadata are deliberately absent,
-- so chat and private annotations never bump the version or trip the lock.
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
      select jsonb_agg(jsonb_build_object(
        'type', item -> 'type', 'description', item -> 'description',
        'quantity', item -> 'quantity', 'unit', item -> 'unit',
        'unit_price', item -> 'unit_price', 'line_total', item -> 'line_total'
      ) order by ordinal)
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
-- Called by the trigger under the updating role, so writers need EXECUTE.
revoke all on function public.quote_customer_content(jsonb) from public, anon;
grant execute on function public.quote_customer_content(jsonb) to authenticated, service_role;

create or replace function public.guard_quote_content()
returns trigger language plpgsql set search_path = '' as $$
declare
  -- Keep in sync with EDITABLE_QUOTE_STATUSES in src/lib/lifecycle/lock.ts.
  editable constant text[] := array['draft', 'sent', 'viewed', 'declined', 'expired'];
begin
  -- The version is maintained here only; a direct write never moves it.
  new.version := old.version;
  if public.quote_customer_content(new.quote_data)
       is not distinct from public.quote_customer_content(old.quote_data)
     and new.total_amount is not distinct from old.total_amount
     and new.currency is not distinct from old.currency then
    return new;
  end if;
  if old.status <> all (editable) or new.status <> all (editable) then
    raise exception 'Quote % is locked after acceptance', old.id
      using errcode = '55000',
            hint = 'Accepted quotes cannot change lines, prices or client details.';
  end if;
  new.version := old.version + 1;
  return new;
end;
$$;
revoke all on function public.guard_quote_content() from public, anon, authenticated;

drop trigger if exists quotes_guard_content on public.quotes;
create trigger quotes_guard_content
  before update of quote_data, total_amount, currency, version on public.quotes
  for each row execute function public.guard_quote_content();

create or replace function public.accept_quote(p_token text, p_name text, p_email text,
  p_signature_path text, p_ip text, p_user_agent text, p_total numeric, p_version integer)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare q_record public.quotes%rowtype;
begin
  select * into q_record from public.quotes where public_token = p_token limit 1 for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  if q_record.deleted_at is not null then
    return jsonb_build_object('error', 'not_found');
  end if;
  if q_record.expires_at is not null and q_record.expires_at < now() then
    return jsonb_build_object('error', 'expired');
  end if;
  if q_record.status = 'accepted' then
    return jsonb_build_object('error', 'already_accepted');
  end if;
  if q_record.status = 'declined' then
    return jsonb_build_object('error', 'declined');
  end if;
  -- Restored 6 Sep guards: only a live offer with a usable total is acceptable.
  if q_record.status not in ('sent', 'viewed') then
    return jsonb_build_object('error', 'not_available');
  end if;
  if q_record.total_amount is null or q_record.total_amount < 0
     or q_record.total_amount::text in ('NaN', 'Infinity', '-Infinity') then
    return jsonb_build_object('error', 'not_available');
  end if;
  -- The customer must have been shown this exact revision and total; the quote
  -- may have been edited between their page load and this row lock. The total
  -- is compared to the cent because the page round-trips it through JSON.
  if p_version is distinct from q_record.version
     or round(p_total, 2) is distinct from round(q_record.total_amount, 2) then
    return jsonb_build_object('error', 'quote_changed');
  end if;
  update public.quotes set
    status = 'accepted', accepted_at = now(), accepted_name = p_name,
    accepted_email = p_email, signature_path = p_signature_path,
    accepted_ip = p_ip, accepted_user_agent = p_user_agent,
    accepted_total = q_record.total_amount, accepted_quote_version = q_record.version
  where id = q_record.id;
  insert into public.quote_events (quote_id, type, metadata)
    values (q_record.id, 'accepted', jsonb_build_object('name', p_name));
  return jsonb_build_object('ok', true, 'quote_id', q_record.id);
end $function$;
revoke all on function public.accept_quote(text,text,text,text,text,text,numeric,integer) from public, anon, authenticated;
grant execute on function public.accept_quote(text,text,text,text,text,text,numeric,integer) to service_role;

-- Unchanged from the live 13 Sep definition apart from the added 'version'.
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
revoke all on function public.get_quote_by_token(text) from public, anon, authenticated;
grant execute on function public.get_quote_by_token(text) to service_role;

commit;
notify pgrst, 'reload schema';
