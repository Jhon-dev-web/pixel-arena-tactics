import { beforeAll, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, createDb } from './harness';
import { ADMIN, ANA, BRUNO, CARLA, seed } from './seed';

// Migration 0021 (AI operations) run for real in an in-memory Postgres (PGlite) together with 0001-0020: the flags, the log, the incidents, the report tables, the compact aggregates the AI auditor reads and the
// owner's functions. Nothing here talks to any remote service. The Edge Functions that call these RPCs are tested with fakes in supabase/functions/_shared/__tests__.
let db: PGlite;

const call = async <T = any>(uid: string | null, role: 'authenticated' | 'anon' | 'service_role', sql: string, params: unknown[] = []): Promise<T> =>
  as(db, role, uid, async () => {
    const r = await db.query<{ r: T }>(sql, params);
    return r.rows[0].r;
  });
const asAdmin = <T = any>(sql: string, params: unknown[] = []) => call<T>(ADMIN, 'authenticated', sql, params);
const asService = <T = any>(sql: string, params: unknown[] = []) => call<T>(null, 'service_role', sql, params);

beforeAll(async () => {
  db = await createDb();
  await seed(db);
  await db.query(`insert into arena_private.admins (user_id, note) values ($1, 'owner')`, [ADMIN]);
}, 180_000);

describe('the flags', () => {
  test('all four are off by default, and anon may read them (the maintenance banner shows before login)', async () => {
    for (const role of ['anon', 'authenticated', 'service_role'] as const) {
      const s = await call(role === 'anon' ? null : ANA, role, 'select public.ops_status() as r');
      expect(s).toMatchObject({ maintenance_mode: false, market_paused: false, season_scoring_paused: false, pass_sales_paused: false });
      expect(Object.keys(s).sort()).toEqual(['maintenance_mode', 'market_paused', 'pass_sales_paused', 'season_scoring_paused', 'updated_at']);
    }
  });

  test('the private tables and every write function are unreachable for a client', async () => {
    await expect(call(ADMIN, 'authenticated', 'select count(*)::int as r from arena_private.ops_flags')).rejects.toThrow(/permission denied/);
    await expect(call(null, 'anon', `select public.ops_pause('market_paused', 'watchdog', 'x') as r`)).rejects.toThrow(/permission denied/);
    await expect(call(ADMIN, 'authenticated', `select public.ops_pause('market_paused', 'watchdog', 'x') as r`)).rejects.toThrow(/permission denied/);
    await expect(call(ADMIN, 'authenticated', 'select public.ai_gather_aggregates(1) as r')).rejects.toThrow(/permission denied/);
    await expect(call(ADMIN, 'authenticated', `select public.ops_incident_open('db', 'high', 'x', '{}', '[]') as r`)).rejects.toThrow(/permission denied/);
    await expect(call(ADMIN, 'authenticated', `select public.ai_report_insert('anomaly', 'high', 'x', '{}', '[]') as r`)).rejects.toThrow(/permission denied/);
  });

  test('a normal player cannot flip a flag; the service role cannot either (only an admin session can)', async () => {
    await expect(call(ANA, 'authenticated', `select public.admin_set_ops_flag('market_paused', true, 'teste') as r`)).rejects.toThrow(/ADMIN_ONLY/);
    await expect(call(null, 'anon', `select public.admin_set_ops_flag('market_paused', true, 'teste') as r`)).rejects.toThrow(/permission denied/);
    await expect(asService(`select public.admin_set_ops_flag('market_paused', true, 'teste') as r`)).rejects.toThrow(/permission denied/);
  });

  test('the watchdog can only switch ON, once, as "watchdog"', async () => {
    expect(await asService(`select public.ops_pause('season_scoring_paused', 'watchdog', 'sem resposta') as r`)).toEqual({ flag: 'season_scoring_paused', changed: true });
    expect(await asService(`select public.ops_pause('season_scoring_paused', 'watchdog', 'sem resposta') as r`)).toEqual({ flag: 'season_scoring_paused', changed: false });
    await expect(asService(`select public.ops_pause('market_paused', 'someone', 'x') as r`)).rejects.toThrow(/OPS_BAD_ACTOR/);
    await expect(asService(`select public.ops_pause('nope', 'watchdog', 'x') as r`)).rejects.toThrow(/OPS_BAD_FLAG/);
    expect((await asService(`select public.ops_status() as r`)).season_scoring_paused).toBe(true);
    // there is no function with a "false" parameter for the service role
    const fns = await db.query<{ proname: string }>(`select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and proname like 'ops\\_%'`);
    expect(fns.rows.map((r) => r.proname)).not.toContain('ops_clear');
  });

  test('the owner clears it: a note is mandatory in both directions and every change is logged with who and why', async () => {
    await expect(asAdmin(`select public.admin_set_ops_flag('season_scoring_paused', false, '') as r`)).rejects.toThrow(/OPS_NOTE_REQUIRED/);
    await expect(asAdmin(`select public.admin_set_ops_flag('season_scoring_paused', false, null) as r`)).rejects.toThrow(/OPS_NOTE_REQUIRED/);
    await expect(asAdmin(`select public.admin_set_ops_flag('nope', false, 'abc') as r`)).rejects.toThrow(/OPS_BAD_FLAG/);
    expect(await asAdmin(`select public.admin_set_ops_flag('season_scoring_paused', false, 'banco voltou ao normal') as r`)).toEqual({ flag: 'season_scoring_paused', value: false, changed: true });
    expect(await asAdmin(`select public.admin_set_ops_flag('season_scoring_paused', false, 'de novo') as r`)).toMatchObject({ changed: false });
    expect(await asAdmin(`select public.admin_set_ops_flag('market_paused', true, 'manutencao do mercado') as r`)).toMatchObject({ changed: true });
    const ov = await asAdmin(`select public.admin_ops_overview() as r`);
    const flag = ov.flags.find((f: any) => f.key === 'market_paused');
    expect(flag).toMatchObject({ value: true, changed_by: `admin:${ADMIN}`, note: 'manutencao do mercado' });
    const changes = ov.recent_events.filter((e: any) => e.kind === 'flag_change');
    expect(changes.map((e: any) => e.actor)).toContain('watchdog');
    expect(changes.map((e: any) => e.actor)).toContain(`admin:${ADMIN}`);
    await asAdmin(`select public.admin_set_ops_flag('market_paused', false, 'reaberto') as r`);
    expect((await asService(`select public.ops_status() as r`)).market_paused).toBe(false);
  });
});

