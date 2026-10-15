import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProgressStore } from '../progress/progressDb.ts';
import { peakOf, extractMetrics, ProgressMetrics } from '../progress/metrics.ts';

// The ranking itself is SQL (migration 0005, never run from this repo): these tests read the file and pin the guarantees that matter, and exercise the REST store
// against a fake fetch. The SQL test plan at the end of each migration is what the owner runs against a real database.

const sql = (name: string) => readFileSync(resolve(__dirname, '../../../migrations', name), 'utf8');
const SERVICE_KEY = 'service-role-key-for-tests-only';
const USER = '11111111-1111-4111-8111-111111111111';

describe('migration 0005 (static checks)', () => {
  const m5 = sql('0005_seasons_ranking.sql');
  const m4 = sql('0004_season_snapshots.sql');

  it('only the service role can call the apply function, and it checks Pass, e-mail and the season window itself', () => {
    expect(m5).toMatch(/revoke all on function public\.season_apply_snapshot\(uuid, uuid, text, text\[\], bigint\) from public, anon, authenticated;/);
    expect(m5).toMatch(/grant execute on function public\.season_apply_snapshot\(uuid, uuid, text, text\[\], bigint\) to service_role;/);
    expect(m5).toContain('arena_private.owns_adventurer_pass(p_user_id)');
    expect(m5).toContain('email_confirmed_at is not null');
    expect(m5).toMatch(/s\.status = 'open' and pg_catalog\.now\(\) >= s\.starts_at and pg_catalog\.now\(\) < s\.freeze_at/);
    expect(m5).toContain("if p_verdict <> 'ok' then"); // only an ok snapshot can move the score
    expect(m5).toContain('p_score > v_entry.score'); // a score only ever improves; the tiebreak time is set only then
  });

  it('clients get no write privilege anywhere, and the snapshots are append-only with no insert for clients', () => {
    for (const table of ['seasons', 'season_entries']) expect(m5).toContain(`revoke all on table public.${table} from public, anon, authenticated;`);
    expect(m5).not.toMatch(/grant (insert|update|delete)[^;]*to (anon|authenticated)/);
    expect(m4).not.toMatch(/grant (insert|update|delete)[^;]*to (anon|authenticated)/);
    expect(m4).toContain('revoke all on table public.progress_snapshots from public, anon, authenticated;');
    expect(m4).toContain('PROGRESS_SNAPSHOTS_APPEND_ONLY');
    expect(m4).toContain('default now()'); // the server clock
  });

  it('the public leaderboard exposes rank, username, score parts and a flag count, and nothing that identifies the account', () => {
    const view = m5.slice(m5.indexOf('create or replace view public.season_leaderboard'), m5.indexOf('revoke all on table public.season_leaderboard'));
    expect(view).toContain('with (security_invoker = false)');
    const selectList = view.slice(view.indexOf('select') + 6, view.indexOf('from public.season_entries'));
    const names = selectList
      .split('\n')
      .map((l) => l.trim().replace(/,$/, ''))
      .filter(Boolean)
      .map((l) => / as (\w+)$/.exec(l)?.[1] ?? l.replace(/^\w+\./, ''));
    expect(names).toEqual(['season', 'rank', 'username', 'level_total', 'paragon_level', 'highest_floor', 'deepest_depth', 'flag_count']);
    expect(view).toContain('e.disqualified = false');
    expect(view).toMatch(/order by e\.score desc, e\.tiebreak_at asc/); // higher score first, earlier time wins the tie
  });

  it('the seeded seasons follow src/game/seasons.ts, start as upcoming, and carry no prize', () => {
    expect(m5).toContain("timestamptz '2026-10-01 00:00:00+00'");
    expect(m5).toContain('(n - 1) * 60');
    expect(m5).toContain("status text not null default 'upcoming'");
    expect(m5).toMatch(/prize_note text,/);
    const insert = m5.slice(m5.indexOf('insert into public.seasons'), m5.indexOf('on conflict (number) do nothing'));
    expect(insert).not.toContain('prize');
    expect(insert).not.toMatch(/'open'/);
  });

  it('after the freeze nothing changes the score, even by hand (trigger), while flags and disqualification stay editable', () => {
    expect(m5).toContain('SEASON_NOT_OPEN');
    expect(m5).toMatch(/new\.score is distinct from old\.score or new\.tiebreak_at is distinct from old\.tiebreak_at or new\.best_snapshot_id is distinct from old\.best_snapshot_id/);
  });
});

