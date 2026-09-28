-- Audit 2026-09-28 — customer chat can no longer be erased by a quote save.
--
-- The client's chat lives in quotes.quote_data.chat_history and is appended
-- atomically by append_quote_chat_messages. But the job page, the classic
-- editor and two quote routes save the whole quote_data they loaded earlier,
-- so a save made after the client wrote wiped the newer messages (and any
-- note the AI left for the tradie).
--
-- From now on only append_quote_chat_messages can change chat_history: it
-- marks its own transaction, and every other write keeps the stored history.
-- New quotes never start with someone else's chat (a copied quote_data).
--
-- Additive and idempotent: two trigger functions, two triggers and a
-- replacement for append_quote_chat_messages with the same signature and
-- grants. No row is rewritten. Safe to apply before or after the app release.
begin;
set local lock_timeout = '5s';

create or replace function public.keep_quote_chat_history()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_setting('t2q.chat_append', true) is not distinct from 'on' then
    return new;
  end if;
  if new.quote_data is null
     or (new.quote_data -> 'chat_history') is not distinct from (old.quote_data -> 'chat_history') then
    return new;
  end if;
  if old.quote_data is not null and old.quote_data ? 'chat_history' then
    new.quote_data := jsonb_set(new.quote_data, '{chat_history}', old.quote_data -> 'chat_history', true);
  else
    new.quote_data := new.quote_data - 'chat_history';
  end if;
  return new;
end;
$$;
revoke all on function public.keep_quote_chat_history() from public, anon, authenticated;

drop trigger if exists quotes_keep_chat_history on public.quotes;
create trigger quotes_keep_chat_history
  before update of quote_data on public.quotes
  for each row execute function public.keep_quote_chat_history();

create or replace function public.strip_new_quote_chat_history()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.quote_data is not null and new.quote_data ? 'chat_history' then
    new.quote_data := new.quote_data - 'chat_history';
  end if;
  return new;
end;
$$;
revoke all on function public.strip_new_quote_chat_history() from public, anon, authenticated;

drop trigger if exists quotes_strip_new_chat_history on public.quotes;
create trigger quotes_strip_new_chat_history
  before insert on public.quotes
  for each row execute function public.strip_new_quote_chat_history();

-- Unchanged from 20260913_restore_quote_workflow_rpcs.sql apart from marking
-- its own transaction so quotes_keep_chat_history lets the append through.
create or replace function public.append_quote_chat_messages(p_quote_id uuid, p_messages jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare appended boolean;
begin
  if jsonb_typeof(p_messages) is distinct from 'array' then
    raise exception 'Messages must be an array' using errcode = '22023';
  end if;
  perform set_config('t2q.chat_append', 'on', true);
  update public.quotes set quote_data = jsonb_set(coalesce(quote_data, '{}'::jsonb), '{chat_history}',
    (case when jsonb_typeof(quote_data -> 'chat_history') = 'array'
      then quote_data -> 'chat_history' else '[]'::jsonb end) || p_messages, true)
  where id = p_quote_id and deleted_at is null and chat_disabled is not true;
  appended := found;  -- read before PERFORM, which resets FOUND
  perform set_config('t2q.chat_append', 'off', true);
  if not appended then raise exception 'Quote chat unavailable' using errcode = 'P0002'; end if;
end;
$$;
revoke all on function public.append_quote_chat_messages(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.append_quote_chat_messages(uuid, jsonb) to service_role;

commit;
notify pgrst, 'reload schema';