describe('checks, incidents and the 5xx counters', () => {
  test('streaks count in a row and an event is written only on a change', async () => {
    const fail = `[{"check":"db","ok":false,"detail":{"ms":9000}}]`;
    const a = await asService(`select public.ops_checks_record($1::jsonb) as r`, [fail]);
    expect(a.db).toMatchObject({ consecutive_failures: 1, was_failing: false });
    const b = await asService(`select public.ops_checks_record($1::jsonb) as r`, [fail]);
    expect(b.db).toMatchObject({ consecutive_failures: 2, was_failing: true });
    const c = await asService(`select public.ops_checks_record($1::jsonb) as r`, [`[{"check":"db","ok":true,"detail":{}}]`]);
    expect(c.db).toMatchObject({ consecutive_failures: 0, was_failing: true });
    const ev = await db.query<{ n: number }>(`select count(*)::int as n from arena_private.ops_events where kind = 'health_check' and check_name = 'db'`);
    expect(ev.rows[0].n).toBe(2); // went down, came back: the second failing run wrote nothing
    await expect(asService(`select public.ops_checks_record('[{"check":"Bad Name","ok":true}]') as r`)).rejects.toThrow(/OPS_BAD_CHECK/);
  });

  test('one open incident per check: is_new once, the alert is recorded, and resolving closes it', async () => {
    const first = await asService(`select public.ops_incident_open('market_path', 'high', 'mercado falhando', '{"errors":9}', '[{"flag":"market_paused","changed":true}]') as r`);
    expect(first.is_new).toBe(true);
    const again = await asService(`select public.ops_incident_open('market_path', 'high', 'mercado ainda falhando', '{"errors":12}', '[]') as r`);
    expect(again.is_new).toBe(false);
    expect(again.incident_id).toBe(first.incident_id);
    await asService(`select public.ops_incident_alerted($1::uuid) as r`, [first.incident_id]);
    const ov = await asAdmin(`select public.admin_ops_overview() as r`);
    const inc = ov.incidents.find((i: any) => i.id === first.incident_id);
    expect(inc).toMatchObject({ check: 'market_path', alert_count: 1, summary: 'mercado ainda falhando' });
    expect(inc.actions).toEqual([{ flag: 'market_paused', changed: true }]); // an empty update does not wipe what was done
    expect(await asService(`select public.ops_incident_resolve('market_path') as r`)).toMatchObject({ resolved: true });
    expect(await asService(`select public.ops_incident_resolve('market_path') as r`)).toMatchObject({ resolved: false });
    const next = await asService(`select public.ops_incident_open('market_path', 'high', 'outra vez', '{}', '[]') as r`);
    expect(next.is_new).toBe(true);
    expect(next.incident_id).not.toBe(first.incident_id);
    await asService(`select public.ops_incident_resolve('market_path') as r`);
  });

  test('the 5xx counter, the health counts and the probe', async () => {
    await db.exec(`select public.ops_function_error('market-buy'), public.ops_function_error('market-buy'), public.ops_function_error('create-checkout')`);
    const counts = await asService(`select public.ops_health_counts(10) as r`);
    expect(counts.function_errors).toEqual({ 'market-buy': 2, 'create-checkout': 1 });
    expect(counts.league_open).toBe(true);
    expect(counts.payments).toMatchObject({ unprocessed: 0, errors: 0 });
    await expect(asService(`select public.ops_function_error('Bad Name!') as r`)).rejects.toThrow(/OPS_BAD_FUNCTION/);
    expect(await asService(`select public.ops_health_probe() is not null as r`)).toBe(true);
    await db.query(`insert into public.payment_events (provider, event_id, received_at, result) values ('stripe', 'evt_old', now() - interval '30 minutes', null), ('stripe', 'evt_err', now() - interval '1 minute', 'error:boom')`);
    const after = await asService(`select public.ops_health_counts(10) as r`);
    expect(after.payments).toMatchObject({ unprocessed: 1, errors: 1 });
    expect(after.payments.oldest_unprocessed_seconds).toBeGreaterThan(1700);
  });

  test('pruning keeps the recent rows', async () => {
    const r = await asService(`select public.ops_prune(90) as r`);
    expect(r.events).toBe(0);
    await db.exec(`update arena_private.ops_events set created_at = now() - interval '200 days' where kind = 'health_check'`);
    expect((await asService(`select public.ops_prune(90) as r`)).events).toBeGreaterThan(0);
  });
});

