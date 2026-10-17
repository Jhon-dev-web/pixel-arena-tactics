-- AI operations: four safe, reversible switches, the health/incident log, and the reports an AI auditor writes for the owner (depends on 0003 entitlements / payment_events, 0004-0009 snapshots + seasons,
-- 0010 item_certificates, 0011-0015 market, 0016 waitlist, 0020 is_admin()). NOT APPLIED from this repo: the owner runs it (SQL editor or `supabase db push`), in the DEVELOPMENT project first.
-- It is read by static tests (supabase/functions/_shared/__tests__/migration0021.test.ts) and RUN for real in an in-memory Postgres by admin/tests/sql/ops.integration.test.ts. The SQL TEST PLAN at
-- the end is what proves it on the real project.
--
-- WHAT THIS IS (docs/AI_OPS.md has the owner-facing version)
--   * FOUR FLAGS, all false by default: maintenance_mode, market_paused, season_scoring_paused, pass_sales_paused. The game, the portal and the Edge Functions read them through public.ops_status()
--     (four booleans and a timestamp; nothing else; callable by anon on purpose: the maintenance banner must show before login). The functions fail OPEN: if the flags cannot be read, nothing is paused.
--   * Who may change a flag: (a) the owner, from the admin dashboard (public.admin_set_ops_flag, is_admin() only, a note is mandatory, both directions); (b) the watchdog Edge Function, with the
--     service role, through public.ops_pause, which can ONLY switch a flag ON. The code refuses to switch one off (OPS_AUTO_CANNOT_CLEAR): a human clears every flag. The AI auditor has no write path at all.
--   * LOGS: ops_events (health transitions, incidents, flag changes with who and why, AI runs), ops_incidents (one row per open incident: the alert de-duplication state), ops_check_state (consecutive
--     failures per check), ops_function_errors (5-minute buckets of 5xx per Edge Function), ai_reports (what the auditor found), ai_runs (every model call with a cost estimate: the budget guards read it).
--   * READS for the auditor: public.ai_gather_aggregates builds ONE compact jsonb (counts, ids and usernames only: never an e-mail, never a save) the Edge Function checks deterministically first.
--
-- EVERYTHING here is private except what is granted below: the tables have RLS on, no policy, every grant revoked. Functions are security definer with an empty search_path.
--
-- ROLLBACK (by hand; the log tables hold only derived/operational data; the flags go back to "everything open" because the functions fail open):
--   select cron.unschedule('ai-auditor-hourly'); select cron.unschedule('ai-auditor-daily'); select cron.unschedule('ops-watchdog'); select cron.unschedule('ops-prune');   -- only if you scheduled them
--   drop function if exists public.admin_ack_report(uuid);
--   drop function if exists public.admin_set_ops_flag(text, boolean, text);
--   drop function if exists public.admin_ai_cost();
--   drop function if exists public.admin_ai_reports(text, integer, integer);
--   drop function if exists public.admin_ops_overview();
--   drop function if exists public.ops_prune(integer);
--   drop function if exists public.ai_recent_fingerprints(integer);
--   drop function if exists public.ai_report_insert(text, text, text, jsonb, jsonb);
--   drop function if exists public.ai_run_log(text, text, text, integer, integer, numeric, uuid, text);
--   drop function if exists public.ai_budget();
--   drop function if exists public.ai_gather_aggregates(integer);
--   drop function if exists public.ops_health_counts(integer);
--   drop function if exists public.ops_health_probe();
--   drop function if exists public.ops_function_error(text);
--   drop function if exists public.ops_incident_resolve(text);
--   drop function if exists public.ops_incident_alerted(uuid);
--   drop function if exists public.ops_incident_open(text, text, text, jsonb, jsonb);
--   drop function if exists public.ops_event_add(text, text, text, text, boolean, text, text, jsonb);
--   drop function if exists public.ops_checks_record(jsonb);
--   drop function if exists public.ops_pause(text, text, text);
--   drop function if exists public.ops_status();
--   drop table if exists arena_private.ai_runs; drop table if exists arena_private.ai_reports; drop table if exists arena_private.ops_function_errors; drop table if exists arena_private.ops_check_state;
--   drop table if exists arena_private.ops_incidents; drop table if exists arena_private.ops_events; drop table if exists arena_private.ops_flags;

create schema if not exists arena_private;
revoke all on schema arena_private from public, anon, authenticated;
grant usage on schema arena_private to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The flags. Four rows, fixed by a check constraint; nobody inserts or deletes (the service role can only update through the functions below).
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists arena_private.ops_flags (
  key text primary key,
  value boolean not null default false,
  changed_at timestamptz not null default now(),
  -- 'migration' | 'watchdog' | 'admin:<user id>'
  changed_by text not null default 'migration',
  note text,
  constraint ops_flags_key_check check (key in ('maintenance_mode', 'market_paused', 'season_scoring_paused', 'pass_sales_paused')),
  constraint ops_flags_note_check check (note is null or pg_catalog.char_length(note) <= 300)
);

insert into arena_private.ops_flags (key) values ('maintenance_mode'), ('market_paused'), ('season_scoring_paused'), ('pass_sales_paused') on conflict (key) do nothing;

alter table arena_private.ops_flags enable row level security;
revoke all on table arena_private.ops_flags from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The operations log: health transitions, incidents, flag changes (who and why), AI runs. Never read by a client directly (admin_ops_overview shows it to the owner).
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists arena_private.ops_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null,
  source text not null,
  severity text not null default 'info',
  check_name text,
  ok boolean,
  -- who did it: 'watchdog' | 'ai-auditor' | 'admin:<user id>' | 'system'
  actor text,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  constraint ops_events_kind_check check (kind in ('health_check', 'incident_opened', 'incident_reminder', 'incident_resolved', 'flag_change', 'alert_sent', 'alert_failed', 'ai_run', 'report_ack', 'note')),
  constraint ops_events_source_check check (source in ('watchdog', 'ai-auditor', 'admin', 'system')),
  constraint ops_events_severity_check check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  constraint ops_events_summary_check check (pg_catalog.char_length(summary) between 1 and 500)
);

create index if not exists ops_events_created_idx on arena_private.ops_events (created_at desc);
create index if not exists ops_events_kind_idx on arena_private.ops_events (kind, created_at desc);

alter table arena_private.ops_events enable row level security;
revoke all on table arena_private.ops_events from public, anon, authenticated;

-- One row per incident. At most ONE open incident per check (the partial unique index): that is what makes "one alert per incident, a reminder after 30 minutes" possible.
create table if not exists arena_private.ops_incidents (
  id uuid primary key default gen_random_uuid(),
  check_name text not null,
  status text not null default 'open',
  severity text not null default 'high',
  opened_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_alert_at timestamptz,
  alert_count integer not null default 0,
  resolved_at timestamptz,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  -- the flags the watchdog switched on because of this incident: [{ "flag": "market_paused", "changed": true }]
  actions jsonb not null default '[]'::jsonb,
  constraint ops_incidents_status_check check (status in ('open', 'resolved')),
  constraint ops_incidents_severity_check check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  constraint ops_incidents_check_name_check check (check_name ~ '^[a-z0-9_]{1,40}$')
);