describe('createProgressStore (REST)', () => {
  function fakeFetch(handler: (url: string, init: RequestInit) => Response) {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = (async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      return handler(url, init);
    }) as typeof fetch;
    return { calls, fetchFn };
  }
  const metrics = extractMetrics({ xp: 5000, highestDungeonFloor: 7, stats: {} }) as ProgressMetrics;

  it('inserts a snapshot with the service key, the peak inside metrics, and never a user-supplied clock', async () => {
    const { calls, fetchFn } = fakeFetch(() => new Response(JSON.stringify([{ id: 'abc' }]), { status: 201 }));
    const store = createProgressStore({ supabaseUrl: 'https://p.test/', serviceRoleKey: SERVICE_KEY, fetchFn });
    const r = await store.insertSnapshot({ userId: USER, saveRevision: 3, schemaVersion: 2, appVersion: '0.1.0', metrics, peak: peakOf(metrics), metricsHash: 'f'.repeat(64), verdict: 'ok', reasons: [] });
    expect(r).toEqual({ id: 'abc' });
    expect(calls[0].url).toBe('https://p.test/rest/v1/progress_snapshots?select=id');
    const body = JSON.parse(calls[0].init.body as string);
    expect(body).not.toHaveProperty('created_at');
    expect(body.metrics._peak.xp).toBe(5000);
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe(`Bearer ${SERVICE_KEY}`);
  });

  it('hands the snapshot to the ranking through the rpc with the score the function computed', async () => {
    const { calls, fetchFn } = fakeFetch(() => new Response(JSON.stringify('updated'), { status: 200 }));
    const store = createProgressStore({ supabaseUrl: 'https://p.test', serviceRoleKey: SERVICE_KEY, fetchFn });
    expect(await store.applyToSeason!({ userId: USER, snapshotId: 'snap', verdict: 'flagged', reasons: ['LEVEL_PACE'], score: 7_000_100 })).toBe('updated');
    expect(calls[0].url).toBe('https://p.test/rest/v1/rpc/season_apply_snapshot');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ p_user_id: USER, p_snapshot_id: 'snap', p_verdict: 'flagged', p_reasons: ['LEVEL_PACE'], p_score: 7_000_100 });
  });

  it('reads the accepted history (ONLY ok: a flagged or rejected snapshot is never a baseline) and rebuilds the peak; errors carry only the status', async () => {
    const row = { id: 's1', created_at: '2026-10-05T00:00:00Z', save_revision: 4, verdict: 'ok', reasons: [], metrics: { ...metrics, _peak: { ...peakOf(metrics), xp: 9000 } } };
    const { calls, fetchFn } = fakeFetch((url) => (url.includes('/progress_snapshots?') ? new Response(JSON.stringify([row]), { status: 200 }) : new Response('secret body', { status: 500 })));
    const store = createProgressStore({ supabaseUrl: 'https://p.test', serviceRoleKey: SERVICE_KEY, fetchFn });
    const h = await store.acceptedHistory(USER);
    expect(h.first?.peak.xp).toBe(9000);
    expect(h.first?.atMs).toBe(Date.parse('2026-10-05T00:00:00Z'));
    expect(h.first?.metrics).not.toHaveProperty('_peak');
    expect(calls.every((c) => c.url.includes('verdict=eq.ok') && c.url.includes(`user_id=eq.${USER}`))).toBe(true);
    await expect(store.hasActivePass(USER)).rejects.toThrow('entitlement_read_500');
    await expect(store.hasActivePass(USER)).rejects.not.toThrow(/secret/);
  });
});

