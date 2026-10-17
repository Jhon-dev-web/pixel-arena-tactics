import { beforeAll, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, createDb } from './harness';
import { ADMIN, ANA, seed } from './seed';

// The REAL migrations 0001-0020 run in an in-memory Postgres (PGlite); the admin functions are called the way the app calls them,
// as a signed-in role with a JWT subject. This is the proof that the SQL parses, the joins resolve and the numbers add up.
let db: PGlite;

const call = async <T = any>(uid: string | null, role: 'authenticated' | 'anon', sql: string, params: unknown[] = []): Promise<T> =>
  as(db, role, uid, async () => {
    const r = await db.query<{ r: T }>(sql, params);
    return r.rows[0].r;
  });
const asAdmin = <T = any>(sql: string, params: unknown[] = []) => call<T>(ADMIN, 'authenticated', sql, params);

beforeAll(async () => {
  db = await createDb();
  await seed(db);
  await db.query(`insert into arena_private.admins (user_id, note) values ($1, 'owner')`, [ADMIN]);
}, 180_000);

describe('who may call', () => {
  const calls = [
    'public.admin_overview()',
    'public.admin_players()',
    `public.admin_player_detail('${ANA}')`,
    'public.admin_legendaries()',
    'public.admin_market()',
    'public.admin_economy()',
    'public.admin_economy_series(7)',
    'public.admin_flags()',
    'public.admin_league()',
    'public.admin_waitlist(7)',
  ];

  test('is_admin: false for a player, true for the owner, nothing for anon', async () => {
    expect(await call(ANA, 'authenticated', 'select public.is_admin() as r')).toBe(false);
    expect(await call(ADMIN, 'authenticated', 'select public.is_admin() as r')).toBe(true);
    await expect(call(null, 'anon', 'select public.is_admin() as r')).rejects.toThrow(/permission denied/);
  });

  test.each(calls)('%s raises ADMIN_ONLY for a normal player and is denied to anon', async (fn) => {
    await expect(call(ANA, 'authenticated', `select ${fn} as r`)).rejects.toThrow(/ADMIN_ONLY/);
    await expect(call(null, 'anon', `select ${fn} as r`)).rejects.toThrow(/permission denied/);
  });

  test('the admin list and the maintenance functions are unreachable for a client', async () => {
    await expect(call(ADMIN, 'authenticated', 'select count(*)::int as r from arena_private.admins')).rejects.toThrow(/permission denied/);
    await expect(call(ADMIN, 'authenticated', 'select arena_private.admin_refresh_aggregates() as r')).rejects.toThrow(/permission denied/);
    await expect(call(ADMIN, 'authenticated', 'select arena_private.admin_refresh_daily() as r')).rejects.toThrow(/permission denied/);
  });

  test.each(calls)('%s runs inside a READ ONLY transaction (it writes nothing)', async (fn) => {
    await as(db, 'authenticated', ADMIN, async () => {
      await db.exec('begin transaction read only');
      try {
        const r = await db.query(`select ${fn} as r`);
        expect(r.rows.length).toBe(1);
      } finally {
        await db.exec('rollback');
      }
    });
  });
});

describe('maintenance (runs as the owner)', () => {
  test('refresh builds the player cache, the daily rows and the gold aggregate', async () => {
    const daily = await db.query<{ n: number }>('select arena_private.admin_refresh_daily(30) as n');
    expect(daily.rows[0].n).toBe(30);
    const agg = await db.query<{ r: any }>('select arena_private.admin_refresh_aggregates(true) as r');
    expect(agg.rows[0].r.rebuilt).toBe(5);
    const gold = await db.query<any>('select * from arena_private.admin_gold_daily');
    expect(gold.rows).toHaveLength(1);
    expect(Number(gold.rows[0].gold_total)).toBe(1200000 + 50000 + 8000 + 300 + 77000);
    expect(gold.rows[0].accounts).toBe(5);
    expect(Number(gold.rows[0].gold_max)).toBe(1200000);
    expect(Number(gold.rows[0].pouch_gold)).toBe(5000);
    // a second, incremental run touches nothing that did not change
    const again = await db.query<{ r: any }>('select arena_private.admin_refresh_aggregates() as r');
    expect(again.rows[0].r.rebuilt).toBeLessThanOrEqual(1); // only Ana, saved inside the 2-minute safety overlap
  });
});

