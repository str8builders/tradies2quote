-- Repair schema inferred from TypeScript during the Sydney reconstruction.
-- Apply in a transaction after restore_core_owner_access, with a database backup.
-- Scalar conversions preserve values. Unexpected JSON or duplicate business keys
-- abort the transaction rather than discard, merge or invent customer records.

do $scalar_types$
declare r record; invalid boolean;
begin
  for r in select * from (values ('quotes','status'),('invoices','status'),
    ('quote_items','type'),('quote_events','type')) as columns(table_name,column_name)
  loop
    if (select atttypid='jsonb'::regtype from pg_attribute
        where attrelid=format('public.%I',r.table_name)::regclass and attname=r.column_name) then
      execute format('select exists(select 1 from public.%I where %I is not null and jsonb_typeof(%I) <> ''string'')',r.table_name,r.column_name,r.column_name) into invalid;
      if invalid then raise exception 'Expected scalar strings in %.%; no records changed',r.table_name,r.column_name; end if;
      execute format('alter table public.%I alter column %I drop default',r.table_name,r.column_name);
      execute format('alter table public.%I alter column %I type text using (%I #>> ''{}'')',r.table_name,r.column_name,r.column_name);
    end if;
  end loop;
  -- External provider IDs and run/project labels are strings, not UUIDs.
  for r in select * from (values ('subscriptions','stripe_customer_id'),
    ('subscriptions','stripe_subscription_id'),('payment_accounts','stripe_account_id'),
    ('payments','stripe_checkout_session_id'),('payments','stripe_payment_intent_id'),
    ('stripe_webhook_events','event_id'),('agent_events','run_id'),('agent_runs','run_id'),
    ('plan_files','project_id'),('lifecycle_emails','provider_message_id')) as columns(table_name,column_name)
  loop
    if (select atttypid='uuid'::regtype from pg_attribute
        where attrelid=format('public.%I',r.table_name)::regclass and attname=r.column_name) then
      execute format('alter table public.%I alter column %I type text using %I::text',r.table_name,r.column_name,r.column_name);
    end if;
  end loop;
end $scalar_types$;

alter table public.quotes alter column status set default 'draft';
alter table public.invoices alter column status set default 'draft';

-- Restore the original migration defaults; these affect future inserts only.
alter table public.agent_runs alter column approval_required set default false;
alter table public.agent_runs alter column started_at set default now();
alter table public.feature_settings alter column auto_review_enabled set default false;
alter table public.feature_settings alter column auto_followup_enabled set default false;
alter table public.kit_items alter column type set default 'material';
alter table public.kit_items alter column quantity set default 1;
alter table public.kit_items alter column unit_price set default 0;
alter table public.kit_items alter column position set default 0;
alter table public.payment_accounts alter column charges_enabled set default false;
alter table public.payment_accounts alter column details_submitted set default false;
alter table public.payment_accounts alter column deposit_pct set default 50;
alter table public.payments alter column status set default 'pending';
alter table public.review_requests alter column channel set default 'email';
alter table public.review_requests alter column status set default 'sent';
alter table public.review_requests alter column sent_at set default now();
alter table public.quote_followups alter column channel set default 'email';
alter table public.quote_followups alter column sent_at set default now();
alter table public.lifecycle_emails alter column sent_at set default now();
alter table public.stripe_webhook_events alter column received_at set default now();
alter table public.plan_files alter column page_count set default 1;
alter table public.plan_files alter column status set default 'uploaded';
alter table public.plan_files alter column uploaded_at set default now();
alter table public.plan_sheets alter column sheet_type set default 'unknown';
alter table public.plan_sheets alter column classification_confidence set default 0;
alter table public.plan_sheets alter column classification_basis set default '[]'::jsonb;
alter table public.plan_sheets alter column review_required set default false;
alter table public.plan_sheets alter column review_reasons set default '[]'::jsonb;
alter table public.plan_sheets alter column status set default 'classified';
alter table public.tradie_memories alter column value set default '{}'::jsonb;
alter table public.tradie_memories alter column strength set default 1;
alter table public.tradie_memories alter column provenance set default '{}'::jsonb;
alter table public.tradie_memories alter column status set default 'active';
alter table public.tradie_memories alter column first_seen_at set default now();
alter table public.tradie_memories alter column last_seen_at set default now();
alter table public.job_type_rules alter column outdoor set default true;
alter table public.job_type_rules alter column default_actions set default '{}'::jsonb;
alter table public.job_type_rules alter column is_system set default true;
alter table public.weather_forecasts_cache alter column provider set default 'open_meteo';
alter table public.weather_forecasts_cache alter column generated_at set default now();
alter table public.weather_forecasts_cache alter column hourly set default '[]'::jsonb;
alter table public.weather_forecasts_cache alter column alerts set default '[]'::jsonb;
alter table public.weather_alerts_cache alter column provider set default 'open_meteo';
alter table public.weather_alerts_cache alter column generated_at set default now();
alter table public.weather_alerts_cache alter column alerts set default '[]'::jsonb;
alter table public.quote_site_context alter column indoor_outdoor set default 'outdoor';
alter table public.job_weather_assessments alter column provider set default 'open_meteo';
alter table public.job_weather_assessments alter column generated_at set default now();
alter table public.job_weather_assessments alter column risk_level set default 'low';
alter table public.job_weather_assessments alter column risk_types set default '[]'::jsonb;
alter table public.job_weather_assessments alter column triggers_fired set default '[]'::jsonb;
alter table public.job_weather_assessments alter column customer_comms_needed set default false;
alter table public.job_weather_assessments alter column pat_should_run set default false;
alter table public.job_weather_assessments alter column willa_should_run set default false;
alter table public.job_weather_assessments alter column trigger_source set default 'manual';
alter table public.ai_recommendations alter column agent set default 'pat';
alter table public.customer_message_drafts alter column channel set default 'none';
alter table public.customer_message_drafts alter column status set default 'draft';