// ---- migration 0006: the public meter, the goal that opens the paid season, the pre-season and the profession rankings ----------------------------------------------------

describe('migration 0006 (static checks)', () => {
  const m6 = sql('0006_portal_meter_and_profession_ranking.sql');
  const body = (name: string): string => {
    const start = m6.indexOf(`create or replace function ${name}`);
    expect(start).toBeGreaterThan(-1);
    return m6.slice(start, m6.indexOf('$$;', m6.indexOf('as $$', start)) + 3);
  };

  it('anon can call pass_meter and read the two views, and nothing else; the meter reveals no id, amount, e-mail or source', () => {
    expect(m6).toContain('grant execute on function public.pass_meter() to anon, authenticated;');
    expect(m6).toContain('grant select on table public.season_profession_leaderboard to anon, authenticated;');
    const toAnon = m6.split('\n').filter((l) => /^grant /.test(l) && /\banon\b/.test(l));
    expect(toAnon).toHaveLength(2);
    expect(m6).not.toMatch(/grant (insert|update|delete|all)[^;]*to (anon|authenticated)/);
    const meter = body('public.pass_meter()');
    const returns = /returns table \(([^)]*)\)/.exec(meter)![1];
    expect(returns.split(',').map((c) => c.trim().split(' ')[0])).toEqual(['sold', 'target', 'season_open', 'starts_at', 'ends_at', 'updated_at']);
    expect(meter).not.toMatch(/user_id|email|provider_ref|e\.source/);
    expect(meter).toContain('security definer');
    expect(meter).toContain("set search_path = ''");
    expect(m6).toContain('revoke all on function arena_private.paid_pass_count() from public, anon, authenticated;');
  });

  it('only paid, active Pass rows count: stripe and mercadopago, never grant, refunded or revoked', () => {
    const count = body('arena_private.paid_pass_count()');
    expect(count).toContain("e.kind = 'adventurer_pass'");
    expect(count).toContain("e.status = 'active'");
    expect(count).toContain("e.source in ('stripe', 'mercadopago')");
    expect(count).not.toContain('grant');
  });

  it('the goal is a private one-row table only the service role can read and update', () => {
    expect(m6).toContain('constraint season_goal_single_row check (id)');
    expect(m6).toMatch(/target integer not null default 15000/);
    expect(m6).toContain('revoke all on table arena_private.season_goal from public, anon, authenticated;');
    expect(m6).toContain('grant select, update on table arena_private.season_goal to service_role;');
    expect(m6).not.toMatch(/season_goal to (anon|authenticated)/);
  });

  it('the auto-open takes the row lock BEFORE counting, fires once, and uses the server clock for 60 days / freeze 58 days', () => {
    const fn = body('arena_private.try_open_paid_season()');
    expect(fn).toContain('for update');
    expect(fn.indexOf('for update')).toBeLessThan(fn.indexOf('arena_private.paid_pass_count()'));
    expect(fn).toMatch(/if exists \(select 1 from arena_private\.season_goal as g where g\.opened_at is not null\) then\s+return false;/);
    expect(fn).toContain('v_goal.opened_at is not null'); // re-checked under the lock
    expect(fn).toMatch(/paid_pass_count\(\) < v_goal\.target/); // not below the target
    expect(fn).toContain('set opened_at = pg_catalog.now() where id and opened_at is null'); // stamped under the same lock
    const open = body('arena_private.open_paid_season(p_season integer)');
    expect(open).toContain("where number = p_season and kind = 'ranked' and status = 'upcoming'"); // a closed or open season never reopens
    expect(open).toContain('starts_at = pg_catalog.now()');
    expect(open).toContain("ends_at = pg_catalog.now() + interval '60 days'");
    expect(open).toContain("freeze_at = pg_catalog.now() + interval '58 days'");
    expect(open).toContain("update public.seasons set status = 'closed' where kind = 'pre' and status = 'open'"); // the pre-season is archived
    expect(open).toContain('if v_rows = 0 then');
  });

  it('the trigger watches only active paid Pass rows (insert or status change) and never blocks a payment', () => {
    const trg = body('arena_private.entitlements_goal_trigger()');
    expect(trg).toContain("new.kind = 'adventurer_pass' and new.status = 'active' and new.source in ('stripe', 'mercadopago')");
    expect(trg).toContain('exception when others then');
    expect(trg).toContain('raise warning');
    expect(m6).toMatch(/create trigger entitlements_goal_check\s+after insert or update of status on public\.entitlements\s+for each row/);
    expect(m6).toContain('revoke all on function arena_private.try_open_paid_season() from public, anon, authenticated;');
    expect(m6).toContain('revoke all on function arena_private.open_paid_season(integer) from public, anon, authenticated;');
  });

  it('ranked seasons wait without dates; the pre-season is open, kind pre, with no prize; the Pass reward calendar is not touched', () => {
    expect(m6).toContain("update public.seasons set starts_at = null, ends_at = null, freeze_at = null where kind = 'ranked' and status = 'upcoming';");
    expect(m6).toMatch(/insert into public\.seasons \(number, kind, starts_at, ends_at, freeze_at, status, prize_note\)\s+select 0, 'pre'/);
    const code = m6.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(code).not.toMatch(/prize_note\s*=\s*'/);
    expect(code).not.toMatch(/\d ?(reais|brl|usd|r\$)/i);
    expect(m6).toContain("check (kind in ('pre', 'ranked'))");
    expect(code).not.toContain('2026-10-01');
  });

  it('profession entries: private table, service-role writer, same conditions as the main ranking, frozen after the season', () => {
    expect(m6).toContain('revoke all on table public.season_profession_entries from public, anon, authenticated;');
    expect(m6).toMatch(/revoke all on function public\.season_apply_professions\(uuid, uuid, text, jsonb\) from public, anon, authenticated;/);
    expect(m6).toMatch(/grant execute on function public\.season_apply_professions\(uuid, uuid, text, jsonb\) to service_role;/);
    const fn = body('public.season_apply_professions(p_user_id uuid, p_snapshot_id uuid, p_verdict text, p_professions jsonb)');
    expect(fn).toContain("if p_verdict <> 'ok' then");
    expect(fn).toMatch(/s\.status = 'open' and pg_catalog\.now\(\) >= s\.starts_at and pg_catalog\.now\(\) < s\.freeze_at/);
    expect(fn).toContain('arena_private.owns_adventurer_pass(p_user_id)');
    expect(fn).toContain('email_confirmed_at is not null');
    expect(fn).toContain('disqualified');
    expect(fn).toContain('where pe.score < excluded.score');
    expect(m6).toContain("check (profession in ('mining', 'woodcutting', 'gardening'))");
    expect(m6).toContain('SEASON_NOT_OPEN');
    expect(m6).toMatch(/create trigger season_profession_freeze_guard\s+before insert or update on public\.season_profession_entries/);
  });

  it('the public profession view exposes season, profession, rank, username, level, score and hides flagged / disqualified players', () => {
    const view = m6.slice(m6.indexOf('create or replace view public.season_profession_leaderboard'), m6.indexOf('revoke all on table public.season_profession_leaderboard'));
    expect(view).toContain('with (security_invoker = false)');
    const selectList = view.slice(view.indexOf('select') + 6, view.indexOf('from public.season_profession_entries'));
    const names = selectList
      .split('\n')
      .map((l) => l.trim().replace(/,$/, ''))
      .filter(Boolean)
      .map((l) => / as (\w+)$/.exec(l)?.[1] ?? l.replace(/^\w+\./, ''));
    expect(names).toEqual(['season', 'profession', 'rank', 'username', 'level', 'score']);
    expect(names).not.toContain('user_id');
    expect(view).toContain('se.disqualified = false and pg_catalog.cardinality(se.flags) = 0');
    expect(view).toMatch(/partition by e\.season, e\.profession order by e\.score desc, e\.tiebreak_at asc/);
  });

  it('there is a rollback, an owner-controls block and an SQL test plan', () => {
    expect(m6).toContain('-- ROLLBACK');
    expect(m6).toContain('-- SQL TEST PLAN');
    expect(m6).toContain('-- OWNER CONTROLS');
  });
});