describe('overview', () => {
  test('players block', async () => {
    const o = await asAdmin('select public.admin_overview() as r');
    expect(o.players.registered).toBe(7);
    expect(o.players.characters).toBe(5);
    expect(o.players.online_now).toBe(1); // only Ana saved within 5 minutes
    expect(o.players.active_today).toBeGreaterThanOrEqual(2);
    expect(o.players.active_7d).toBe(4);
    expect(o.players.active_30d).toBe(4);
    expect(o.players.signups_today).toBeGreaterThanOrEqual(1);
    expect(o.players.with_username).toBe(5);
  });

  test('pass block: owners by source, live vs test, revenue inputs', async () => {
    const o = await asAdmin('select public.admin_overview() as r');
    expect(o.pass.owners_active).toBe(4);
    expect(o.pass.card_sold_live).toBe(1);
    expect(o.pass.card_sold_test).toBe(1);
    expect(o.pass.card_refunded_live).toBe(1);
    expect(Number(o.pass.card_price_usd)).toBe(10);
    expect(Number(o.pass.usdc_live)).toBe(10);
    expect(Number(o.pass.usdc_test)).toBe(10);
    expect(Number(o.pass.usdc_to_refund)).toBe(10);
    const sources = new Set(o.pass.by_source.map((s: any) => s.source));
    expect(sources).toEqual(new Set(['stripe', 'crypto_sol', 'referral']));
  });

  test('market and "collected in Solana": live only', async () => {
    const o = await asAdmin('select public.admin_overview() as r');
    expect(o.market.live.sales).toBe(1);
    expect(Number(o.market.live.volume_lamports)).toBe(1_000_000_000);
    expect(Number(o.market.live.fee_lamports)).toBe(50_000_000);
    expect(o.market.live.buyers).toBe(1);
    expect(o.market.live.sellers).toBe(1);
    expect(o.market.test.sales).toBe(1);
    expect(o.market.listings_open).toBe(1);
    expect(Number(o.collected.fees_lamports)).toBe(50_000_000);
    expect(Number(o.collected.usdc)).toBe(10);
  });

  test('items, pouches, materials, league and waitlist', async () => {
    const o = await asAdmin('select public.admin_overview() as r');
    const leg = o.items.filter((i: any) => i.kind === 'gear' && i.rarity === 'legendary').reduce((s: number, i: any) => s + i.count, 0);
    expect(leg).toBe(3);
    expect(o.pouches.outstanding).toBe(1);
    expect(Number(o.pouches.outstanding_gold)).toBe(5000);
    expect(o.pouches.opened).toBe(1);
    const iron = o.materials.find((m: any) => m.material_id === 'iron_ore');
    expect(Number(iron.qty)).toBe(150);
    expect(o.league.season.number).toBe(1);
    expect(o.league.entries).toBe(3);
    expect(o.league.players_with_open_flags).toBe(1); // Ana (Carla's flag was cleared)
    expect(o.league.players_with_item_flags).toBe(1);
    expect(o.waitlist.total).toBe(3);
    expect(o.waitlist.referred).toBe(2);
    expect(o.waitlist.qualified).toBe(1);
    expect(Number(o.freshness.gold_total)).toBe(1335300);
  });
});