describe('the aggregates for the AI auditor', () => {
  beforeAll(async () => {
    // two accepted snapshots with a 12-level jump
    await db.query(
      `insert into public.progress_snapshots (user_id, metrics, metrics_hash, verdict, reasons, created_at) values
       ($1, '{"levelTotal": 20, "xp": 1000}'::jsonb, repeat('d', 64), 'ok', '{}', now() - interval '50 minutes'),
       ($1, '{"levelTotal": 32, "xp": 90000}'::jsonb, repeat('e', 64), 'ok', '{}', now() - interval '5 minutes')`,
      [BRUNO],
    );
    // market: five old sales of one template around 1 SOL (the median), one 10x outlier now, and a wash pattern Carla <-> Bruno (3 sales one way, 1 back) in the last hours
    let n = 100;
    const sale = (seller: string, buyer: string, thing: string, lamports: number, ago: string) => {
      n++;
      const hex = String(n).padStart(12, '0');
      return db.query(
        `insert into public.market_sales (listing_id, reservation_id, certificate_id, new_certificate_id, seller_id, buyer_id, seller_address, buyer_address, fee_address, item_kind, item_template, price_lamports, fee_lamports, seller_lamports, tx_signature, chain_id, livemode, sold_at)
         values ($1, $2, $3, $4, $5, $6, 'CarlaWa11et11111111111111111111111111', 'BrunoWa11et11111111111111111111111111', 'QwnerWa11et111111111111111111111111111', 'gear', $7, $8, $9, $10, $11, 101, true, now() - $12::interval)`,
        [`60000000-0000-4000-8000-${hex}`, `61000000-0000-4000-8000-${hex}`, `62000000-0000-4000-8000-${hex}`, `63000000-0000-4000-8000-${hex}`, seller, buyer, thing, lamports, Math.floor(lamports * 0.05), lamports - Math.floor(lamports * 0.05), 'Sg' + String(n).replace(/0/g, 'A').padEnd(86, 'y'), ago],
      );
    };
    for (let i = 0; i < 5; i++) await sale(CARLA, BRUNO, 'steel_plate', 1_000_000_000, `${10 + i} days`);
    await sale(CARLA, BRUNO, 'steel_plate', 10_000_000_000, '20 minutes'); // 10x the median
    await sale(CARLA, BRUNO, 'bronze_helm', 1_000_000_000, '3 hours');
    await sale(CARLA, BRUNO, 'bronze_helm', 1_000_000_000, '2 hours');
    await sale(BRUNO, CARLA, 'bronze_helm', 1_000_000_000, '50 minutes');
  });

  test('has the eight top-level keys, caps and no e-mail anywhere', async () => {
    for (const hours of [1, 24, 168]) {
      const agg = await asService(`select public.ai_gather_aggregates($1) as r`, [hours]);
      expect(Object.keys(agg).sort()).toEqual(['anticheat', 'errors', 'generated_at', 'legendary', 'level_jumps', 'market', 'payments', 'referrals', 'since', 'window_hours']);
      expect(JSON.stringify(agg)).not.toMatch(/@/);
      expect(JSON.stringify(agg).length).toBeLessThan(20_000);
    }
  });

  test('anti-cheat: new flags with their reason codes and usernames', async () => {
    const agg = await asService(`select public.ai_gather_aggregates(24) as r`);
    expect(agg.anticheat.flagged_snapshots).toBe(1);
    expect(agg.anticheat.reason_counts.map((r: any) => r.reason).sort()).toEqual(['GOLD_JUMP', 'PACE_TOO_FAST']);
    expect(agg.anticheat.accounts[0]).toMatchObject({ user_id: ANA, username: 'AnaSilva', flagged: 1, rejected: 0 });
    expect(agg.anticheat.item_flags[0]).toMatchObject({ code: 'HUNT_TIME_EXCESS', count: 1 });
    expect(Object.keys(agg.anticheat.accounts[0]).sort()).toEqual(['flagged', 'reasons', 'rejected', 'user_id', 'username']);
  });

  test('level jumps: first and last accepted snapshot in the window', async () => {
    const agg = await asService(`select public.ai_gather_aggregates(1) as r`);
    expect(agg.level_jumps.top[0]).toMatchObject({ user_id: BRUNO, username: 'Bruno', snapshots: 3, level_from: 20, level_to: 32, xp_from: 1000, xp_to: 90000 });
    expect(agg.level_jumps.top[0].minutes_between).toBeCloseTo(45, 0);
  });

  test('market: price outlier against the 30-day median, the wash pattern and the heavy buyer; legendary issuance is counted without market copies', async () => {
    const agg = await asService(`select public.ai_gather_aggregates(1) as r`);
    expect(agg.market.sales_in_window).toBe(2); // the outlier (20 min) and the return sale (50 min)
    expect(agg.market.outliers).toHaveLength(1);
    expect(agg.market.outliers[0]).toMatchObject({ thing: 'steel_plate', seller_username: 'Carla', buyer_username: 'Bruno', ratio_to_median: 10, median_samples: 5 });
    expect(agg.market.pair_lookback_hours).toBe(24);
    // seller -> buyer pairs over the last 24 h: Carla -> Bruno has 3 (outlier + 2 helms) and Bruno -> Carla 1 back (reciprocal)
    expect(agg.market.pairs[0]).toMatchObject({ seller_username: 'Carla', buyer_username: 'Bruno', sales: 3, reciprocal: true });
    const wide = await asService(`select public.ai_gather_aggregates(72) as r`);
    expect(wide.market.sales_in_window).toBeGreaterThanOrEqual(5); // + the seed's live sale of 2 days ago
    expect(wide.legendary.issued_in_window).toBeGreaterThanOrEqual(1);
    expect(wide.legendary.by_source.length).toBeGreaterThan(0);
  });

  test('referrals: hashed prefixes only, never an address', async () => {
    await db.query(`update public.waitlist set ip_hash = repeat('f', 64), created_at = now() - interval '2 hours'`);
    const agg = await asService(`select public.ai_gather_aggregates(24) as r`);
    expect(agg.referrals.signups).toBe(3);
    expect(agg.referrals.ip_clusters).toEqual([{ ip_prefix: 'ffffffff', signups: 3 }]);
  });

  test('payments and errors sections', async () => {
    const agg = await asService(`select public.ai_gather_aggregates(24) as r`);
    expect(agg.payments).toMatchObject({ refunded: expect.any(Number), revoked_disputes: expect.any(Number), event_errors: 1 });
    expect(agg.errors.by_function.map((f: any) => f.function).sort()).toEqual(['create-checkout', 'market-buy']);
  });
});

