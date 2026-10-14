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

  it('reads the accepted history (not rejected) and rebuilds the peak; errors carry only the status', async () => {
    const row = { id: 's1', created_at: '2026-10-05T00:00:00Z', save_revision: 4, verdict: 'ok', reasons: [], metrics: { ...metrics, _peak: { ...peakOf(metrics), xp: 9000 } } };
    const { calls, fetchFn } = fakeFetch((url) => (url.includes('/progress_snapshots?') ? new Response(JSON.stringify([row]), { status: 200 }) : new Response('secret body', { status: 500 })));
    const store = createProgressStore({ supabaseUrl: 'https://p.test', serviceRoleKey: SERVICE_KEY, fetchFn });
    const h = await store.acceptedHistory(USER);
    expect(h.first?.peak.xp).toBe(9000);
    expect(h.first?.atMs).toBe(Date.parse('2026-10-05T00:00:00Z'));
    expect(h.first?.metrics).not.toHaveProperty('_peak');
    expect(calls.every((c) => c.url.includes('verdict=neq.rejected') && c.url.includes(`user_id=eq.${USER}`))).toBe(true);
    await expect(store.hasActivePass(USER)).rejects.toThrow('entitlement_read_500');
    await expect(store.hasActivePass(USER)).rejects.not.toThrow(/secret/);
  });
});