// ---- migration 0008: the public meter answers a progress fraction only -----------------------------------------------------------------------------------------------------------

describe('migration 0008 (static checks): pass_meter() returns progress only', () => {
  const m8 = sql('0008_meter_progress_only.sql');
  const code = m8.split('\n').filter((l) => !l.startsWith('--')).join('\n');
  const start = code.indexOf('create function public.pass_meter()');
  const fn = code.slice(start, code.indexOf('$$;', code.indexOf('as $$', start)) + 3);

  it('drops the old function and recreates it with exactly progress, season_open, starts_at, ends_at, updated_at (no sold, no target)', () => {
    expect(start).toBeGreaterThan(-1);
    expect(code).toContain('drop function if exists public.pass_meter();');
    const returns = /returns table \(([^)]*)\)/.exec(fn)![1];
    expect(returns.split(',').map((c) => c.trim().split(' ')[0])).toEqual(['progress', 'season_open', 'starts_at', 'ends_at', 'updated_at']);
    expect(returns).not.toMatch(/\b(sold|target|count|total)\b/);
    // the select list never returns the count or the target as a column: they only feed the fraction
    expect(fn).not.toMatch(/\bas (sold|target)\b/);
    expect(fn).toMatch(/pg_catalog\.floor\(/);
    expect(fn).toMatch(/least\(1::numeric,/);
    expect(fn).toContain('arena_private.paid_pass_count()');
    expect(fn).toContain('arena_private.season_goal');
  });

  it('keeps it a security definer with an empty search path and reveals no id, amount, e-mail or source', () => {
    expect(fn).toContain('security definer');
    expect(fn).toContain("set search_path = ''");
    expect(fn).not.toMatch(/user_id|email|provider_ref|e\.source/);
  });

  it('the grants are recreated: anon and authenticated may execute it, nobody else', () => {
    expect(code).toContain('revoke all on function public.pass_meter() from public, anon, authenticated;');
    expect(code).toContain('grant execute on function public.pass_meter() to anon, authenticated;');
    expect(code.split('\n').filter((l) => /^grant /.test(l))).toHaveLength(1);
  });

  it('anon cannot read the count or the target by any other door: the goal table and the count function stay private in every migration', () => {
    const all = ['0006_portal_meter_and_profession_ranking.sql', '0007_review_fixes.sql', '0008_meter_progress_only.sql'].map(sql).join('\n');
    const grants = all.split('\n').filter((l) => /^grant /.test(l));
    for (const line of grants) {
      if (/to (anon|public)\b/.test(line) || /to [a-z_, ]*\banon\b/.test(line)) {
        expect(line, line).not.toMatch(/season_goal|paid_pass_count|arena_private/);
      }
    }
    expect(all).toContain('revoke all on table arena_private.season_goal from public, anon, authenticated;');
    expect(all).toContain('revoke all on function arena_private.paid_pass_count() from public, anon, authenticated;');
    expect(all).not.toMatch(/grant [^;\n]*season_goal to (anon|authenticated)/);
  });

  it('documents the rollback and a test plan, and leaves the goal and its trigger alone', () => {
    expect(m8).toMatch(/ROLLBACK/);
    expect(m8).toMatch(/SQL TEST PLAN/);
    expect(m8).toMatch(/NOT APPLIED/);
    expect(code).not.toMatch(/entitlements_goal|try_open_paid_season|alter table|update arena_private/);
  });
});