describe('players', () => {
  test('lists with masked e-mails, sorted by gold', async () => {
    const r = await asAdmin(`select public.admin_players(null, 'gold', 'desc', 0, 25) as r`);
    expect(r.total).toBe(7);
    expect(r.rows[0].username).toBe('AnaSilva');
    expect(r.rows[0].email_masked).toBe('an***@example.com');
    expect(JSON.stringify(r)).not.toContain('ana.silva@example.com');
    expect(r.rows[0].online).toBe(true);
    expect(r.rows[0].hero_level).toBe(100);
    expect(r.rows[0].paragon_level).toBe(15);
    expect(r.rows[0].pass_source).toBe('stripe');
    expect(r.rows[0].open_flags).toBe(1);
    expect(r.rows[0].wallet).toMatch(/^AnaWa11et/);
    expect(Number(r.rows[0].items_held)).toBe(1);
  });

  test('search, filters and paging', async () => {
    const byName = await asAdmin(`select public.admin_players('ana') as r`);
    expect(byName.total).toBe(1);
    const byMail = await asAdmin(`select public.admin_players('bruno@') as r`);
    expect(byMail.rows[0].username).toBe('Bruno');
    const online = await asAdmin(`select public.admin_players(null, 'last_seen', 'desc', 0, 50, '{"online": true}') as r`);
    expect(online.rows.map((x: any) => x.username)).toEqual(['AnaSilva']);
    const noPass = await asAdmin(`select public.admin_players(null, 'username', 'asc', 0, 50, '{"pass": "no"}') as r`);
    expect(noPass.rows.map((x: any) => x.username).filter(Boolean)).toEqual(['Diego']);
    const flagged = await asAdmin(`select public.admin_players(null, 'created', 'desc', 0, 50, '{"flagged": true}') as r`);
    expect(new Set(flagged.rows.map((x: any) => x.username))).toEqual(new Set(['AnaSilva', 'Bruno']));
    const page2 = await asAdmin(`select public.admin_players(null, 'created', 'asc', 1, 3) as r`);
    expect(page2.rows).toHaveLength(3);
    expect(page2.total).toBe(7);
    await expect(asAdmin(`select public.admin_players(null, 'password', 'asc') as r`)).rejects.toThrow(/ADMIN_BAD_SORT/);
  });

  test('a wildcard in the search is literal', async () => {
    const r = await asAdmin(`select public.admin_players('%') as r`);
    expect(r.total).toBe(0);
  });

  test('detail returns the full e-mail and the history', async () => {
    const d = await asAdmin(`select public.admin_player_detail('${ANA}') as r`);
    expect(d.account.email).toBe('ana.silva@example.com');
    expect(d.entitlements[0].source).toBe('stripe');
    expect(d.open_flags[0].reasons).toEqual(expect.arrayContaining(['PACE_TOO_FAST']));
    expect(d.snapshots.length).toBe(2);
    expect(d.wallet.address).toMatch(/^AnaWa11et/);
    expect(d.stats.hero_level).toBe(100);
    const none = await asAdmin(`select public.admin_player_detail('00000000-0000-4000-8000-00000000ffff') as r`);
    expect(none).toBeNull();
  });
});

