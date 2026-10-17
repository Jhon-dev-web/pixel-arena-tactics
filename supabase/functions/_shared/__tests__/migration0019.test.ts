import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_RETENTION } from './retentionModel';

// Migration 0019 (data retention) is SQL that is never run from this repo: these tests read the file and pin what it must guarantee. The compaction rule itself is restated and tested in
// retentionModel.ts / retention.test.ts; here the SQL is pinned to the same predicates and the same defaults.
const root = resolve(__dirname, '../../../..');
const read = (p: string): string => readFileSync(resolve(root, p), 'utf8').split('\r\n').join('\n');
const raw = read('supabase/migrations/0019_retention.sql');
const code = raw
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');
const earlier = readdirSync(resolve(root, 'supabase/migrations'))
  .filter((f) => /^00(0\d|1[0-8])_/.test(f))
  .map((f) => read(`supabase/migrations/${f}`))
  .join('\n');
const fn = /create or replace function public\.retention_run\([\s\S]*?\n\$\$;/.exec(code)?.[0] ?? '';

describe('0019 retention: the function', () => {
  it('exists, is security definer with an empty search path, and is callable by the service role ONLY', () => {
    expect(fn.length).toBeGreaterThan(2000);
    expect(code).toMatch(/create or replace function public\.retention_run\(p_dry_run boolean default false\)\s+returns jsonb\s+language plpgsql\s+security definer\s+set search_path = ''/);
    expect(code).toContain('revoke all on function public.retention_run(boolean) from public, anon, authenticated;');
    expect(code).toContain('grant execute on function public.retention_run(boolean) to service_role;');
    expect(code).not.toMatch(/grant execute on function public\.retention_\w+\([^)]*\) to [^;]*(anon|authenticated|public)/);
  });

  it('the report function is service-role only too, and read-only', () => {
    const report = /create or replace function public\.retention_disk_report\(\)[\s\S]*?\n\$\$;/.exec(code)?.[0] ?? '';
    expect(report).toContain('stable');
    expect(report).toContain('security definer');
    expect(report).toContain("set search_path = ''");
    expect(report).not.toMatch(/\b(delete|insert|update|truncate)\b/i);
    expect(code).toContain('revoke all on function public.retention_disk_report() from public, anon, authenticated;');
    expect(code).toContain('grant execute on function public.retention_disk_report() to service_role;');
  });

  it('the config table is private: RLS on, no client privilege, no policy, one permanent row', () => {
    expect(code).toContain('alter table arena_private.retention_config enable row level security;');
    expect(code).toContain('revoke all on table arena_private.retention_config from public, anon, authenticated;');
    expect(code).toContain('grant select, update on table arena_private.retention_config to service_role;');
    expect(code).not.toMatch(/create policy/i);
    expect(code).toContain('constraint retention_config_single_row check (id)');
  });

  it('batches every delete (a configurable number of rows), never an unbounded delete', () => {
    expect(code).toContain('batch_size integer not null default 10000');
    expect(code).toContain('v_batch := v_cfg.batch_size;');
    const deletes = fn.match(/delete from [\w.]+ as \w+/g) ?? [];
    expect(deletes.length).toBeGreaterThanOrEqual(8);
    // every delete is restricted to an id / ctid list built with limit v_batch (or, for the snapshots, to the batch ids)
    const limited = fn.match(/limit v_batch/g) ?? [];
    expect(limited.length).toBeGreaterThanOrEqual(deletes.length);
    expect(fn).toContain('d.id = any (v_ids)');
    expect(fn).toMatch(/order by q\.created_at\s+limit v_batch/);
  });

  it('is idempotent and safe to overlap: advisory lock, a short lock timeout, a dry run, a summary', () => {
    expect(fn).toContain("pg_try_advisory_xact_lock(pg_catalog.hashtextextended('retention_run', 0))");
    expect(fn).toContain("'status', 'busy'");
    expect(fn).toContain("set_config('lock_timeout', '5s', true)");
    expect(fn).toContain('p_dry_run');
    expect(fn).toContain("'more', v_more");
    expect(fn).toContain("'progress_snapshots', pg_catalog.jsonb_build_object('rows', v_snap_rows");
  });
});