create unique index if not exists ops_incidents_one_open_idx on arena_private.ops_incidents (check_name) where status = 'open';
create index if not exists ops_incidents_opened_idx on arena_private.ops_incidents (opened_at desc);

alter table arena_private.ops_incidents enable row level security;
revoke all on table arena_private.ops_incidents from public, anon, authenticated;

-- The streak of each check: how many runs in a row failed, since when. The watchdog decides from this, never from a single blip.
create table if not exists arena_private.ops_check_state (
  check_name text primary key,
  consecutive_failures integer not null default 0,
  first_failed_at timestamptz,
  last_ok_at timestamptz,
  last_checked_at timestamptz not null default now(),
  last_detail jsonb not null default '{}'::jsonb,
  constraint ops_check_state_name_check check (check_name ~ '^[a-z0-9_]{1,40}$')
);

alter table arena_private.ops_check_state enable row level security;
revoke all on table arena_private.ops_check_state from public, anon, authenticated;

-- 5xx answers per Edge Function in 5-minute buckets (a counter, not a log: a bad hour is a few hundred rows of integers).
create table if not exists arena_private.ops_function_errors (
  fn text not null,
  bucket timestamptz not null,
  errors integer not null default 0,
  primary key (fn, bucket),
  constraint ops_function_errors_fn_check check (fn ~ '^[a-z0-9-]{1,40}$')
);

alter table arena_private.ops_function_errors enable row level security;
revoke all on table arena_private.ops_function_errors from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The AI auditor's output. ADVISORY: nothing in the game reads these rows. suggested_actions is a list from a fixed allow-list (review_account, watch, pause_market, pause_scoring, none).
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists arena_private.ai_reports (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  severity text not null,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  suggested_actions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users (id) on delete set null,
  constraint ai_reports_kind_check check (kind in ('anomaly', 'daily', 'incident')),
  constraint ai_reports_severity_check check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  constraint ai_reports_summary_check check (pg_catalog.char_length(summary) between 1 and 2000)
);

create index if not exists ai_reports_open_idx on arena_private.ai_reports (created_at desc) where acknowledged_at is null;
create index if not exists ai_reports_created_idx on arena_private.ai_reports (created_at desc);

alter table arena_private.ai_reports enable row level security;
revoke all on table arena_private.ai_reports from public, anon, authenticated;

-- Every call the auditor/watchdog considered making: the budget guards (runs per day, spend per month) and the owner's cost line read this.
create table if not exists arena_private.ai_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  kind text not null,
  model text,
  -- 'ok' | 'invalid_output' | 'error' = the model was called (counts toward the daily cap); 'skipped_no_signals' | 'skipped_budget' | 'skipped_disabled' = it was not
  status text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  -- ESTIMATE from the published price list at the time of writing (docs/AI_OPS.md): never an invoice
  cost_usd_estimate numeric not null default 0,
  report_id uuid references arena_private.ai_reports (id) on delete set null,
  note text,
  constraint ai_runs_kind_check check (kind in ('hourly', 'daily', 'incident')),
  constraint ai_runs_status_check check (status in ('ok', 'invalid_output', 'error', 'skipped_no_signals', 'skipped_budget', 'skipped_disabled')),
  constraint ai_runs_note_check check (note is null or pg_catalog.char_length(note) <= 300)
);

create index if not exists ai_runs_started_idx on arena_private.ai_runs (started_at desc);

alter table arena_private.ai_runs enable row level security;
revoke all on table arena_private.ai_runs from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- public.ops_status(): what the game, the portal and the Edge Functions read. Four booleans and a timestamp. Public on purpose (the maintenance banner shows before login).
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.ops_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'maintenance_mode', coalesce((select f.value from arena_private.ops_flags as f where f.key = 'maintenance_mode'), false),
    'market_paused', coalesce((select f.value from arena_private.ops_flags as f where f.key = 'market_paused'), false),
    'season_scoring_paused', coalesce((select f.value from arena_private.ops_flags as f where f.key = 'season_scoring_paused'), false),
    'pass_sales_paused', coalesce((select f.value from arena_private.ops_flags as f where f.key = 'pass_sales_paused'), false),
    'updated_at', (select max(f.changed_at) from arena_private.ops_flags as f)
  );
$$;

