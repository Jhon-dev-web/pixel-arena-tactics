import { describe, expect, test } from 'vitest';
import { liveOwnersBySource, materialsTotal, passRevenue, summarizeItems, sumSeries, testPassOwners } from '../src/lib/aggregate';
import { niceScale } from '../src/components/Charts';
import type { ItemGroup, Overview, PassSourceRow, SeriesDay } from '../src/lib/types';

const g = (kind: string, rarity: string | null, status: string, count: number, bought = false): ItemGroup => ({ kind, rarity, status, bound: false, bought, count });

describe('summarizeItems', () => {
  const groups = [g('gear', 'epic', 'held', 10), g('gear', 'epic', 'listed', 2), g('gear', 'epic', 'transferred', 3), g('gear', 'epic', 'held', 3, true), g('gear', 'legendary', 'held', 4), g('gear', 'legendary', 'burned', 1), g('unique', 'epic', 'held', 5), g('gold_pouch', null, 'held', 99)];
  test('counts what exists, what is on sale and what was bought; pouches are left out', () => {
    expect(summarizeItems(groups)).toEqual({ existing: 24, listed: 2, bought: 3, issued: 25, burned: 1, revoked: 0, legendary: 4, epic: 20 });
  });
  test('empty', () => {
    expect(summarizeItems([])).toMatchObject({ existing: 0, issued: 0 });
  });
});

describe('Pass numbers', () => {
  const rows: PassSourceRow[] = [
    { source: 'stripe', livemode: true, active: 10, refunded: 1, revoked: 0 },
    { source: 'stripe', livemode: false, active: 2, refunded: 0, revoked: 0 },
    { source: 'crypto_sol', livemode: true, active: 4, refunded: 0, revoked: 0 },
    { source: 'grant', livemode: false, active: 3, refunded: 0, revoked: 0 },
    { source: 'referral', livemode: true, active: 1, refunded: 0, revoked: 0 },
  ];
  test('live owners by source: real money, referrals and manual grants; test purchases apart', () => {
    expect(liveOwnersBySource(rows)).toEqual([
      { source: 'stripe', active: 10 },
      { source: 'crypto_sol', active: 4 },
      { source: 'grant', active: 3 },
      { source: 'referral', active: 1 },
    ]);
    expect(testPassOwners(rows)).toBe(2);
  });
  test('revenue = live card sales x configured price + USDC received', () => {
    const pass = { card_sold_live: 846, card_price_usd: 10, usdc_live: 3110 } as Overview['pass'];
    expect(passRevenue(pass)).toEqual({ card: 8460, usdc: 3110, total: 11570 });
    expect(passRevenue({ card_sold_live: -1, card_price_usd: 10, usdc_live: Number.NaN } as Overview['pass'])).toEqual({ card: 0, usdc: 0, total: 0 });
  });
});

describe('series and materials', () => {
  test('sumSeries and materialsTotal', () => {
    const s = [{ day: 'a', sales: 2, signups: 5 }, { day: 'b', sales: 3, signups: 1 }] as unknown as SeriesDay[];
    expect(sumSeries(s, 'sales')).toBe(5);
    expect(materialsTotal([{ qty: 100, listed: 20 }, { qty: 5, listed: 0 }])).toBe(125);
  });
});

describe('niceScale', () => {
  test('rounds the top up to a readable number with four steps', () => {
    expect(niceScale(87)).toEqual({ top: 100, ticks: [0, 25, 50, 75, 100] });
    expect(niceScale(7)).toEqual({ top: 8, ticks: [0, 2, 4, 6, 8] });
    expect(niceScale(0)).toEqual({ top: 4, ticks: [0, 1, 2, 3, 4] });
    expect(niceScale(Number.NaN).top).toBe(4);
    expect(niceScale(1_230_000).top).toBeGreaterThanOrEqual(1_230_000);
  });
});