describe('0019 retention: progress_snapshots', () => {
  it('only ok rows are candidates, and the DELETE itself refuses a flagged / rejected row and the account\'s newest ok row (the baseline)', () => {
    expect(fn).toMatch(/from public\.progress_snapshots as r\s+where r\.verdict = 'ok'/);
    expect(fn).toContain("and d.verdict = 'ok'");
    expect(fn).toMatch(/n\.user_id = d\.user_id and n\.verdict = 'ok' and n\.created_at > d\.created_at/);
    expect(fn.match(/delete from public\.progress_snapshots/g)).toHaveLength(1);
  });

  it('keeps the first and the last ok row of each bucket (user, day or month, side of the League reset)', () => {
    expect(fn).toContain('q.id <> q.first_id');
    expect(fn).toContain('q.id <> q.last_id');
    expect(fn).toContain('partition by k.user_id, k.monthly, k.after_reset, k.bucket');
    expect(fn).toContain('rows between unbounded preceding and unbounded following');
    expect(fn).toContain("pg_catalog.date_trunc('day', b.created_at at time zone 'UTC')");
    expect(fn).toContain("pg_catalog.date_trunc('month', b.created_at at time zone 'UTC')");
    expect(fn).toContain('(v_reset is not null and r.created_at >= v_reset) as after_reset');
    expect(fn).toContain('select g.reset_at into v_reset from arena_private.season_goal as g where g.id');
  });

  it('holds: unpaid ranked seasons (participants by default), the pre-season only on request, open flags, notes, best_snapshot_id', () => {
    expect(fn).toContain("where s.kind = 'ranked' and s.starts_at is not null and s.ends_at is not null and s.status <> 'paid'");
    expect(fn).toContain("where s.kind = 'ranked' and s.starts_at is not null and s.ends_at is not null and s.status = 'paid'");
    expect(fn).toContain("v_cfg.snapshot_pre_season_full and s.kind = 'pre'");
    expect(fn).toContain('not v_cfg.snapshot_participants_only');
    expect(fn).toContain('from public.season_entries as e where e.season = h.number and e.user_id = r.user_id');
    expect(fn).toContain('from public.season_profession_entries as pe where pe.season = h.number and pe.user_id = r.user_id');
    expect(fn).toContain('and not q.in_held');
    expect(fn).toContain('(q.in_paid or q.created_at < v_full_cut)');
    expect(fn).toContain('pg_catalog.cardinality(q.reasons) = 0');
    expect(fn).toContain('select e.best_snapshot_id as id from public.season_entries as e');
    expect(fn).toContain('select p.best_snapshot_id as id from public.season_profession_entries as p');
    expect(fn).toContain('not exists (select 1 from pinned as pn where pn.id = q.id)');
    // an open flag = a non-ok snapshot nobody cleared (progress_flag_clears)
    expect(fn).toMatch(/where f\.verdict <> 'ok'\s+and not exists \(select 1 from public\.progress_flag_clears as k where k\.snapshot_id = f\.id\)/);
    expect(fn).toContain('not (q.created_at >= v_flag_cut and exists (select 1 from open_flags as o where o.user_id = q.user_id))');
  });

  it('the defaults are the model\'s (30 days, month tier at 90, flag hold 90, participants only, batch 10 000)', () => {
    expect(code).toContain(`snapshot_full_days integer not null default ${DEFAULT_RETENTION.snapshotFullDays}`);
    expect(code).toContain(`snapshot_monthly_after_days integer default ${DEFAULT_RETENTION.snapshotMonthlyAfterDays}`);
    expect(code).toContain(`snapshot_flag_hold_days integer not null default ${DEFAULT_RETENTION.snapshotFlagHoldDays}`);
    expect(code).toContain(`snapshot_participants_only boolean not null default ${DEFAULT_RETENTION.snapshotParticipantsOnly}`);
    expect(code).toContain(`snapshot_pre_season_full boolean not null default ${DEFAULT_RETENTION.snapshotPreSeasonFull}`);
    expect(code).toContain(`batch_size integer not null default ${DEFAULT_RETENTION.batchSize}`);
  });

  it('never touches the append-only guard: it deletes, it does not update', () => {
    expect(code).not.toMatch(/\bupdate\s+public\.progress_snapshots\b/i);
    expect(code).not.toMatch(/disable trigger|drop trigger|truncate/i);
  });
});

