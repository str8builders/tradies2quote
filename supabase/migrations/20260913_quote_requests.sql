-- Public "Request a quote" intake.
--
-- A tradie opts in by getting a request slug; anyone with the link can
-- describe a job. The server (service role) creates the client + draft
-- quote on the tradie's account, records the request here, notifies the
-- tradie and generates the quote. Tradies read their own requests through
-- RLS; inserts happen only through the service role.

alter table public.profiles add column if not exists request_slug text;
create unique index if not exists profiles_request_slug_key
  on public.profiles (request_slug) where request_slug is not null;
alter table public.profiles drop constraint if exists profiles_request_slug_shape;
alter table public.profiles add constraint profiles_request_slug_shape
  check (request_slug is null or request_slug ~ '^[a-z0-9][a-z0-9-]{0,46}[a-z0-9]$');
grant select (request_slug), update (request_slug) on public.profiles to authenticated;

create table if not exists public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  client_name text not null,
  client_email text,
  client_phone text,
  site_address text,
  description text not null,
  status text not null default 'new'
    check (status in ('new', 'generated', 'generation_failed', 'dismissed')),
  error_message text,
  source_ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  generated_at timestamptz,
  seen_at timestamptz
);

create index if not exists quote_requests_user_created_idx
  on public.quote_requests (user_id, created_at desc);
create index if not exists quote_requests_quote_idx
  on public.quote_requests (quote_id);

alter table public.quote_requests enable row level security;

drop policy if exists quote_requests_select_own on public.quote_requests;
create policy quote_requests_select_own on public.quote_requests
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists quote_requests_update_own on public.quote_requests;
create policy quote_requests_update_own on public.quote_requests
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on public.quote_requests from public, anon;
grant select, update (status, seen_at) on public.quote_requests to authenticated;
grant all on public.quote_requests to service_role;
