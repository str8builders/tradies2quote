begin;
alter table public.quote_requests add column if not exists ai_consent_version text;
alter table public.quote_requests add column if not exists ai_consent_at timestamptz;
notify pgrst,'reload schema';
commit;