describe('0019 retention: the other tables', () => {
  const deleted = [...fn.matchAll(/delete from ([\w.]+) as \w+/g)].map((m) => m[1]);

  it('deletes from exactly these tables and no ledger', () => {
    expect([...new Set(deleted)].sort()).toEqual(
      [
        'arena_private.progress_rate',
        'arena_private.waitlist_limits',
        'public.checkout_attempts',
        'public.item_mint_requests',
        'public.market_reservations',
        'public.market_wallet_nonces',
        'public.material_requests',
        'public.progress_snapshots',
      ].sort(),
    );
    for (const ledger of ['item_certificates', 'item_certificate_events', 'material_ledger', 'material_balances', 'market_events', 'market_sales', 'chain_payments', 'payment_events', 'entitlements', 'season_entries', 'progress_flag_clears', 'referral_rewards_granted', 'market_listings']) {
      expect(deleted.some((t) => t.endsWith(`.${ledger}`)), ledger).toBe(false);
    }
    expect(code).not.toMatch(/\btruncate\b/i);
  });

  it('every table and column it reads or deletes exists in an earlier migration', () => {
    for (const t of new Set(deleted)) {
      const name = t.split('.')[1];
      expect(earlier, t).toMatch(new RegExp(`create table if not exists ${t.replace('.', '\\.')} \\(`));
      expect(name.length).toBeGreaterThan(3);
    }
    for (const col of ['grace_until', 'expires_at', 'used_at', 'window_start', 'last_at', 'session_completed', 'best_snapshot_id', 'reset_at', 'reservation_id']) expect(earlier, col).toContain(col);
  });

  it('reservations: only expired / cancelled ones, past the grace, and with no chain payment on them (a paid / refund_due one is part of the financial trail)', () => {
    expect(fn).toContain("u.status in ('expired', 'cancelled') and u.grace_until < v_now - pg_catalog.make_interval(days => v_cfg.reservation_days)");
    expect(fn).toContain('not exists (select 1 from public.chain_payments as cp where cp.reservation_id = u.id)');
    expect(fn).not.toMatch(/status in \([^)]*'(paid|refund_due|refunded)'/);
  });

  it('the wallet nonces and the waitlist hashes use their windows; the waitlist hashes go after 7 days', () => {
    expect(code).toContain('waitlist_limit_days integer not null default 7');
    expect(fn).toContain('u.window_start < v_now - pg_catalog.make_interval(days => v_cfg.waitlist_limit_days)');
    expect(fn).toContain('u.expires_at < v_now - pg_catalog.make_interval(days => v_cfg.nonce_days)');
  });

  it('the replay caches are kept unless the owner sets request_cache_days', () => {
    expect(code).toContain('request_cache_days integer,');
    expect(fn).toContain('if v_cfg.request_cache_days is not null then');
  });
});

describe('0019 retention: documentation inside the file', () => {
  it('documents the pg_cron schedule (not created by the file) and how to run it by hand first', () => {
    expect(code).not.toMatch(/cron\.schedule|create extension/i);
    expect(raw).toContain("select cron.schedule('retention-run', '*/10 * * * *', $$select public.retention_run();$$);");
    expect(raw).toContain("select cron.schedule('retention-cron-log', '30 4 * * *', $$delete from cron.job_run_details where end_time < now() - interval '7 days';$$);");
    expect(raw).toContain('select public.retention_run(true);');
    expect(raw).toContain("select cron.unschedule('retention-run');");
  });

  it('carries its rollback and its SQL test plan, and says it was not applied', () => {
    expect(raw).toContain('-- ROLLBACK (by hand');
    expect(raw).toContain('drop function if exists public.retention_run(boolean);');
    expect(raw).toContain('drop function if exists public.retention_disk_report();');
    expect(raw).toContain('drop table if exists arena_private.retention_config;');
    expect(raw).toContain('-- SQL TEST PLAN');
    expect(raw).toContain('NOT APPLIED');
    expect(raw).toContain('vacuum full');
  });
});
