-- Data retention: keep the database small (depends on 0004 / 0005 / 0006 / 0007 progress_snapshots + seasons + flags, 0003 checkout_attempts, 0007 progress_rate, 0011 market_wallet_nonces /
-- market_reservations, 0010 / 0015 request tables, 0016 waitlist_limits). NOT APPLIED from this repo: the owner runs it (SQL editor or `supabase db push`), in the DEVELOPMENT project first.
-- It was never run against a real database: only read by static tests (supabase/functions/_shared/__tests__/migration0019.test.ts, rule model in retentionModel.ts). The SQL TEST PLAN at the end is
-- what proves it for real.
--
-- WHY. progress_snapshots is append-only and the biggest grower (about 6 accepted snapshots per active hour, ~1.45 KB per row with its indexes); the ledgers and the short-lived limit tables grow too.
-- docs/backend-phase1.md ("Retenção de dados") has the per-table bytes and the monthly growth for 5 000 / 50 000 / 100 000 accounts, and the disk expected after this runs.
--
-- WHAT THIS FILE ADDS
--   * arena_private.retention_config   ONE row of numbers the owner edits in the SQL editor (nothing is hard-coded in the function). Service role / owner only.
--   * public.retention_run(p_dry_run)  the maintenance function. SECURITY DEFINER, empty search path, SERVICE ROLE ONLY. One call = one bounded batch per table (batch_size rows, default 10 000), so no
--                                      call holds a long lock; run it again (cron does) until `more` is false. Idempotent: a second call over the same data deletes nothing new. p_dry_run = true counts what the
--                                      batch WOULD delete and deletes nothing. Returns a jsonb summary.
--   * public.retention_disk_report()   read-only (service role only): rows and bytes of every high-volume table and the policy that applies to it. This is the "report the growth" part for the ledgers.
--   * a documented pg_cron schedule    (comment block below; pg_cron is an extension the owner switches on in the dashboard, so the schedule is NOT created by this file).
--
-- THE RULES
--   progress_snapshots (verdict 'ok' rows only are ever deleted; a flagged or rejected snapshot is NEVER deleted, so the lifetime flag record and the owner's audit stay whole):
--     KEPT IN FULL   * a snapshot inside a ranked season window that is not 'paid' yet (open, frozen, closed, ...: the audit needs the whole history). By default only for the PARTICIPANTS of that
--                      season (an account with a season_entries / season_profession_entries row there): the other accounts' rows are never ranked, so they age out like seasonless rows
--                      (snapshot_participants_only = false keeps every account's rows, the literal reading, at the price of ~4 GB per 50 000 accounts per month).
--                    * the pre-season (kind 'pre', a beta without prize) counts as seasonless unless snapshot_pre_season_full = true.
--                    * anything newer than snapshot_full_days (default 30) outside a paid season.
--                    * an ok snapshot of an account that has an OPEN flag (a flagged / rejected snapshot nobody cleared), for snapshot_flag_hold_days (default 90) after it was taken.
--                    * the account's latest ok snapshot (the baseline the next submit-progress is judged against) and, per bucket, the FIRST and the LAST ok snapshot: so the first accepted snapshot of the
--                      account and the first accepted one at or after the League reset (the other two baselines) always survive. Buckets never mix the two sides of the reset.
--                    * a snapshot with advisory reasons (FAST_* notes, MANUAL_BASELINE): the owner's audit lists those accounts first.
--                    * a snapshot that season_entries / season_profession_entries point at as best_snapshot_id (a foreign key: deleting it would fail anyway).
--     COMPACTED      everything else that is eligible (inside a PAID season, or older than snapshot_full_days) keeps the first and the last ok snapshot of each user per UTC day; the rest is deleted.
--                    Older than snapshot_monthly_after_days (default 90; null turns this tier off) the bucket is the UTC month instead of the day.
--   short-lived tables, expired rows deleted: arena_private.progress_rate (a missing row means a free slot), public.market_wallet_nonces, public.market_reservations (expired / cancelled, past the
--     payment grace, with no chain payment on them), public.checkout_attempts, arena_private.waitlist_limits (the hashed rate-limit buckets, 7 days). Margins are in the config.
--   KEPT, never deleted: every money / item / material ledger and trail: item_certificates, item_certificate_events, material_ledger, material_balances, market_events, market_sales, chain_payments,
--     payment_events, entitlements, season_entries, progress_flag_clears, referral rewards. retention_disk_report() only reports them.
--   Replay caches (public.item_mint_requests, public.material_requests): KEPT by default. A retried request id older than the cache would no longer replay (material_credit would credit it twice), so
--     the owner decides: request_cache_days (null = off) deletes the ones older than that many days. Use a long value (180 or more).
--
-- DISK NOTE. A DELETE frees space for new rows of the same table but does not shrink the files: Postgres reuses it, the dashboard's disk number only stops growing. To give space back after the
-- FIRST big clean-up, run `vacuum full` (locks the table) or pg_repack in a quiet hour. See docs/backend-phase1.md.
--
-- ROLLBACK (by hand; deleted rows do NOT come back, so export first if you ran it with real data):
--   select cron.unschedule('retention-run'); select cron.unschedule('retention-cron-log');      -- if you scheduled them
--   drop function if exists public.retention_disk_report();
--   drop function if exists public.retention_run(boolean);
--   drop table if exists arena_private.retention_config;

create schema if not exists arena_private;
revoke all on schema arena_private from public, anon, authenticated;
grant usage on schema arena_private to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The numbers. ONE row, private. Edit in the SQL editor: update arena_private.retention_config set snapshot_full_days = 7;
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists arena_private.retention_config (
  id boolean primary key default true,
  -- rows deleted per table per call
  batch_size integer not null default 10000,
  -- snapshots newer than this are never compacted (outside the held season windows these are the only rows compaction waits for)
  snapshot_full_days integer not null default 30,
  -- older than this the compaction bucket is the month instead of the day (null = never)
  snapshot_monthly_after_days integer default 90,
  -- an account with an open flag keeps its ok snapshots in full this long
  snapshot_flag_hold_days integer not null default 90,
  -- true: only accounts that have an entry in the season keep its full history; false: every account does
  snapshot_participants_only boolean not null default true,
  -- true: an open / frozen pre-season keeps every row too
  snapshot_pre_season_full boolean not null default false,
  waitlist_limit_days integer not null default 7,
  checkout_attempt_days integer not null default 30,
  -- how long after expires_at a wallet nonce row is kept
  nonce_days integer not null default 2,
  -- how long after grace_until an expired / cancelled reservation is kept
  reservation_days integer not null default 30,
  progress_rate_days integer not null default 1,
  -- null = replay caches are kept forever
  request_cache_days integer,
  constraint retention_config_single_row check (id),
  constraint retention_config_batch_check check (batch_size between 100 and 100000),
  constraint retention_config_snapshot_days_check check (snapshot_full_days between 1 and 3650),
  constraint retention_config_monthly_check check (snapshot_monthly_after_days is null or (snapshot_monthly_after_days >= snapshot_full_days and snapshot_monthly_after_days <= 3650)),
  constraint retention_config_flag_hold_check check (snapshot_flag_hold_days between 1 and 3650),
  constraint retention_config_small_days_check check (
    waitlist_limit_days between 1 and 3650 and checkout_attempt_days between 1 and 3650 and nonce_days between 1 and 3650
    and reservation_days between 1 and 3650 and progress_rate_days between 1 and 3650
  ),
  constraint retention_config_request_cache_check check (request_cache_days is null or request_cache_days between 30 and 3650)
);

insert into arena_private.retention_config (id) values (true) on conflict (id) do nothing;

alter table arena_private.retention_config enable row level security;
revoke all on table arena_private.retention_config from public, anon, authenticated;
grant select, update on table arena_private.retention_config to service_role; -- no insert / delete: the single row is permanent

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- public.retention_run: one bounded batch per table. SERVICE ROLE ONLY (pg_cron runs it as the database owner).
-- Returns { status: 'ok' | 'busy', dry_run, more, progress_snapshots: { rows, more }, tables: { <name>: { rows, more } }, kept: [...] }.
--   rows = rows deleted by this call (or that this batch would delete when p_dry_run). more = the batch was full, so run it again.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.retention_run(p_dry_run boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg arena_private.retention_config%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_reset timestamptz;
  v_batch integer;
  v_full_cut timestamptz;
  v_month_cut timestamptz;
  v_flag_cut timestamptz;
  v_ids uuid[];
  v_snap_rows bigint := 0;
  v_n bigint;
  v_tables jsonb := '{}'::jsonb;
  v_more boolean := false;
begin
  if p_dry_run is null then
    raise exception using errcode = '22023', message = 'RETENTION_BAD_ARGUMENT';
  end if;
  -- Two overlapping runs (a slow batch and the next cron tick) must not fight: the second one steps aside.
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('retention_run', 0)) then
    return pg_catalog.jsonb_build_object('status', 'busy');
  end if;
  -- Never wait long for a lock a game request holds: give up (the next run retries) instead of stalling the game.
  perform pg_catalog.set_config('lock_timeout', '5s', true);

  select * into v_cfg from arena_private.retention_config as c where c.id;
  select g.reset_at into v_reset from arena_private.season_goal as g where g.id;
  v_batch := v_cfg.batch_size;
  v_full_cut := v_now - pg_catalog.make_interval(days => v_cfg.snapshot_full_days);
  v_month_cut := case when v_cfg.snapshot_monthly_after_days is null then null else v_now - pg_catalog.make_interval(days => v_cfg.snapshot_monthly_after_days) end;
  v_flag_cut := v_now - pg_catalog.make_interval(days => v_cfg.snapshot_flag_hold_days);

  -- -------------------------------------------------------------------------------------------------------------------------------------
  -- progress_snapshots. Only 'ok' rows are candidates. A candidate is a row that is neither the first nor the last ok row of its bucket (user, UTC day or month, side of the League reset),
  -- is not held by a season / an open flag / a note / a best_snapshot_id, and is eligible (inside a paid season, or older than snapshot_full_days).
  -- The inner set is pre-filtered to rows that could be eligible; dropping the newer rows from it can only make MORE rows look like a bucket's last row, never fewer, so it never deletes a true
  -- first / last row (the true last row of a bucket that was cut off is simply kept and is compacted by a later run).
  -- -------------------------------------------------------------------------------------------------------------------------------------
  v_ids := array(
    with pinned as (
      select e.best_snapshot_id as id from public.season_entries as e where e.best_snapshot_id is not null
      union
      select p.best_snapshot_id as id from public.season_profession_entries as p where p.best_snapshot_id is not null
    ),
    open_flags as (
      select distinct f.user_id
      from public.progress_snapshots as f
      where f.verdict <> 'ok'
        and not exists (select 1 from public.progress_flag_clears as k where k.snapshot_id = f.id)
    ),
    -- ranked season windows whose history is kept in full (every season that is not 'paid'; the pre-season only if asked)
    held as (
      select s.number, s.starts_at, s.ends_at
      from public.seasons as s
      where s.kind = 'ranked' and s.starts_at is not null and s.ends_at is not null and s.status <> 'paid'
      union all
      select s.number, s.starts_at, s.ends_at
      from public.seasons as s
      where v_cfg.snapshot_pre_season_full and s.kind = 'pre' and s.starts_at is not null and s.ends_at is not null and s.status in ('open', 'frozen')
    ),
    paid as (
      select s.starts_at, s.ends_at
      from public.seasons as s
      where s.kind = 'ranked' and s.starts_at is not null and s.ends_at is not null and s.status = 'paid'
    ),
    base as (
      select r.id, r.user_id, r.created_at, r.reasons,
             exists (select 1 from paid as pd where r.created_at >= pd.starts_at and r.created_at <= pd.ends_at) as in_paid,
             exists (
               select 1
               from held as h
               where r.created_at >= h.starts_at and r.created_at <= h.ends_at
                 and (
                   not v_cfg.snapshot_participants_only
                   or exists (select 1 from public.season_entries as e where e.season = h.number and e.user_id = r.user_id)
                   or exists (select 1 from public.season_profession_entries as pe where pe.season = h.number and pe.user_id = r.user_id)
                 )
             ) as in_held,
             (v_month_cut is not null and r.created_at < v_month_cut) as monthly,
             (v_reset is not null and r.created_at >= v_reset) as after_reset
      from public.progress_snapshots as r
      where r.verdict = 'ok'
    ),
    bucketed as (
      select b.*,
             case when b.monthly then pg_catalog.date_trunc('month', b.created_at at time zone 'UTC') else pg_catalog.date_trunc('day', b.created_at at time zone 'UTC') end as bucket
      from base as b
      where b.in_paid or b.created_at < v_full_cut
    ),
    ranked as (
      select k.*,
             pg_catalog.first_value(k.id) over w as first_id,
             pg_catalog.last_value(k.id) over w as last_id
      from bucketed as k
      window w as (
        partition by k.user_id, k.monthly, k.after_reset, k.bucket
        order by k.created_at, k.id
        rows between unbounded preceding and unbounded following
      )
    )
    select q.id
    from ranked as q
    where q.id <> q.first_id
      and q.id <> q.last_id
      and not q.in_held
      and (q.in_paid or q.created_at < v_full_cut)
      and pg_catalog.cardinality(q.reasons) = 0
      and not exists (select 1 from pinned as pn where pn.id = q.id)
      and not (q.created_at >= v_flag_cut and exists (select 1 from open_flags as o where o.user_id = q.user_id))
    order by q.created_at
    limit v_batch
  );

  if not p_dry_run and pg_catalog.cardinality(v_ids) > 0 then
    -- Belt and braces: the statement itself refuses a flagged / rejected row and the account's newest ok row (the baseline), whatever the set above said.
    delete from public.progress_snapshots as d
    where d.id = any (v_ids)
      and d.verdict = 'ok'
      and exists (
        select 1 from public.progress_snapshots as n
        where n.user_id = d.user_id and n.verdict = 'ok' and n.created_at > d.created_at
      );
    get diagnostics v_snap_rows = row_count;
  else
    v_snap_rows := pg_catalog.cardinality(v_ids);
  end if;
  v_more := pg_catalog.cardinality(v_ids) >= v_batch;

  -- -------------------------------------------------------------------------------------------------------------------------------------
  -- Short-lived tables. Each block: count (dry run) or delete one batch by ctid, and say whether the batch was full.
  -- -------------------------------------------------------------------------------------------------------------------------------------

  -- arena_private.progress_rate: one row per account, the last accepted snapshot slot. A missing row is a free slot, so an old row only wastes space.
  if p_dry_run then
    select pg_catalog.count(*) into v_n from (select 1 from arena_private.progress_rate as t where t.last_at < v_now - pg_catalog.make_interval(days => v_cfg.progress_rate_days) limit v_batch) as q;
  else
    with gone as (
      delete from arena_private.progress_rate as t
      where t.ctid = any (array(select u.ctid from arena_private.progress_rate as u where u.last_at < v_now - pg_catalog.make_interval(days => v_cfg.progress_rate_days) limit v_batch))
      returning 1
    )
    select pg_catalog.count(*) into v_n from gone;
  end if;
  v_tables := v_tables || pg_catalog.jsonb_build_object('progress_rate', pg_catalog.jsonb_build_object('rows', v_n, 'more', v_n >= v_batch));
  v_more := v_more or v_n >= v_batch;

  -- public.market_wallet_nonces: a nonce is single use and expires in minutes; the rate limit counts the last hour, so a day of margin is plenty.
  if p_dry_run then
    select pg_catalog.count(*) into v_n from (
      select 1 from public.market_wallet_nonces as t
      where t.expires_at < v_now - pg_catalog.make_interval(days => v_cfg.nonce_days) and (t.used_at is null or t.used_at < v_now - pg_catalog.make_interval(days => v_cfg.nonce_days)) limit v_batch
    ) as q;
  else
    with gone as (
      delete from public.market_wallet_nonces as t
      where t.ctid = any (array(
        select u.ctid from public.market_wallet_nonces as u
        where u.expires_at < v_now - pg_catalog.make_interval(days => v_cfg.nonce_days) and (u.used_at is null or u.used_at < v_now - pg_catalog.make_interval(days => v_cfg.nonce_days)) limit v_batch
      ))
      returning 1
    )
    select pg_catalog.count(*) into v_n from gone;
  end if;
  v_tables := v_tables || pg_catalog.jsonb_build_object('market_wallet_nonces', pg_catalog.jsonb_build_object('rows', v_n, 'more', v_n >= v_batch));
  v_more := v_more or v_n >= v_batch;

  -- public.market_reservations: only the ones that never became money (expired / cancelled), past the late-payment grace plus the margin, and with no chain payment pointing at them.
  -- 'paid', 'refund_due' and 'refunded' reservations are part of the financial trail and stay.
  if p_dry_run then
    select pg_catalog.count(*) into v_n from (
      select 1 from public.market_reservations as t
      where t.status in ('expired', 'cancelled') and t.grace_until < v_now - pg_catalog.make_interval(days => v_cfg.reservation_days)
        and not exists (select 1 from public.chain_payments as cp where cp.reservation_id = t.id) limit v_batch
    ) as q;
  else
    with gone as (
      delete from public.market_reservations as t
      where t.id = any (array(
        select u.id from public.market_reservations as u
        where u.status in ('expired', 'cancelled') and u.grace_until < v_now - pg_catalog.make_interval(days => v_cfg.reservation_days)
          and not exists (select 1 from public.chain_payments as cp where cp.reservation_id = u.id) limit v_batch
      ))
      returning 1
    )
    select pg_catalog.count(*) into v_n from gone;
  end if;
  v_tables := v_tables || pg_catalog.jsonb_build_object('market_reservations', pg_catalog.jsonb_build_object('rows', v_n, 'more', v_n >= v_batch));
  v_more := v_more or v_n >= v_batch;

  -- public.checkout_attempts: the rate limit looks back 10 minutes and a Stripe session lives 24 hours; payment_events keeps the real record.
  if p_dry_run then
    select pg_catalog.count(*) into v_n from (select 1 from public.checkout_attempts as t where t.created_at < v_now - pg_catalog.make_interval(days => v_cfg.checkout_attempt_days) limit v_batch) as q;
  else
    with gone as (
      delete from public.checkout_attempts as t
      where t.id = any (array(select u.id from public.checkout_attempts as u where u.created_at < v_now - pg_catalog.make_interval(days => v_cfg.checkout_attempt_days) limit v_batch))
      returning 1
    )
    select pg_catalog.count(*) into v_n from gone;
  end if;
  v_tables := v_tables || pg_catalog.jsonb_build_object('checkout_attempts', pg_catalog.jsonb_build_object('rows', v_n, 'more', v_n >= v_batch));
  v_more := v_more or v_n >= v_batch;

  -- arena_private.waitlist_limits: the hashed rate-limit buckets (HMAC of the IP / subnet / e-mail). The longest window is an hour; they are deleted after waitlist_limit_days (7).
  if p_dry_run then
    select pg_catalog.count(*) into v_n from (select 1 from arena_private.waitlist_limits as t where t.window_start < v_now - pg_catalog.make_interval(days => v_cfg.waitlist_limit_days) limit v_batch) as q;
  else
    with gone as (
      delete from arena_private.waitlist_limits as t
      where t.ctid = any (array(select u.ctid from arena_private.waitlist_limits as u where u.window_start < v_now - pg_catalog.make_interval(days => v_cfg.waitlist_limit_days) limit v_batch))
      returning 1
    )
    select pg_catalog.count(*) into v_n from gone;
  end if;
  v_tables := v_tables || pg_catalog.jsonb_build_object('waitlist_limits', pg_catalog.jsonb_build_object('rows', v_n, 'more', v_n >= v_batch));
  v_more := v_more or v_n >= v_batch;

  -- Replay caches: ONLY when the owner set request_cache_days.
  if v_cfg.request_cache_days is not null then
    if p_dry_run then
      select pg_catalog.count(*) into v_n from (select 1 from public.item_mint_requests as t where t.created_at < v_now - pg_catalog.make_interval(days => v_cfg.request_cache_days) limit v_batch) as q;
    else
      with gone as (
        delete from public.item_mint_requests as t
        where t.ctid = any (array(select u.ctid from public.item_mint_requests as u where u.created_at < v_now - pg_catalog.make_interval(days => v_cfg.request_cache_days) limit v_batch))
        returning 1
      )
      select pg_catalog.count(*) into v_n from gone;
    end if;
    v_tables := v_tables || pg_catalog.jsonb_build_object('item_mint_requests', pg_catalog.jsonb_build_object('rows', v_n, 'more', v_n >= v_batch));
    v_more := v_more or v_n >= v_batch;

    if p_dry_run then
      select pg_catalog.count(*) into v_n from (select 1 from public.material_requests as t where t.created_at < v_now - pg_catalog.make_interval(days => v_cfg.request_cache_days) limit v_batch) as q;
    else
      with gone as (
        delete from public.material_requests as t
        where t.ctid = any (array(select u.ctid from public.material_requests as u where u.created_at < v_now - pg_catalog.make_interval(days => v_cfg.request_cache_days) limit v_batch))
        returning 1
      )
      select pg_catalog.count(*) into v_n from gone;
    end if;
    v_tables := v_tables || pg_catalog.jsonb_build_object('material_requests', pg_catalog.jsonb_build_object('rows', v_n, 'more', v_n >= v_batch));
    v_more := v_more or v_n >= v_batch;
  end if;

  return pg_catalog.jsonb_build_object(
    'status', 'ok',
    'dry_run', p_dry_run,
    'more', v_more,
    'progress_snapshots', pg_catalog.jsonb_build_object('rows', v_snap_rows, 'more', pg_catalog.cardinality(v_ids) >= v_batch),
    'tables', v_tables,
    'kept', pg_catalog.jsonb_build_array(
      'item_certificates', 'item_certificate_events', 'material_ledger', 'material_balances', 'market_events', 'market_sales', 'chain_payments',
      'payment_events', 'entitlements', 'season_entries', 'progress_flag_clears', 'flagged_and_rejected_snapshots'
    )
  );
end;
$$;

revoke all on function public.retention_run(boolean) from public, anon, authenticated;
grant execute on function public.retention_run(boolean) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- public.retention_disk_report: where the disk goes. Row counts are the planner's estimates (run `analyze` for fresher ones); bytes include indexes and TOAST.
--   select * from public.retention_disk_report();
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.retention_disk_report()
returns table (relation text, policy text, rows_estimate bigint, total_bytes bigint, total_size text)
language sql
stable
security definer
set search_path = ''
as $$
  select v.name,
         v.policy,
         greatest(c.reltuples, 0)::bigint,
         pg_catalog.pg_total_relation_size(c.oid),
         pg_catalog.pg_size_pretty(pg_catalog.pg_total_relation_size(c.oid))
  from (values
    ('public.progress_snapshots', 'compacted'),
    ('public.characters', 'live (one row per account)'),
    ('public.item_certificates', 'kept (ledger)'),
    ('public.item_certificate_events', 'kept (ledger)'),
    ('public.item_mint_requests', 'replay cache (kept unless request_cache_days)'),
    ('public.material_ledger', 'kept (ledger)'),
    ('public.material_requests', 'replay cache (kept unless request_cache_days)'),
    ('public.material_balances', 'live'),
    ('public.market_events', 'kept (ledger)'),
    ('public.market_sales', 'kept (ledger)'),
    ('public.chain_payments', 'kept (ledger)'),
    ('public.market_reservations', 'expired rows deleted'),
    ('public.market_wallet_nonces', 'expired rows deleted'),
    ('public.market_listings', 'kept'),
    ('public.payment_events', 'kept (ledger)'),
    ('public.checkout_attempts', 'old rows deleted'),
    ('public.waitlist', 'kept'),
    ('arena_private.waitlist_limits', 'old rows deleted'),
    ('arena_private.progress_rate', 'old rows deleted'),
    ('arena_private.item_buckets', 'live (one row per account and bucket)'),
    ('arena_private.item_account_flags', 'kept (audit)')
  ) as v(name, policy)
  join pg_catalog.pg_class as c on c.oid = pg_catalog.to_regclass(v.name)
  order by 4 desc;
$$;

revoke all on function public.retention_disk_report() from public, anon, authenticated;
grant execute on function public.retention_disk_report() to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- THE pg_cron SCHEDULE (documented, NOT created by this file: pg_cron is an extension you switch on yourself).
--   1. Dashboard -> Database -> Extensions -> enable pg_cron (or: create extension if not exists pg_cron with schema pg_catalog;).
--   2. FIRST run it by hand and look: select public.retention_run(true);       -- dry run, deletes nothing
--      then:                            select public.retention_run();          -- one real batch; repeat while the answer says "more": true
--   3. Then schedule (SQL editor; cron jobs run as the database owner, which may call the function):
--        select cron.schedule('retention-run', '*/10 * * * *', $$select public.retention_run();$$);
--        select cron.schedule('retention-cron-log', '30 4 * * *', $$delete from cron.job_run_details where end_time < now() - interval '7 days';$$);
--      Every 10 minutes drains 10 000 rows per table per tick (about 1.4 million snapshot rows a day) until the backlog is gone, then each tick finds almost nothing. Once the backlog is gone
--      a nightly run is enough: select cron.schedule('retention-run', '15 4 * * *', $$select public.retention_run();$$);   (same name = replaces the schedule)
--   4. Look at it: select jobid, jobname, schedule, active from cron.job;      select * from cron.job_run_details order by start_time desc limit 20;
--   5. Stop it: select cron.unschedule('retention-run');
--
-- SQL TEST PLAN (run after applying, in the DEV project; nothing here is run automatically).
--
-- A. Service role only. As authenticated and as anon (set local role ...; select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);):
--      select public.retention_run(true);                  -> permission denied for function
--      select * from public.retention_disk_report();       -> permission denied for function
--      select * from arena_private.retention_config;       -> permission denied for schema arena_private
--    As the owner: select public.retention_run(true); -> { "status": "ok", "dry_run": true, ... } and nothing changes (compare count(*) of every table before and after).
-- B. Fixture for the snapshot rules (owner, one user U with no Pass, no season window: seasons 1..8 are 'upcoming' without dates, season 0 is kind 'pre'). Insert 'ok' snapshots for U:
--      times  now()-60d 09:00, 10:00, 11:00, 12:00 (same UTC day, 4 rows) and now()-45d 10:00 (1 row), now()-2d 10:00 and 11:00 (2 rows), plus a 'flagged' one at now()-59d and a 'rejected' one at now()-58d.
--      select public.retention_run(); -> progress_snapshots.rows = 2 (the 10:00 and 11:00 of the 60-days-ago day).
--      Remaining for U: 09:00 and 12:00 of that day, the 45d row, both 2d rows (younger than 30 days), the flagged and the rejected row. The newest ok row is always still there.
--      A second call: progress_snapshots.rows = 0 (idempotent).
-- C. Flags are never deleted: the flagged and rejected rows of B survive any number of runs, also with snapshot_full_days = 1. Clear them (select public.progress_clear_flags('<U>', 'checked by hand', false);)
--    -> they STILL survive (only 'ok' rows are ever deleted).
-- D. Baselines. After B with `update arena_private.retention_config set snapshot_full_days = 1;` and a run: U's FIRST ok row (now()-60d 09:00) and its LAST ok row (now()-2d 11:00) are still there.
--    With a League reset at now()-50d (arena_private.season_goal.reset_at, set it as the owner), the first ok row at or after the reset (the now()-45d row) survives a run, and so does the last row before it.
-- E. Held seasons. Make season 1 'open' with dates covering now()-70d .. now()+20d (update public.seasons set starts_at = ..., ends_at = ..., freeze_at = ..., status = 'open' where number = 1;) and insert a
--    season_entries row for U in season 1: a run deletes nothing of U's rows inside the window, even those older than 30 days (the audit keeps the whole season). A second user V with NO entry in that season and
--    the same rows: V's middle rows ARE compacted (snapshot_participants_only = true); set it to false: they are held too. Set season 1 to 'paid': U's middle rows are compacted at the next run, even the
--    ones younger than 30 days.
-- F. best_snapshot_id. Point season_entries.best_snapshot_id of U at a middle row: that row survives; no foreign-key error.
-- G. Open flag hold. Give W (no Pass) a flagged snapshot nobody cleared and ok rows 40..60 days old, middle rows included: they are NOT deleted (inside snapshot_flag_hold_days). Clear the flag: the next run compacts them.
-- H. Notes. An ok row with reasons {FAST_LEVEL_PACE} in the middle of a day survives.
-- I. Month tier. ok rows 100..130 days old on 5 different days of one month: after a run only the first and the last ok row of each (user, month, side of the reset) remain.
-- J. Short-lived tables. Insert an old row in each, then run:
--      arena_private.progress_rate (last_at = now()-3d), public.market_wallet_nonces (expires_at = now()-5d), public.checkout_attempts (created_at = now()-40d),
--      arena_private.waitlist_limits (window_start = now()-8d), public.market_reservations (status 'expired', grace_until = now()-40d, no chain_payments row) -> all deleted.
--    A reservation 'paid' or 'refund_due', or an expired one with a chain_payments row, a waitlist_limits row 3 days old, a nonce that expired 1 day ago: all survive.
-- K. Ledgers untouched: row counts of item_certificates, item_certificate_events, material_ledger, market_events, market_sales, chain_payments, payment_events are identical before and after.
-- L. Replay caches: with request_cache_days null, item_mint_requests / material_requests rows survive and the answer has no such keys under "tables". Set it to 60: old rows go, newer stay.
-- M. Batches. update arena_private.retention_config set batch_size = 100; with 250 old rows in checkout_attempts: three calls delete 100, 100, 50; the first two answer more = true, the third false.
-- N. Concurrency. Start retention_run() in two SQL sessions at once: one answers { "status": "busy" }.
-- O. Report. select * from public.retention_disk_report(); lists every table that exists, biggest first, with its policy.
-- ---------------------------------------------------------------------------------------------------------------------------------------