describe('legendaries', () => {
  test('every issue with source, status and the current owner', async () => {
    const r = await asAdmin(`select public.admin_legendaries(null, 0, 50) as r`);
    // Ana pity + Carla forge (sold) + Carla seal + Eloa hunt unique + Eloa boss unique; the bought copy is not a new issue.
    expect(r.total).toBe(5);
    const by = Object.fromEntries(r.rows.map((x: any) => [x.source + ':' + x.kind, x]));
    expect(by['pity:gear'].username).toBe('AnaSilva');
    expect(by['pity:gear'].status).toBe('held');
    expect(by['forge:gear'].username).toBe('Carla');
    expect(by['forge:gear'].status).toBe('sold');
    expect(by['forge:gear'].current_owner_username).toBe('Bruno'); // the end of the chain
    expect(by['forge:gear'].current_status).toBe('listed');
    expect(by['seal:gear'].status).toBe('bound');
    expect(by['drop:unique'].status).toBe('bound');
    expect(by['boss:unique'].status).toBe('burned');
    expect(by['pity:gear'].tier).toBe(4);
    expect(by['pity:gear'].slot).toBe('weapon');
    expect(r.summary.by_source).toEqual({ pity: 1, forge: 1, seal: 1, drop: 1, boss: 1 });
  });

  test('filters', async () => {
    const pity = await asAdmin(`select public.admin_legendaries(null, 0, 50, '{"source":"pity"}') as r`);
    expect(pity.total).toBe(1);
    const uniques = await asAdmin(`select public.admin_legendaries(null, 0, 50, '{"kind":"unique"}') as r`);
    expect(uniques.total).toBe(2);
    const sold = await asAdmin(`select public.admin_legendaries(null, 0, 50, '{"status":"sold"}') as r`);
    expect(sold.total).toBe(1);
    const byOwner = await asAdmin(`select public.admin_legendaries('eloa') as r`);
    expect(byOwner.total).toBe(2);
    const dated = await asAdmin(`select public.admin_legendaries(null, 0, 50, jsonb_build_object('from', (now() + interval '1 day')::text)) as r`);
    expect(dated.total).toBe(0);
  });
});

describe('market', () => {
  test('sales with prices, fee and signature; live/test filter; totals', async () => {
    const all = await asAdmin(`select public.admin_market('sales') as r`);
    expect(all.total).toBe(2);
    const live = await asAdmin(`select public.admin_market('sales', null, 0, 50, '{"mode":"live"}') as r`);
    expect(live.total).toBe(1);
    expect(live.rows[0].seller_username).toBe('Carla');
    expect(live.rows[0].buyer_username).toBe('Bruno');
    expect(Number(live.rows[0].fee_lamports)).toBe(50_000_000);
    expect(live.rows[0].tx_signature).toMatch(/^Sg/);
    expect(Number(live.totals.volume_lamports)).toBe(1_000_000_000);
    const bySig = await asAdmin(`select public.admin_market('sales', $1) as r`, [live.rows[0].tx_signature]);
    expect(bySig.total).toBe(1);
  });

  test('listings', async () => {
    const l = await asAdmin(`select public.admin_market('listings', null, 0, 50, '{"status":"open"}') as r`);
    expect(l.total).toBe(1);
    expect(l.rows[0].seller_username).toBe('Bruno');
    expect(Number(l.rows[0].price_lamports)).toBe(2_000_000_000);
    expect(l.rows[0].rarity).toBe('legendary');
    await expect(asAdmin(`select public.admin_market('wallets') as r`)).rejects.toThrow(/ADMIN_BAD_VIEW/);
  });
});

