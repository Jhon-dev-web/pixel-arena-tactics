import { describe, expect, test } from 'vitest';
import { createDemoApi } from '../src/lib/demo';
import { defaultLegendaryQuery, defaultMarketQuery, defaultPlayerQuery } from '../src/lib/filters';
import type { ListingRow, SaleRow } from '../src/lib/types';

// The demo backend follows the same contract as the database functions, so the UI can be exercised without a server.
describe('demo api contract', () => {
  const api = createDemoApi();

  test('players: paging, masked e-mails, sort and filters', async () => {
    const p = await api.players(defaultPlayerQuery());
    expect(p.rows).toHaveLength(50);
    expect(p.total).toBeGreaterThan(100);
    for (const r of p.rows) {
      expect(r.email_masked).toMatch(/^.{2}\*\*\*@/);
      expect('email' in r).toBe(false);
    }
    const byLevel = await api.players({ ...defaultPlayerQuery(), sort: 'level', dir: 'desc' });
    const lv = byLevel.rows.map((r) => (r.hero_level ?? 0) + (r.paragon_level ?? 0));
    expect([...lv].sort((a, b) => b - a)).toEqual(lv);
    const online = await api.players({ ...defaultPlayerQuery(), filters: { online: true } });
    expect(online.rows.every((r) => r.online)).toBe(true);
    const none = await api.players({ ...defaultPlayerQuery(), search: 'zzzz-no-such-player' });
    expect(none.total).toBe(0);
  });

  test('detail returns the full e-mail only here', async () => {
    const first = (await api.players(defaultPlayerQuery())).rows[0];
    const d = await api.playerDetail(first.user_id);
    expect(d?.account.email).toContain('@');
    expect(d?.account.email).not.toContain('***');
    expect(await api.playerDetail('nope')).toBeNull();
  });

  test('legendaries, market, economy, league, waitlist and the series answer in the documented shape', async () => {
    const l = await api.legendaries({ ...defaultLegendaryQuery(), filters: { source: 'pity' } });
    expect(l.rows.every((r) => r.source === 'pity')).toBe(true);
    const sales = await api.market(defaultMarketQuery());
    expect(sales.view).toBe('sales');
    expect((sales.rows as SaleRow[])[0].tx_signature.length).toBeGreaterThan(60);
    const live = await api.market({ ...defaultMarketQuery(), filters: { mode: 'live' } });
    expect((live.rows as SaleRow[]).every((r) => r.livemode)).toBe(true);
    const listings = await api.market({ ...defaultMarketQuery(), view: 'listings', filters: { status: 'open' } });
    expect((listings.rows as ListingRow[]).every((r) => r.status === 'open')).toBe(true);
    const eco = await api.economy();
    expect(eco.gold_series.length).toBeGreaterThan(10);
    const lg = await api.league(null, 10);
    expect(lg.top).toHaveLength(10);
    const w = await api.waitlist(7);
    expect(w.by_day).toHaveLength(7);
    const s = await api.series(30);
    expect(s).toHaveLength(30);
    const ov = await api.overview();
    expect(ov.pass.card_price_usd).toBe(10);
    const flags = await api.flags({ page: 0, pageSize: 50 });
    expect(flags.total).toBeGreaterThan(0);
  });
});

describe('demo api: AI operations', () => {
  test('flags really toggle, only with a note; reports really get acknowledged', async () => {
    const api = createDemoApi();
    const before = await api.opsOverview();
    expect(before.flags.map((f) => f.key).sort()).toEqual(['maintenance_mode', 'market_paused', 'pass_sales_paused', 'season_scoring_paused']);
    await expect(api.setOpsFlag('maintenance_mode', true, '')).rejects.toThrow('OPS_NOTE_REQUIRED');
    await expect(api.setOpsFlag('nope' as never, true, 'abc')).rejects.toThrow('OPS_BAD_FLAG');
    expect(await api.setOpsFlag('maintenance_mode', true, 'deploy às 18h')).toMatchObject({ changed: true });
    expect(await api.setOpsFlag('maintenance_mode', true, 'de novo')).toMatchObject({ changed: false });
    const after = await api.opsOverview();
    expect(after.flags.find((f) => f.key === 'maintenance_mode')).toMatchObject({ value: true, note: 'deploy às 18h' });
    expect(after.recent_events[0]).toMatchObject({ kind: 'flag_change', check: 'maintenance_mode' });

    const open = await api.aiReports({ status: 'open', page: 0, pageSize: 20 });
    const rank = { info: 1, low: 2, medium: 3, high: 4, critical: 5 } as const;
    expect(open.rows.map((r) => rank[r.severity])).toEqual([...open.rows.map((r) => rank[r.severity])].sort((a, b) => b - a));
    expect(await api.ackReport(open.rows[0].id)).toEqual({ id: open.rows[0].id, acknowledged: true });
    expect(await api.ackReport(open.rows[0].id)).toMatchObject({ acknowledged: false });
    expect((await api.aiReports({ status: 'open', page: 0, pageSize: 20 })).total).toBe(open.total - 1);
    expect((await api.aiReports({ status: 'all', page: 0, pageSize: 20 })).total).toBe(open.total + 1);
  });

  test('the cost is an estimate with a projection', async () => {
    const c = await createDemoApi().aiCost();
    expect(c.projected_month_usd).toBeGreaterThanOrEqual(c.month_to_date_usd);
    expect(c.by_model.length).toBeGreaterThan(0);
  });
});