describe('reports, runs and the cost line', () => {
  test('reports are listed most severe first, acknowledged by an admin only, and fingerprints are de-duplicated', async () => {
    const low = await asService(`select public.ai_report_insert('daily', 'low', 'tudo calmo', '{"fingerprint":"aaa"}', '[]') as r`);
    const high = await asService(`select public.ai_report_insert('anomaly', 'high', 'preco estranho', '{"fingerprint":"bbb","alerted":true}', '[{"action":"watch"}]') as r`);
    const list = await asAdmin(`select public.admin_ai_reports('open', 0, 20) as r`);
    expect(list.rows.map((r: any) => r.id)).toEqual([high, low]);
    expect(list.total).toBe(2);
    await expect(call(ANA, 'authenticated', `select public.admin_ai_reports('open', 0, 20) as r`)).rejects.toThrow(/ADMIN_ONLY/);
    await expect(call(ANA, 'authenticated', `select public.admin_ack_report($1::uuid) as r`, [high])).rejects.toThrow(/ADMIN_ONLY/);
    await expect(asAdmin(`select public.admin_ai_reports('nope', 0, 20) as r`)).rejects.toThrow(/ADMIN_BAD_STATUS/);
    expect(await asAdmin(`select public.admin_ack_report($1::uuid) as r`, [high])).toEqual({ id: high, acknowledged: true });
    expect(await asAdmin(`select public.admin_ack_report($1::uuid) as r`, [high])).toEqual({ id: high, acknowledged: false });
    expect((await asAdmin(`select public.admin_ai_reports('open', 0, 20) as r`)).rows.map((r: any) => r.id)).toEqual([low]);
    expect((await asAdmin(`select public.admin_ai_reports('acknowledged', 0, 20) as r`)).rows[0]).toMatchObject({ id: high, acknowledged_by: ADMIN });
    expect(await asService(`select public.ai_recent_fingerprints(24) as r`)).toEqual(['bbb']); // only the one that was alerted counts
  });

  test('runs feed the budget and the monthly cost', async () => {
    await asService(`select public.ai_run_log('hourly', 'claude-haiku-5-5', 'ok', 3000, 1200, 0.0009, null, 'teste') as r`);
    await asService(`select public.ai_run_log('daily', 'claude-opus-5-5', 'ok', 9000, 4000, 0.116, null, null) as r`);
    await asService(`select public.ai_run_log('hourly', null, 'skipped_no_signals', 0, 0, 0, null, 'nada a analisar') as r`);
    const budget = await asService(`select public.ai_budget() as r`);
    expect(budget.runs_today).toBe(2); // the skipped one is not a model call
    expect(Number(budget.month_cost_usd)).toBeCloseTo(0.1169, 4);
    const cost = await asAdmin(`select public.admin_ai_cost() as r`);
    expect(Number(cost.month_to_date_usd)).toBeCloseTo(0.1169, 4);
    expect(Number(cost.projected_month_usd)).toBeGreaterThanOrEqual(Number(cost.month_to_date_usd));
    expect(cost.runs_today).toBe(2);
    expect(cost.by_model.map((m: any) => m.model).sort()).toEqual(['(sem modelo)', 'claude-haiku-5-5', 'claude-opus-5-5']);
    await expect(call(ANA, 'authenticated', 'select public.admin_ai_cost() as r')).rejects.toThrow(/ADMIN_ONLY/);
  });

  test('the owner functions are denied to anon and the read ones write nothing', async () => {
    for (const fn of ['public.admin_ops_overview()', `public.admin_ai_reports('open', 0, 10)`, 'public.admin_ai_cost()']) {
      await expect(call(null, 'anon', `select ${fn} as r`)).rejects.toThrow(/permission denied/);
      await as(db, 'authenticated', ADMIN, async () => {
        await db.exec('begin transaction read only');
        try {
          expect((await db.query(`select ${fn} as r`)).rows.length).toBe(1);
        } finally {
          await db.exec('rollback');
        }
      });
    }
  });

  test('Carla (a normal player) sees none of it', async () => {
    await expect(call(CARLA, 'authenticated', 'select public.admin_ops_overview() as r')).rejects.toThrow(/ADMIN_ONLY/);
  });
});