describe('economy, series, flags, league, waitlist', () => {
  test('economy: gold from the aggregate, pouches, materials, items', async () => {
    const e = await asAdmin('select public.admin_economy() as r');
    expect(Number(e.gold_latest.gold_total)).toBe(1335300);
    expect(e.gold_series).toHaveLength(1);
    expect(e.gold_top[0].username).toBe('AnaSilva');
    expect(e.pouches.outstanding).toBe(1);
    expect(Number(e.pouches.minted_gold)).toBe(7000);
    expect(e.pouches_by_id[0].pouch_id).toBe('gold_pouch_m');
    expect(Number(e.materials.find((m: any) => m.material_id === 'oak_log').qty)).toBe(10);
    expect(Number(e.saves_items.legendary)).toBeGreaterThanOrEqual(1);
    expect(Number(e.sol.volume_total_lamports)).toBe(1_000_000_000);
  });

  test('series: one object per day, oldest first, with the day of the sale and the Pass', async () => {
    const s = await asAdmin('select public.admin_economy_series(7) as r');
    expect(s).toHaveLength(7);
    expect(s[0].day < s[6].day).toBe(true);
    const sum = (k: string) => s.reduce((a: number, d: any) => a + Number(d[k]), 0);
    expect(sum('sales')).toBe(1); // live only
    expect(sum('pass_stripe')).toBe(2); // Ana's and the refunded one (granted now); the test one is counted apart
    expect(sum('pass_usdc')).toBe(1);
    expect(sum('pass_test')).toBe(1);
    expect(sum('pass_referral')).toBe(1);
    expect(sum('legendaries')).toBe(3); // Ana, Carla, Carla's Seal
    expect(sum('uniques')).toBe(2);
    expect(sum('pouches_minted')).toBe(2);
    expect(sum('pouches_opened')).toBe(1);
    expect(sum('pass_revenue_usd')).toBe(2 * 10 + 10);
    expect(s[6].active_players).toBeGreaterThan(0);
    const big = await asAdmin('select public.admin_economy_series(100000) as r');
    expect(big).toHaveLength(365);
  });

  test('flags: the open queue, reasons per code, filters', async () => {
    const f = await asAdmin('select public.admin_flags() as r');
    expect(f.total).toBe(2); // Ana (progress) and Bruno (item flag); Carla's was cleared
    const ana = f.rows.find((x: any) => x.username === 'AnaSilva');
    expect(ana.reasons).toEqual(['GOLD_JUMP', 'PACE_TOO_FAST']);
    expect(ana.flagged_snapshots).toBe(1);
    const bruno = f.rows.find((x: any) => x.username === 'Bruno');
    expect(bruno.item_codes).toEqual(['HUNT_TIME_EXCESS']);
    expect(f.reasons.find((x: any) => x.code === 'GOLD_JUMP').players).toBe(1);
    const items = await asAdmin(`select public.admin_flags(0, 50, '{"kind":"items"}') as r`);
    expect(items.total).toBe(1);
    const search = await asAdmin(`select public.admin_flags(0, 50, '{"search":"ana"}') as r`);
    expect(search.total).toBe(1);
  });

  test('league: status, goal, counts and the top with eligibility', async () => {
    const l = await asAdmin('select public.admin_league() as r');
    expect(l.season.number).toBe(1);
    expect(l.season.status).toBe('open');
    expect(l.goal.target).toBe(15000);
    expect(Number(l.goal.paid)).toBeGreaterThanOrEqual(1);
    expect(l.counts.entries).toBe(3);
    expect(l.top[0].username).toBe('AnaSilva');
    expect(l.top[0].level_total).toBe(115);
    expect(l.top[0].paragon_level).toBe(15);
    expect(l.top[0].highest_floor).toBe(100);
    expect(l.top[0].eligible).toBe(false); // flagged
    const bruno = l.top.find((x: any) => x.username === 'Bruno');
    expect(bruno.has_pass).toBe(true);
    expect(bruno.eligible).toBe(true);
    const eloa = l.top.find((x: any) => x.username === 'Eloa');
    expect(eloa.has_pass).toBe(true);
    expect(l.seasons.length).toBeGreaterThan(5);
  });

  test('waitlist: totals, by day, by source, top referrers (masked)', async () => {
    const w = await asAdmin('select public.admin_waitlist(30) as r');
    expect(w.totals.total).toBe(3);
    expect(w.totals.referred).toBe(2);
    expect(w.totals.registered_in_game).toBe(1); // bruno@example.com has a game account
    expect(w.by_day).toHaveLength(30);
    expect(w.by_day.reduce((a: number, d: any) => a + d.count, 0)).toBe(3);
    expect(w.by_source.find((s: any) => s.source === 'tiktok').count).toBe(2);
    expect(w.by_source.find((s: any) => s.source === '(direto)').count).toBe(1);
    expect(w.top_referrers[0].invited).toBe(2);
    expect(w.top_referrers[0].qualified).toBe(1);
    expect(w.top_referrers[0].email_masked).toBe('br***@example.com');
    expect(JSON.stringify(w)).not.toContain('friend1@example.com');
  });
});
