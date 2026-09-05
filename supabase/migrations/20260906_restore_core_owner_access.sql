-- Restore missing core account policies in the reconstructed Sydney database.
-- Every policy remains scoped to the authenticated owner; shared materials are read-only.
-- Server-owned ledgers, billing, AI logs and public quote-token access remain server-only.
-- Defaults affect new rows only. No customer records are deleted or rewritten.

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.materials enable row level security;
alter table public.material_aliases enable row level security;
alter table public.invoices enable row level security;
alter table public.push_subscriptions enable row level security;

-- RLS does not protect TRUNCATE or schema operations. API roles need only ordinary DML.
revoke all on public.profiles, public.clients, public.quotes, public.quote_items,
  public.materials, public.material_aliases, public.invoices, public.push_subscriptions from anon;
revoke truncate, references, trigger on public.profiles, public.clients, public.quotes, public.quote_items,
  public.materials, public.material_aliases, public.invoices, public.push_subscriptions from authenticated;
grant select, insert, update, delete on public.clients, public.quotes, public.quote_items,
  public.materials, public.material_aliases, public.invoices, public.push_subscriptions to authenticated;

-- A client must never restart its own trial by editing the profile.
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant insert (id,address,avatar_url,ai_consent_at,ai_consent_version,business_name,country,currency,
  default_labour_rate,default_markup_pct,email,gst_number,logo_url,min_margin_percent,phone,tax_label,tax_rate,updated_at,payment_instructions)
  on public.profiles to authenticated;
grant update (id,address,avatar_url,ai_consent_at,ai_consent_version,business_name,country,currency,
  default_labour_rate,default_markup_pct,email,gst_number,logo_url,min_margin_percent,phone,tax_label,tax_rate,updated_at,payment_instructions)
  on public.profiles to authenticated;
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using ((select auth.uid())=id);
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert to authenticated with check ((select auth.uid())=id);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid())=id) with check ((select auth.uid())=id);

drop policy if exists clients_all_own on public.clients;
create policy clients_all_own on public.clients for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists quotes_all_own on public.quotes;
create policy quotes_all_own on public.quotes for all to authenticated
  using ((select auth.uid())=user_id)
  with check ((select auth.uid())=user_id and (client_id is null or exists (
    select 1 from public.clients c where c.id=client_id and c.user_id=(select auth.uid()))));
drop policy if exists quote_items_all_own on public.quote_items;
create policy quote_items_all_own on public.quote_items for all to authenticated
  using (exists(select 1 from public.quotes q where q.id=quote_id and q.user_id=(select auth.uid())))
  with check (exists(select 1 from public.quotes q where q.id=quote_id and q.user_id=(select auth.uid())));

drop policy if exists materials_select_accessible on public.materials;
create policy materials_select_accessible on public.materials for select to authenticated using (user_id is null or user_id=(select auth.uid()));
drop policy if exists materials_insert_own on public.materials;
create policy materials_insert_own on public.materials for insert to authenticated with check (user_id=(select auth.uid()));
drop policy if exists materials_update_own on public.materials;
create policy materials_update_own on public.materials for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
drop policy if exists materials_delete_own on public.materials;
create policy materials_delete_own on public.materials for delete to authenticated using (user_id=(select auth.uid()));

drop policy if exists material_aliases_select_accessible on public.material_aliases;
create policy material_aliases_select_accessible on public.material_aliases for select to authenticated using (
  exists(select 1 from public.materials m where m.id=material_id and (m.user_id is null or m.user_id=(select auth.uid()))));
drop policy if exists material_aliases_insert_own on public.material_aliases;
create policy material_aliases_insert_own on public.material_aliases for insert to authenticated with check (
  exists(select 1 from public.materials m where m.id=material_id and m.user_id=(select auth.uid())));
drop policy if exists material_aliases_update_own on public.material_aliases;
create policy material_aliases_update_own on public.material_aliases for update to authenticated using (
  exists(select 1 from public.materials m where m.id=material_id and m.user_id=(select auth.uid()))) with check (
  exists(select 1 from public.materials m where m.id=material_id and m.user_id=(select auth.uid())));
drop policy if exists material_aliases_delete_own on public.material_aliases;
create policy material_aliases_delete_own on public.material_aliases for delete to authenticated using (
  exists(select 1 from public.materials m where m.id=material_id and m.user_id=(select auth.uid())));

drop policy if exists invoices_all_own on public.invoices;
create policy invoices_all_own on public.invoices for all to authenticated using (user_id=(select auth.uid()))
  with check (user_id=(select auth.uid()) and exists(select 1 from public.quotes q where q.id=quote_id and q.user_id=(select auth.uid())));
drop policy if exists push_subscriptions_all_own on public.push_subscriptions;
create policy push_subscriptions_all_own on public.push_subscriptions for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

alter table public.quotes alter column accepted_quote_version set default 0;
alter table public.quotes alter column chat_disabled set default false;
-- Support both the reconstructed JSONB column and the repaired scalar column.
do $defaults$
begin
  if (select atttypid = 'jsonb'::regtype from pg_attribute
      where attrelid='public.quotes'::regclass and attname='status') then
    alter table public.quotes alter column status set default '"draft"'::jsonb;
  else
    alter table public.quotes alter column status set default 'draft';
  end if;
end $defaults$;
alter table public.materials alter column active set default true;
alter table public.materials alter column attributes set default '{}'::jsonb;
alter table public.materials alter column country set default 'NZ';
alter table public.materials alter column gst_included set default false;
alter table public.materials alter column is_ai_estimated set default false;
alter table public.materials alter column usage_count set default 0;
alter table public.material_aliases alter column source set default 'user';