-- Required conflict targets and replay protection. Duplicate existing keys fail
-- safely: resolution requires reviewing the rows, never automatic deletion.
create unique index if not exists feature_settings_user_id_key on public.feature_settings(user_id);
create unique index if not exists payment_accounts_user_id_key on public.payment_accounts(user_id);
create unique index if not exists subscriptions_user_id_key on public.subscriptions(user_id);
create unique index if not exists stripe_webhook_events_event_id_key on public.stripe_webhook_events(event_id);
create unique index if not exists agent_runs_run_id_key on public.agent_runs(run_id);
create unique index if not exists push_subscriptions_endpoint_key on public.push_subscriptions(endpoint);
create unique index if not exists materials_user_id_name_key on public.materials(user_id,name);
create unique index if not exists quote_site_context_quote_id_key on public.quote_site_context(quote_id);
create unique index if not exists plan_sheets_file_id_sheet_number_key on public.plan_sheets(file_id,sheet_number);
create unique index if not exists review_requests_quote_id_key on public.review_requests(quote_id);
create unique index if not exists quote_followups_quote_id_step_key on public.quote_followups(quote_id,step);
create unique index if not exists tradie_memories_owner_type_key on public.tradie_memories(user_id,memory_type,memory_key);
create unique index if not exists job_type_rules_job_type_key on public.job_type_rules(job_type);
create unique index if not exists quotes_public_token_key on public.quotes(public_token);
create unique index if not exists lifecycle_emails_user_id_kind_key on public.lifecycle_emails(user_id,kind);

-- Restore relationships used by PostgREST embedded selects. NOT VALID preserves
-- historical orphans for explicit review while enforcing all new/changed rows.
do $relationships$
declare r record; constraint_name text;
begin
  for r in select * from (values
    ('quotes','client_id','clients','set null'),
    ('quote_items','quote_id','quotes','cascade'),
    ('invoices','quote_id','quotes','restrict'),
    ('material_aliases','material_id','materials','cascade'),
    ('kit_items','kit_id','kits','cascade'),
    ('plan_files','quote_id','quotes','set null'),
    ('plan_sheets','file_id','plan_files','cascade'),
    ('quote_edit_events','quote_id','quotes','cascade'),
    ('quote_events','quote_id','quotes','cascade'),
    ('quote_followups','quote_id','quotes','cascade'),
    ('review_requests','quote_id','quotes','cascade'),
    ('quote_site_context','quote_id','quotes','cascade'),
    ('job_weather_assessments','quote_id','quotes','cascade'),
    ('ai_recommendations','quote_id','quotes','cascade'),
    ('ai_recommendations','assessment_id','job_weather_assessments','cascade'),
    ('customer_message_drafts','quote_id','quotes','cascade'),
    ('customer_message_drafts','assessment_id','job_weather_assessments','cascade'),
    ('chat_reports','quote_id','quotes','cascade'),
    ('payments','quote_id','quotes','set null')
  ) as relationships(table_name,column_name,parent_table,delete_action)
  loop
    constraint_name := r.table_name || '_' || r.column_name || '_fkey';
    if not exists(select 1 from pg_constraint where conrelid=format('public.%I',r.table_name)::regclass and conname=constraint_name) then
      execute format('alter table public.%I add constraint %I foreign key (%I) references public.%I(id) on delete %s not valid',r.table_name,constraint_name,r.column_name,r.parent_table,r.delete_action);
    end if;
  end loop;
end $relationships$;

-- Existing policies on these dependent tables also need parent ownership;
-- possessing another account's UUID must never attach child data to its record.
drop policy if exists kit_items_all_own on public.kit_items;
create policy kit_items_all_own on public.kit_items for all to authenticated
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()) and exists
    (select 1 from public.kits k where k.id=kit_id and k.user_id=(select auth.uid())));

notify pgrst, 'reload schema';
