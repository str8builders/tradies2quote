-- Audit 2026-09-15: the migration-tracking table had no row security and the
-- default PostgREST grants, so the public anon key could read, edit or
-- truncate it. It is only ever written by the migration runner with the
-- service role, which bypasses RLS, so locking it changes nothing for us.
alter table if exists public._applied_migrations enable row level security;
revoke all on table public._applied_migrations from anon, authenticated;