revoke all on function public.ops_status() from public, anon, authenticated;
grant execute on function public.ops_status() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- public.ops_pause: the ONLY write the watchdog has on the flags, and it can only switch ON. There is no parameter for "off" on purpose: a human clears flags in the admin panel.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.ops_pause(p_key text, p_actor text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed integer;
  v_reason text := pg_catalog.left(coalesce(nullif(pg_catalog.btrim(p_reason), ''), 'sem motivo'), 300);
begin
  if p_key is null or p_key not in ('maintenance_mode', 'market_paused', 'season_scoring_paused', 'pass_sales_paused') then
    raise exception using errcode = '22023', message = 'OPS_BAD_FLAG';
  end if;
  if p_actor is distinct from 'watchdog' then
    raise exception using errcode = '22023', message = 'OPS_BAD_ACTOR';
  end if;

  update arena_private.ops_flags as f
     set value = true, changed_at = now(), changed_by = p_actor, note = v_reason
   where f.key = p_key and f.value = false;
  get diagnostics v_changed = row_count;

  if v_changed > 0 then
    insert into arena_private.ops_events (kind, source, severity, check_name, ok, actor, summary, details)
    values ('flag_change', 'watchdog', 'high', p_key, false, p_actor, pg_catalog.left('Flag ' || p_key || ' ligada automaticamente', 500), jsonb_build_object('from', false, 'to', true, 'why', v_reason));
  end if;
  return jsonb_build_object('flag', p_key, 'changed', v_changed > 0);
end;
$$;

revoke all on function public.ops_pause(text, text, text) from public, anon, authenticated;
grant execute on function public.ops_pause(text, text, text) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The log, the check streaks, the incidents, the 5xx counters. All service role only.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.ops_event_add(
  p_kind text,
  p_source text,
  p_severity text,
  p_check_name text,
  p_ok boolean,
  p_actor text,
  p_summary text,
  p_details jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into arena_private.ops_events (kind, source, severity, check_name, ok, actor, summary, details)
  values (p_kind, p_source, coalesce(p_severity, 'info'), p_check_name, p_ok, p_actor, pg_catalog.left(coalesce(nullif(p_summary, ''), 'evento'), 500), coalesce(p_details, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.ops_event_add(text, text, text, text, boolean, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.ops_event_add(text, text, text, text, boolean, text, text, jsonb) to service_role;

-- p_results: [{ "check": "db", "ok": true|false, "detail": {...} }, ...]. Returns { "<check>": { consecutive_failures, failing_seconds, was_failing } }.
-- A health_check event is written only when a check changes state (ok -> failing, failing -> ok): a quiet minute writes no event, only the streak row.
create or replace function public.ops_checks_record(p_results jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_name text;
  v_ok boolean;
  v_detail jsonb;
  v_prev arena_private.ops_check_state%rowtype;
  v_row arena_private.ops_check_state%rowtype;
  v_out jsonb := '{}'::jsonb;
begin
  if p_results is null or pg_catalog.jsonb_typeof(p_results) <> 'array' or pg_catalog.jsonb_array_length(p_results) > 40 then
    raise exception using errcode = '22023', message = 'OPS_BAD_RESULTS';
  end if;
  for v_item in select e.value from pg_catalog.jsonb_array_elements(p_results) as e loop
    v_name := v_item ->> 'check';
    v_ok := coalesce((v_item ->> 'ok')::boolean, false);
    v_detail := coalesce(v_item -> 'detail', '{}'::jsonb);
    if v_name is null or v_name !~ '^[a-z0-9_]{1,40}$' then
      raise exception using errcode = '22023', message = 'OPS_BAD_CHECK';
    end if;
    select * into v_prev from arena_private.ops_check_state as s where s.check_name = v_name for update;
    if not found then
      insert into arena_private.ops_check_state (check_name, consecutive_failures, first_failed_at, last_ok_at, last_checked_at, last_detail)
      values (v_name, case when v_ok then 0 else 1 end, case when v_ok then null else now() end, case when v_ok then now() else null end, now(), v_detail)
      returning * into v_row;
    elsif v_ok then
      update arena_private.ops_check_state as s
         set consecutive_failures = 0, first_failed_at = null, last_ok_at = now(), last_checked_at = now(), last_detail = v_detail
       where s.check_name = v_name
       returning * into v_row;
    else
      update arena_private.ops_check_state as s
         set consecutive_failures = s.consecutive_failures + 1, first_failed_at = coalesce(s.first_failed_at, now()), last_checked_at = now(), last_detail = v_detail
       where s.check_name = v_name
       returning * into v_row;
    end if;

    if v_prev.check_name is not null and ((v_prev.consecutive_failures > 0) <> (v_row.consecutive_failures > 0)) then
      insert into arena_private.ops_events (kind, source, severity, check_name, ok, actor, summary, details)
      values ('health_check', 'watchdog', case when v_ok then 'info' else 'medium' end, v_name, v_ok, 'watchdog',
              pg_catalog.left('Verificacao ' || v_name || (case when v_ok then ' voltou ao normal' else ' falhou' end), 500), v_detail);
    elsif v_prev.check_name is null and not v_ok then
      insert into arena_private.ops_events (kind, source, severity, check_name, ok, actor, summary, details)
      values ('health_check', 'watchdog', 'medium', v_name, false, 'watchdog', pg_catalog.left('Verificacao ' || v_name || ' falhou', 500), v_detail);
    end if;

    v_out := v_out || jsonb_build_object(
      v_name,
      jsonb_build_object(
        'consecutive_failures', v_row.consecutive_failures,
        'failing_seconds', case when v_row.first_failed_at is null then 0 else pg_catalog.floor(extract(epoch from (now() - v_row.first_failed_at)))::integer end,
        'was_failing', coalesce(v_prev.consecutive_failures, 0) > 0
      )
    );
  end loop;
  return v_out;
end;
$$;

revoke all on function public.ops_checks_record(jsonb) from public, anon, authenticated;
grant execute on function public.ops_checks_record(jsonb) to service_role;

-- Opens the incident of a check, or touches the one that is already open. is_new = true exactly once per incident (the unique partial index decides). The caller alerts when is_new, or when
-- last_alert_at is older than the reminder interval (the interval and the decision live in supabase/functions/_shared/ops/alerts.ts).
create or replace function public.ops_incident_open(p_check text, p_severity text, p_summary text, p_details jsonb default '{}'::jsonb, p_actions jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row arena_private.ops_incidents%rowtype;
  v_id uuid;
  v_new boolean;
begin
  if p_check is null or p_check !~ '^[a-z0-9_]{1,40}$' then
    raise exception using errcode = '22023', message = 'OPS_BAD_CHECK';
  end if;
  insert into arena_private.ops_incidents as i (check_name, severity, summary, details, actions)
  values (p_check, coalesce(p_severity, 'high'), pg_catalog.left(coalesce(nullif(p_summary, ''), p_check), 1000), coalesce(p_details, '{}'::jsonb), coalesce(p_actions, '[]'::jsonb))
  on conflict (check_name) where status = 'open'
  do update set last_seen_at = now(), severity = excluded.severity, summary = excluded.summary, details = excluded.details,
                actions = case when pg_catalog.jsonb_array_length(excluded.actions) > 0 then excluded.actions else i.actions end
  returning i.id, (i.xmax = 0) into v_id, v_new;
  select * into v_row from arena_private.ops_incidents as x where x.id = v_id;

  if v_new then
    insert into arena_private.ops_events (kind, source, severity, check_name, ok, actor, summary, details)
    values ('incident_opened', 'watchdog', v_row.severity, p_check, false, 'watchdog', pg_catalog.left('Incidente aberto: ' || v_row.summary, 500), jsonb_build_object('incident_id', v_row.id, 'actions', v_row.actions));
  end if;
  return jsonb_build_object('incident_id', v_row.id, 'is_new', v_new, 'opened_at', v_row.opened_at, 'last_alert_at', v_row.last_alert_at, 'alert_count', v_row.alert_count);
end;
$$;

revoke all on function public.ops_incident_open(text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.ops_incident_open(text, text, text, jsonb, jsonb) to service_role;

create or replace function public.ops_incident_alerted(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update arena_private.ops_incidents as i
     set last_alert_at = now(), alert_count = i.alert_count + 1
   where i.id = p_id and i.status = 'open';
  insert into arena_private.ops_events (kind, source, severity, actor, summary, details)
  values ('alert_sent', 'watchdog', 'info', 'watchdog', 'Alerta enviado', jsonb_build_object('incident_id', p_id));
end;
$$;

revoke all on function public.ops_incident_alerted(uuid) from public, anon, authenticated;
grant execute on function public.ops_incident_alerted(uuid) to service_role;

create or replace function public.ops_incident_resolve(p_check text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row arena_private.ops_incidents%rowtype;
begin
  update arena_private.ops_incidents as i
     set status = 'resolved', resolved_at = now()
   where i.check_name = p_check and i.status = 'open'
   returning * into v_row;
  if not found then
    return jsonb_build_object('resolved', false);
  end if;
  insert into arena_private.ops_events (kind, source, severity, check_name, ok, actor, summary, details)
  values ('incident_resolved', 'watchdog', 'info', p_check, true, 'watchdog', pg_catalog.left('Incidente resolvido: ' || v_row.summary, 500), jsonb_build_object('incident_id', v_row.id));
  return jsonb_build_object('resolved', true, 'incident_id', v_row.id, 'opened_at', v_row.opened_at);
end;
$$;

revoke all on function public.ops_incident_resolve(text) from public, anon, authenticated;
grant execute on function public.ops_incident_resolve(text) to service_role;

-- The Edge Functions' own 5xx counter (supabase/functions/_shared/ops/monitor.ts). One upsert on a 5-minute bucket.
create or replace function public.ops_function_error(p_fn text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bucket timestamptz := pg_catalog.to_timestamp(pg_catalog.floor(extract(epoch from now()) / 300) * 300);
begin
  if p_fn is null or p_fn !~ '^[a-z0-9-]{1,40}$' then
    raise exception using errcode = '22023', message = 'OPS_BAD_FUNCTION';
  end if;
  insert into arena_private.ops_function_errors (fn, bucket, errors) values (p_fn, v_bucket, 1)
  on conflict (fn, bucket) do update set errors = arena_private.ops_function_errors.errors + 1;
end;
$$;

revoke all on function public.ops_function_error(text) from public, anon, authenticated;
grant execute on function public.ops_function_error(text) to service_role;

-- "Is the database answering": the cheapest possible round trip (the watchdog times it).
create or replace function public.ops_health_probe()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select now();
$$;

revoke all on function public.ops_health_probe() from public, anon, authenticated;
grant execute on function public.ops_health_probe() to service_role;

-- What the watchdog needs besides the probe: 5xx per function in the last p_minutes, the Stripe webhook backlog, whether a League is open.
create or replace function public.ops_health_counts(p_minutes integer default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_minutes integer := least(greatest(coalesce(p_minutes, 10), 1), 1440);
  v_errors jsonb;
  v_unprocessed integer;
  v_oldest integer;
  v_pay_errors integer;
  v_open boolean;
begin
  select coalesce(jsonb_object_agg(x.fn, x.n), '{}'::jsonb) into v_errors
  from (
    select e.fn, sum(e.errors)::integer as n
    from arena_private.ops_function_errors as e
    where e.bucket >= now() - make_interval(mins => v_minutes) - interval '5 minutes'
    group by e.fn
  ) as x;

  select count(*)::integer,
         pg_catalog.floor(extract(epoch from (now() - min(p.received_at))))::integer
    into v_unprocessed, v_oldest
  from public.payment_events as p
  where p.processed_at is null and p.received_at < now() - interval '10 minutes';

  select count(*)::integer into v_pay_errors
  from public.payment_events as p
  where p.received_at >= now() - make_interval(mins => v_minutes) and p.result like 'error:%';

  select exists (select 1 from public.seasons as s where s.status = 'open') into v_open;

  return jsonb_build_object(
    'now', now(),
    'window_minutes', v_minutes,
    'league_open', v_open,
    'function_errors', v_errors,
    'payments', jsonb_build_object('unprocessed', coalesce(v_unprocessed, 0), 'oldest_unprocessed_seconds', v_oldest, 'errors', coalesce(v_pay_errors, 0))
  );
end;
$$;

revoke all on function public.ops_health_counts(integer) from public, anon, authenticated;
grant execute on function public.ops_health_counts(integer) to service_role;

-- Housekeeping for the log tables (the retention job of 0019 does not know them). Closed incidents and old events go after p_days (default 90); the 5xx counters after 3 days; runs after 400 days.
create or replace function public.ops_prune(p_days integer default 90)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 90), 7), 3650);
  v_events integer;
  v_incidents integer;
  v_errors integer;
  v_runs integer;
begin
  delete from arena_private.ops_events as e where e.created_at < now() - make_interval(days => v_days);
  get diagnostics v_events = row_count;
  delete from arena_private.ops_incidents as i where i.status = 'resolved' and i.resolved_at < now() - make_interval(days => v_days);
  get diagnostics v_incidents = row_count;
  delete from arena_private.ops_function_errors as f where f.bucket < now() - interval '3 days';
  get diagnostics v_errors = row_count;
  delete from arena_private.ai_runs as r where r.started_at < now() - interval '400 days';
  get diagnostics v_runs = row_count;
  return jsonb_build_object('events', v_events, 'incidents', v_incidents, 'function_errors', v_errors, 'ai_runs', v_runs);
end;
$$;

revoke all on function public.ops_prune(integer) from public, anon, authenticated;
grant execute on function public.ops_prune(integer) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The auditor's inputs and outputs. Service role only.
-- ---------------------------------------------------------------------------------------------------------------------------------------
-- ai_budget(): how many model calls today (UTC) and the estimated spend this month (UTC). The Edge Function applies its caps to these numbers.
create or replace function public.ai_budget()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'runs_today', (select count(*) from arena_private.ai_runs as r where r.status in ('ok', 'invalid_output', 'error') and r.started_at >= pg_catalog.date_trunc('day', now() at time zone 'utc') at time zone 'utc'),
    'month_cost_usd', (select coalesce(sum(r.cost_usd_estimate), 0) from arena_private.ai_runs as r where r.started_at >= pg_catalog.date_trunc('month', now() at time zone 'utc') at time zone 'utc')
  );
$$;

revoke all on function public.ai_budget() from public, anon, authenticated;
grant execute on function public.ai_budget() to service_role;

create or replace function public.ai_run_log(
  p_kind text,
  p_model text,
  p_status text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_cost numeric,
  p_report_id uuid,
  p_note text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into arena_private.ai_runs (kind, model, status, input_tokens, output_tokens, cost_usd_estimate, report_id, note)
  values (p_kind, pg_catalog.left(p_model, 80), p_status, greatest(coalesce(p_input_tokens, 0), 0), greatest(coalesce(p_output_tokens, 0), 0), greatest(coalesce(p_cost, 0), 0), p_report_id, pg_catalog.left(p_note, 300))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.ai_run_log(text, text, text, integer, integer, numeric, uuid, text) from public, anon, authenticated;
grant execute on function public.ai_run_log(text, text, text, integer, integer, numeric, uuid, text) to service_role;

create or replace function public.ai_report_insert(p_kind text, p_severity text, p_summary text, p_details jsonb, p_suggested jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into arena_private.ai_reports (kind, severity, summary, details, suggested_actions)
  values (p_kind, p_severity, pg_catalog.left(coalesce(nullif(p_summary, ''), 'sem resumo'), 2000), coalesce(p_details, '{}'::jsonb), coalesce(p_suggested, '[]'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.ai_report_insert(text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.ai_report_insert(text, text, text, jsonb, jsonb) to service_role;

-- Fingerprints of the reports of the last p_hours: the auditor does not alert twice for the same finding set.
create or replace function public.ai_recent_fingerprints(p_hours integer default 24)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct r.details ->> 'fingerprint') filter (where r.details ->> 'fingerprint' is not null and coalesce((r.details ->> 'alerted')::boolean, false)), '{}'::text[])
  from arena_private.ai_reports as r
  where r.created_at >= now() - make_interval(hours => least(greatest(coalesce(p_hours, 24), 1), 720));
$$;

revoke all on function public.ai_recent_fingerprints(integer) from public, anon, authenticated;
grant execute on function public.ai_recent_fingerprints(integer) to service_role;

-- ai_gather_aggregates(p_hours): ONE compact jsonb for the deterministic pre-checks and, only when those find something, for the model. Counts, ids, usernames and hash PREFIXES only. Never an
-- e-mail, never a save, never an address, never a signature. Every list is capped (10-15 rows), so the size does not grow with the number of players.
create or replace function public.ai_gather_aggregates(p_hours integer default 1)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hours integer := least(greatest(coalesce(p_hours, 1), 1), 168);
  v_since timestamptz := now() - make_interval(hours => least(greatest(coalesce(p_hours, 1), 1), 168));
  -- pairs and referral clusters need a longer look-back than one hour to mean anything
  v_long_hours integer := greatest(least(greatest(coalesce(p_hours, 1), 1), 168), 24);
  v_long_since timestamptz := now() - make_interval(hours => greatest(least(greatest(coalesce(p_hours, 1), 1), 168), 24));
  v_reset timestamptz;
  v_floor timestamptz;
  v_anticheat jsonb;
  v_jumps jsonb;
  v_legendary jsonb;
  v_market jsonb;
  v_referrals jsonb;
  v_payments jsonb;
  v_errors jsonb;
begin
  select g.reset_at into v_reset from arena_private.season_goal as g where g.id;
  v_floor := coalesce(v_reset, '-infinity'::timestamptz);

  -- ANTI-CHEAT: new flagged / rejected snapshots (after the League reset) and the item-authority flags.
  with s as (
    select f.id, f.user_id, f.verdict, f.reasons
    from public.progress_snapshots as f
    where f.verdict <> 'ok' and f.created_at >= v_since and f.created_at >= v_floor
  ),
  reason_counts as (
    select r.reason, count(*) as n
    from s
    cross join lateral unnest(s.reasons) as r (reason)
    group by r.reason
    order by n desc, r.reason
    limit 15
  ),
  per_user as (
    select s.user_id,
           count(distinct s.id) filter (where s.verdict = 'flagged') as flagged,
           count(distinct s.id) filter (where s.verdict = 'rejected') as rejected,
           array_agg(distinct r.reason) filter (where r.reason is not null) as reasons
    from s
    left join lateral unnest(s.reasons) as r (reason) on true
    group by s.user_id
    order by count(distinct s.id) desc, s.user_id
    limit 15
  ),
  item_flags as (
    select f.code, count(*) as n, count(distinct f.user_id) as users
    from arena_private.item_account_flags as f
    where f.created_at >= v_since
    group by f.code
    order by n desc, f.code
    limit 10
  )
  select jsonb_build_object(
    'flagged_snapshots', (select count(*) from s where s.verdict = 'flagged'),
    'rejected_snapshots', (select count(*) from s where s.verdict = 'rejected'),
    'accounts_with_new_flags', (select count(distinct s.user_id) from s),
    'reason_counts', coalesce((select jsonb_agg(jsonb_build_object('reason', c.reason, 'count', c.n) order by c.n desc, c.reason) from reason_counts as c), '[]'::jsonb),
    'accounts', coalesce((select jsonb_agg(jsonb_build_object('user_id', u.user_id, 'username', pr.username, 'flagged', u.flagged, 'rejected', u.rejected, 'reasons', coalesce(u.reasons, '{}'::text[])) order by u.flagged + u.rejected desc, u.user_id)
                          from per_user as u left join public.profiles as pr on pr.user_id = u.user_id), '[]'::jsonb),
    'item_flags', coalesce((select jsonb_agg(jsonb_build_object('code', i.code, 'count', i.n, 'accounts', i.users) order by i.n desc, i.code) from item_flags as i), '[]'::jsonb)
  ) into v_anticheat;

  -- LEVEL / XP JUMPS: per account, the first and the last accepted snapshot inside the window. The pre-checks compare the pace with the bounds of supabase/functions/_shared/progress/bounds.ts.
  with w as (
    select p.user_id, p.created_at, (p.metrics ->> 'levelTotal')::numeric as lvl, (p.metrics ->> 'xp')::numeric as xp
    from public.progress_snapshots as p
    where p.verdict = 'ok' and p.created_at >= v_since and p.created_at >= v_floor
  ),
  agg as (
    select w.user_id,
           count(*) as n,
           min(w.created_at) as first_at,
           max(w.created_at) as last_at,
           (array_agg(w.lvl order by w.created_at asc))[1] as first_lvl,
           (array_agg(w.lvl order by w.created_at desc))[1] as last_lvl,
           (array_agg(w.xp order by w.created_at asc))[1] as first_xp,
           (array_agg(w.xp order by w.created_at desc))[1] as last_xp
    from w
    group by w.user_id
  ),
  top as (
    select a.*
    from agg as a
    where a.n >= 2 and a.last_lvl is not null and a.first_lvl is not null
    order by (a.last_lvl - a.first_lvl) desc, (a.last_xp - a.first_xp) desc, a.user_id
    limit 10
  )
  select jsonb_build_object(
    'accounts_compared', (select count(*) from agg where agg.n >= 2),
    'top', coalesce((select jsonb_agg(jsonb_build_object(
              'user_id', t.user_id, 'username', pr.username, 'snapshots', t.n,
              'level_from', t.first_lvl, 'level_to', t.last_lvl, 'xp_from', t.first_xp, 'xp_to', t.last_xp,
              'minutes_between', pg_catalog.round(extract(epoch from (t.last_at - t.first_at)) / 60.0, 1)
            ) order by (t.last_lvl - t.first_lvl) desc, t.user_id)
            from top as t left join public.profiles as pr on pr.user_id = t.user_id), '[]'::jsonb)
  ) into v_jumps;

  -- LEGENDARY / UNIQUE ISSUANCE: what the server issued in the window against the hourly average of the 7 days before it (the same predicate as the 0020 index: originals only, not market copies).
  with cur as (
    select c.id, c.user_id, c.source, c.kind, c.rarity
    from public.item_certificates as c
    where c.created_at >= v_since and c.origin_certificate_id is null and (c.rarity = 'legendary' or c.kind = 'unique')
  ),
  base as (
    select count(*) as n
    from public.item_certificates as c
    where c.created_at >= v_since - interval '7 days' and c.created_at < v_since and c.origin_certificate_id is null and (c.rarity = 'legendary' or c.kind = 'unique')
  ),
  by_source as (
    select cur.source, count(*) as n from cur group by cur.source order by n desc, cur.source
  ),
  by_user as (
    select cur.user_id, count(*) as n, array_agg(distinct cur.source) as sources
    from cur group by cur.user_id having count(*) >= 2 order by count(*) desc, cur.user_id limit 10
  )
  select jsonb_build_object(
    'issued_in_window', (select count(*) from cur),
    'baseline_per_hour', (select pg_catalog.round(b.n / 168.0, 3) from base as b),
    'by_source', coalesce((select jsonb_agg(jsonb_build_object('source', s.source, 'count', s.n) order by s.n desc, s.source) from by_source as s), '[]'::jsonb),
    'top_accounts', coalesce((select jsonb_agg(jsonb_build_object('user_id', u.user_id, 'username', pr.username, 'count', u.n, 'sources', u.sources) order by u.n desc, u.user_id)
                              from by_user as u left join public.profiles as pr on pr.user_id = u.user_id), '[]'::jsonb)
  ) into v_legendary;

  -- MARKET: sales in the window, price outliers against the 30-day median of the same thing, repeated pairs / wash trading, buyers who buy a lot.
  with sales as (
    select s.id, s.seller_id, s.buyer_id, coalesce(s.item_template, s.material_id) as thing, s.price_lamports, coalesce(s.material_qty, 1) as qty, s.sold_at
    from public.market_sales as s
    where s.livemode and s.sold_at >= v_since
  ),
  med as (
    select coalesce(h.item_template, h.material_id) as thing,
           pg_catalog.percentile_cont(0.5) within group (order by h.price_lamports::numeric / coalesce(h.material_qty, 1)) as median_unit,
           count(*) as samples
    from public.market_sales as h
    where h.livemode and h.sold_at >= now() - interval '30 days' and h.sold_at < v_since
    group by coalesce(h.item_template, h.material_id)
    having count(*) >= 5
  ),
  outliers as (
    select s.id, s.seller_id, s.buyer_id, s.thing, s.price_lamports, m.median_unit, m.samples,
           (s.price_lamports::numeric / s.qty) / nullif(m.median_unit, 0) as ratio
    from sales as s
    join med as m on m.thing = s.thing
    where (s.price_lamports::numeric / s.qty) / nullif(m.median_unit, 0) >= 3 or (s.price_lamports::numeric / s.qty) / nullif(m.median_unit, 0) <= 1.0 / 3
    order by greatest((s.price_lamports::numeric / s.qty) / nullif(m.median_unit, 0), nullif(m.median_unit, 0) / (s.price_lamports::numeric / s.qty)) desc, s.id
    limit 10
  ),
  recent as (
    select s.seller_id, s.buyer_id, s.price_lamports
    from public.market_sales as s
    where s.livemode and s.sold_at >= v_long_since
  ),
  pairs as (
    select r.seller_id, r.buyer_id, count(*) as n, sum(r.price_lamports) as volume,
           exists (select 1 from recent as b where b.seller_id = r.buyer_id and b.buyer_id = r.seller_id) as reciprocal
    from recent as r
    group by r.seller_id, r.buyer_id
    having count(*) >= 3
    order by count(*) desc, r.seller_id, r.buyer_id
    limit 10
  ),
  buyers as (
    select s.buyer_id, count(*) as purchases, count(distinct s.seller_id) as sellers, sum(s.price_lamports) as volume
    from sales as s
    group by s.buyer_id
    having count(*) >= 5
    order by count(*) desc, s.buyer_id
    limit 10
  )
  select jsonb_build_object(
    'sales_in_window', (select count(*) from sales),
    'volume_lamports', (select coalesce(sum(s.price_lamports), 0) from sales as s),
    'pair_lookback_hours', v_long_hours,
    'outliers', coalesce((select jsonb_agg(jsonb_build_object('sale_id', o.id, 'thing', o.thing, 'seller_id', o.seller_id, 'seller_username', sp.username, 'buyer_id', o.buyer_id, 'buyer_username', bp.username,
                                                               'price_lamports', o.price_lamports, 'ratio_to_median', pg_catalog.round(o.ratio::numeric, 2), 'median_samples', o.samples) order by o.ratio desc, o.id)
                          from outliers as o left join public.profiles as sp on sp.user_id = o.seller_id left join public.profiles as bp on bp.user_id = o.buyer_id), '[]'::jsonb),
    'pairs', coalesce((select jsonb_agg(jsonb_build_object('seller_id', p.seller_id, 'seller_username', sp.username, 'buyer_id', p.buyer_id, 'buyer_username', bp.username, 'sales', p.n, 'volume_lamports', p.volume, 'reciprocal', p.reciprocal) order by p.n desc, p.seller_id)
                       from pairs as p left join public.profiles as sp on sp.user_id = p.seller_id left join public.profiles as bp on bp.user_id = p.buyer_id), '[]'::jsonb),
    'heavy_buyers', coalesce((select jsonb_agg(jsonb_build_object('buyer_id', b.buyer_id, 'buyer_username', bp.username, 'purchases', b.purchases, 'distinct_sellers', b.sellers, 'volume_lamports', b.volume) order by b.purchases desc, b.buyer_id)
                              from buyers as b left join public.profiles as bp on bp.user_id = b.buyer_id), '[]'::jsonb)
  ) into v_market;

  -- REFERRALS (waitlist): sign-ups per hashed IP / hashed subnet / inviter, over at least 24 h. Hash PREFIXES only (8 characters): enough to tell clusters apart, useless to identify anyone.
  with w as (
    select x.id, x.ip_hash, x.subnet_hash, x.referred_by, x.referral_ignored
    from public.waitlist as x
    where x.created_at >= v_long_since
  ),
  ips as (
    select pg_catalog.left(w.ip_hash, 8) as ip, count(*) as n from w where w.ip_hash is not null group by w.ip_hash having count(*) >= 3 order by count(*) desc, w.ip_hash limit 10
  ),
  subnets as (
    select pg_catalog.left(w.subnet_hash, 8) as subnet, count(*) as n from w where w.subnet_hash is not null group by w.subnet_hash having count(*) >= 5 order by count(*) desc, w.subnet_hash limit 10
  ),
  inviters as (
    select w.referred_by, count(*) as n from w where w.referred_by is not null group by w.referred_by having count(*) >= 5 order by count(*) desc, w.referred_by limit 10
  ),
  ignored as (
    select w.referral_ignored as reason, count(*) as n from w where w.referral_ignored is not null group by w.referral_ignored
  )
  select jsonb_build_object(
    'lookback_hours', v_long_hours,
    'signups', (select count(*) from w),
    'ip_clusters', coalesce((select jsonb_agg(jsonb_build_object('ip_prefix', i.ip, 'signups', i.n) order by i.n desc, i.ip) from ips as i), '[]'::jsonb),
    'subnet_clusters', coalesce((select jsonb_agg(jsonb_build_object('subnet_prefix', s.subnet, 'signups', s.n) order by s.n desc, s.subnet) from subnets as s), '[]'::jsonb),
    'inviters', coalesce((select jsonb_agg(jsonb_build_object('waitlist_id', v.referred_by, 'invited', v.n) order by v.n desc, v.referred_by) from inviters as v), '[]'::jsonb),
    'ignored', coalesce((select jsonb_agg(jsonb_build_object('reason', g.reason, 'count', g.n) order by g.n desc, g.reason) from ignored as g), '[]'::jsonb)
  ) into v_referrals;

  -- PAYMENTS: refunds and disputes that landed in the window, new Passes, webhook events that ended in an error.
  select jsonb_build_object(
    'refunded', (select count(*) from public.entitlements as e where e.status = 'refunded' and e.updated_at >= v_since),
    'revoked_disputes', (select count(*) from public.entitlements as e where e.status = 'revoked' and e.updated_at >= v_since),
    'new_active', (select count(*) from public.entitlements as e where e.status = 'active' and e.granted_at >= v_since),
    'event_errors', (select count(*) from public.payment_events as p where p.received_at >= v_since and p.result like 'error:%'),
    'events_unprocessed_10min', (select count(*) from public.payment_events as p where p.processed_at is null and p.received_at < now() - interval '10 minutes')
  ) into v_payments;

  -- ERRORS: 5xx per Edge Function in the window (the counters of ops_function_error).
  select jsonb_build_object(
    'by_function', coalesce((select jsonb_agg(jsonb_build_object('function', x.fn, 'errors', x.n) order by x.n desc, x.fn)
                             from (select e.fn, sum(e.errors)::integer as n from arena_private.ops_function_errors as e where e.bucket >= v_since - interval '5 minutes' group by e.fn) as x), '[]'::jsonb)
  ) into v_errors;

  return jsonb_build_object(
    'window_hours', v_hours,
    'since', v_since,
    'generated_at', now(),
    'anticheat', v_anticheat,
    'level_jumps', v_jumps,
    'legendary', v_legendary,
    'market', v_market,
    'referrals', v_referrals,
    'payments', v_payments,
    'errors', v_errors
  );
end;
$$;

revoke all on function public.ai_gather_aggregates(integer) from public, anon, authenticated;
grant execute on function public.ai_gather_aggregates(integer) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The owner's side (is_admin() only). Same pattern as 0020: ADMIN_ONLY first, security definer, empty search_path, granted to `authenticated` only.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.admin_ops_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_ONLY';
  end if;
  return jsonb_build_object(
    'flags', coalesce((select jsonb_agg(jsonb_build_object('key', f.key, 'value', f.value, 'changed_at', f.changed_at, 'changed_by', f.changed_by, 'note', f.note) order by f.key) from arena_private.ops_flags as f), '[]'::jsonb),
    'incidents', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'check', i.check_name, 'severity', i.severity, 'summary', i.summary, 'opened_at', i.opened_at, 'last_seen_at', i.last_seen_at,
                                                               'alert_count', i.alert_count, 'actions', i.actions) order by i.opened_at desc)
                           from arena_private.ops_incidents as i where i.status = 'open'), '[]'::jsonb),
    'recent_events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'at', e.created_at, 'kind', e.kind, 'severity', e.severity, 'check', e.check_name, 'ok', e.ok, 'actor', e.actor, 'summary', e.summary) order by e.id desc)
                               from (select * from arena_private.ops_events as x order by x.id desc limit 30) as e), '[]'::jsonb),
    'checks', coalesce((select jsonb_agg(jsonb_build_object('check', c.check_name, 'consecutive_failures', c.consecutive_failures, 'first_failed_at', c.first_failed_at, 'last_ok_at', c.last_ok_at, 'last_checked_at', c.last_checked_at) order by c.check_name)
                        from arena_private.ops_check_state as c), '[]'::jsonb),
    'open_reports', (select count(*) from arena_private.ai_reports as r where r.acknowledged_at is null),
    'now', now()
  );
end;
$$;

revoke all on function public.admin_ops_overview() from public, anon, authenticated;
grant execute on function public.admin_ops_overview() to authenticated;

-- p_status: 'open' (not acknowledged), 'acknowledged' or 'all'. Most severe first, then newest.
create or replace function public.admin_ai_reports(p_status text default 'open', p_page integer default 0, p_page_size integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_size integer;
  v_offset integer;
  v_total bigint;
  v_rows jsonb;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_ONLY';
  end if;
  if p_status is null or p_status not in ('open', 'acknowledged', 'all') then
    raise exception using errcode = '22023', message = 'ADMIN_BAD_STATUS';
  end if;
  v_size := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_offset := greatest(coalesce(p_page, 0), 0) * v_size;

  select count(*) into v_total
  from arena_private.ai_reports as r
  where p_status = 'all' or (p_status = 'open' and r.acknowledged_at is null) or (p_status = 'acknowledged' and r.acknowledged_at is not null);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id, 'kind', q.kind, 'severity', q.severity, 'summary', q.summary, 'details', q.details, 'suggested_actions', q.suggested_actions,
           'created_at', q.created_at, 'acknowledged_at', q.acknowledged_at, 'acknowledged_by', q.acknowledged_by
         ) order by q.sev desc, q.created_at desc, q.id), '[]'::jsonb)
    into v_rows
  from (
    select r.*, case r.severity when 'critical' then 5 when 'high' then 4 when 'medium' then 3 when 'low' then 2 else 1 end as sev
    from arena_private.ai_reports as r
    where p_status = 'all' or (p_status = 'open' and r.acknowledged_at is null) or (p_status = 'acknowledged' and r.acknowledged_at is not null)
    order by case r.severity when 'critical' then 5 when 'high' then 4 when 'medium' then 3 when 'low' then 2 else 1 end desc, r.created_at desc, r.id
    limit v_size offset v_offset
  ) as q;

  return jsonb_build_object('total', v_total, 'page', greatest(coalesce(p_page, 0), 0), 'page_size', v_size, 'rows', v_rows);
end;
$$;

revoke all on function public.admin_ai_reports(text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_ai_reports(text, integer, integer) to authenticated;

-- The estimated AI spend: this month so far, a straight-line projection to the end of the month, the last six months and the runs by model. ESTIMATES from token counts, never an invoice.
create or replace function public.admin_ai_cost()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := pg_catalog.date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  v_days_in_month integer := extract(day from (pg_catalog.date_trunc('month', now() at time zone 'utc') + interval '1 month' - interval '1 day'))::integer;
  v_elapsed numeric := greatest(extract(epoch from (now() - v_start)) / 86400.0, 1.0);
  v_mtd numeric;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_ONLY';
  end if;
  select coalesce(sum(r.cost_usd_estimate), 0) into v_mtd from arena_private.ai_runs as r where r.started_at >= v_start;
  return jsonb_build_object(
    'month_to_date_usd', pg_catalog.round(v_mtd, 4),
    'projected_month_usd', pg_catalog.round(v_mtd / v_elapsed * v_days_in_month, 4),
    'runs_today', (select count(*) from arena_private.ai_runs as r where r.status in ('ok', 'invalid_output', 'error') and r.started_at >= pg_catalog.date_trunc('day', now() at time zone 'utc') at time zone 'utc'),
    'months', coalesce((select jsonb_agg(jsonb_build_object('month', m.month, 'cost_usd', pg_catalog.round(m.cost, 4), 'runs', m.runs) order by m.month desc)
                        from (select pg_catalog.to_char(pg_catalog.date_trunc('month', r.started_at at time zone 'utc'), 'YYYY-MM') as month, sum(r.cost_usd_estimate) as cost, count(*) as runs
                              from arena_private.ai_runs as r
                              where r.started_at >= v_start - interval '5 months'
                              group by 1) as m), '[]'::jsonb),
    'by_model', coalesce((select jsonb_agg(jsonb_build_object('model', b.model, 'runs', b.runs, 'cost_usd', pg_catalog.round(b.cost, 4)) order by b.cost desc, b.model)
                          from (select coalesce(r.model, '(sem modelo)') as model, count(*) as runs, sum(r.cost_usd_estimate) as cost
                                from arena_private.ai_runs as r where r.started_at >= v_start group by 1) as b), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_ai_cost() from public, anon, authenticated;
grant execute on function public.admin_ai_cost() to authenticated;

-- The owner flips a flag. A note is mandatory in BOTH directions (who and why stay in the log). The only function that can switch a flag OFF.
create or replace function public.admin_set_ops_flag(p_key text, p_value boolean, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_note text;
  v_old boolean;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_ONLY';
  end if;
  v_uid := (select auth.uid());
  if p_key is null or p_key not in ('maintenance_mode', 'market_paused', 'season_scoring_paused', 'pass_sales_paused') then
    raise exception using errcode = '22023', message = 'OPS_BAD_FLAG';
  end if;
  if p_value is null then
    raise exception using errcode = '22023', message = 'OPS_BAD_VALUE';
  end if;
  v_note := nullif(pg_catalog.btrim(coalesce(p_note, '')), '');
  if v_note is null or pg_catalog.char_length(v_note) < 3 then
    raise exception using errcode = '22023', message = 'OPS_NOTE_REQUIRED';
  end if;
  if pg_catalog.char_length(v_note) > 300 then
    raise exception using errcode = '22023', message = 'OPS_NOTE_TOO_LONG';
  end if;

  select f.value into v_old from arena_private.ops_flags as f where f.key = p_key for update;
  if v_old is null then
    raise exception using errcode = '22023', message = 'OPS_BAD_FLAG';
  end if;
  if v_old = p_value then
    return jsonb_build_object('flag', p_key, 'value', p_value, 'changed', false);
  end if;

  update arena_private.ops_flags as f
     set value = p_value, changed_at = now(), changed_by = 'admin:' || v_uid::text, note = v_note
   where f.key = p_key;

  insert into arena_private.ops_events (kind, source, severity, check_name, ok, actor, summary, details)
  values ('flag_change', 'admin', case when p_value then 'medium' else 'info' end, p_key, not p_value, 'admin:' || v_uid::text,
          pg_catalog.left('Flag ' || p_key || (case when p_value then ' ligada' else ' desligada' end) || ' pelo administrador', 500),
          jsonb_build_object('from', v_old, 'to', p_value, 'why', v_note));
  return jsonb_build_object('flag', p_key, 'value', p_value, 'changed', true);
end;
$$;

revoke all on function public.admin_set_ops_flag(text, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_set_ops_flag(text, boolean, text) to authenticated;

create or replace function public.admin_ack_report(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_changed integer;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_ONLY';
  end if;
  v_uid := (select auth.uid());
  update arena_private.ai_reports as r
     set acknowledged_at = now(), acknowledged_by = v_uid
   where r.id = p_id and r.acknowledged_at is null;
  get diagnostics v_changed = row_count;
  if v_changed > 0 then
    insert into arena_private.ops_events (kind, source, severity, actor, summary, details)
    values ('report_ack', 'admin', 'info', 'admin:' || v_uid::text, 'Relatorio da IA marcado como lido', jsonb_build_object('report_id', p_id));
  end if;
  return jsonb_build_object('id', p_id, 'acknowledged', v_changed > 0);
end;
$$;

revoke all on function public.admin_ack_report(uuid) from public, anon, authenticated;
grant execute on function public.admin_ack_report(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- THE pg_cron SCHEDULE (documented, NOT created by this file: pg_cron / pg_net / the vault are extensions you switch on yourself; docs/AI_OPS.md has the step by step).
--   1. Dashboard -> Database -> Extensions: enable pg_cron and pg_net. Store the shared cron secret in the vault ONCE (the same value as the Edge secret OPS_CRON_SECRET; never paste it in chat):
--        select vault.create_secret('<the secret>', 'ops_cron_secret');
--   2. Then schedule (SQL editor; replace <ref> with the project ref):
--        select cron.schedule('ops-watchdog',       '*/5 * * * *', $$select net.http_post(url := 'https://<ref>.supabase.co/functions/v1/ops-watchdog', headers := jsonb_build_object('content-type', 'application/json', 'x-ops-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ops_cron_secret')), body := '{}'::jsonb, timeout_milliseconds := 20000);$$);
--        select cron.schedule('ai-auditor-hourly',  '7 * * * *',   $$select net.http_post(url := 'https://<ref>.supabase.co/functions/v1/ai-auditor', headers := jsonb_build_object('content-type', 'application/json', 'x-ops-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ops_cron_secret')), body := '{"mode":"hourly"}'::jsonb, timeout_milliseconds := 60000);$$);
--        select cron.schedule('ai-auditor-daily',   '15 9 * * *',  $$select net.http_post(url := 'https://<ref>.supabase.co/functions/v1/ai-auditor', headers := jsonb_build_object('content-type', 'application/json', 'x-ops-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ops_cron_secret')), body := '{"mode":"daily"}'::jsonb, timeout_milliseconds := 120000);$$);
--        select cron.schedule('ops-prune',          '40 4 * * *',  $$select public.ops_prune(90);$$);
--   The three Edge Functions are deployed with --no-verify-jwt (they authenticate with x-ops-secret instead) and answer 503 until OPS_CRON_SECRET is set.
--
-- SQL TEST PLAN (run in the DEVELOPMENT project, as the owner; every line says what you should see)
--   A. Defaults.   select public.ops_status();  -> the four flags false and updated_at set.
--   B. Public read. As anon (the API with the anon key): rpc ops_status -> works. rpc ops_pause / ai_gather_aggregates / admin_ops_overview -> permission denied.
--   C. The owner.  As a signed-in NON-admin: rpc admin_set_ops_flag('market_paused', true, 'teste') -> ADMIN_ONLY. As the admin: the same -> {changed:true}; ops_status shows market_paused true; admin_ops_overview().recent_events
--                  has the flag_change with admin:<your id>. admin_set_ops_flag('market_paused', true, '') -> OPS_NOTE_REQUIRED. admin_set_ops_flag('nope', true, 'x') -> OPS_BAD_FLAG.
--                  Clear it: admin_set_ops_flag('market_paused', false, 'tudo certo') -> {changed:true}.
--   D. The watchdog (service role). select public.ops_pause('season_scoring_paused', 'watchdog', 'teste') -> {changed:true}; again -> {changed:false}. select public.ops_pause('market_paused', 'someone', 'x') -> OPS_BAD_ACTOR.
--                  There is NO function that clears a flag for the service role: only admin_set_ops_flag (a signed-in admin) can. Clear the test flag as the admin.
--   E. Streaks.    select public.ops_checks_record('[{"check":"db","ok":false,"detail":{}}]'); twice -> consecutive_failures 1 then 2; then with ok:true -> 0 and a health_check event "voltou ao normal".
--   F. Incidents.  select public.ops_incident_open('db', 'high', 'banco lento', '{}', '[]'); -> is_new true; again -> is_new false (same incident_id). ops_incident_alerted(<id>) sets last_alert_at. ops_incident_resolve('db') -> resolved true.
--   G. The aggregates. select public.ai_gather_aggregates(1); then (24); the jsonb has the eight top-level keys and no e-mail anywhere: select public.ai_gather_aggregates(24)::text ~* '@';  -> false.
--   H. Reports.    select public.ai_report_insert('anomaly', 'high', 'teste', '{"fingerprint":"abc","alerted":true}', '[{"action":"watch"}]'); as the admin: admin_ai_reports('open') lists it first; admin_ack_report(<id>) -> acknowledged true;
--                  admin_ai_reports('open') no longer lists it. select public.ai_recent_fingerprints(24) -> {abc}.
--   I. Cost.       select public.ai_run_log('hourly', 'claude-haiku-5-5', 'ok', 3000, 1200, 0.0009, null, 'teste'); admin_ai_cost() -> month_to_date_usd 0.0009 and runs_today 1; ai_budget() -> runs_today 1.
--   J. Clean up.   delete the test rows you created (ai_reports, ai_runs, ops_incidents, ops_events where summary like '%teste%'); all four flags false.
