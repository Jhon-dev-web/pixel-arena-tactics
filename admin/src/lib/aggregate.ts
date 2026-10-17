// Small derivations the pages share. Pure, so they are tested.
import type { ItemGroup, Overview, PassSourceRow, SeriesDay } from './types';

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

export interface ItemSummary {
  /** Certified pieces that exist now: held or listed, bought copies included. Gold Pouches are counted apart. */
  existing: number;
  listed: number;
  /** Copies issued to a buyer by a sale. */
  bought: number;
  /** Original issues (a bought copy is not a new issue). */
  issued: number;
  burned: number;
  revoked: number;
  legendary: number;
  epic: number;
}

export function summarizeItems(groups: ItemGroup[]): ItemSummary {
  const gear = groups.filter((g) => g.kind !== 'gold_pouch');
  const where = (f: (g: ItemGroup) => boolean) => sum(gear.filter(f).map((g) => g.count));
  return {
    existing: where((g) => g.status === 'held' || g.status === 'listed'),
    listed: where((g) => g.status === 'listed'),
    bought: where((g) => g.bought),
    issued: where((g) => !g.bought),
    burned: where((g) => g.status === 'burned'),
    revoked: where((g) => g.status === 'revoked'),
    legendary: where((g) => g.rarity === 'legendary' && (g.status === 'held' || g.status === 'listed')),
    epic: where((g) => g.rarity === 'epic' && (g.status === 'held' || g.status === 'listed')),
  };
}

/** Active Passes by source, live ones only (a test-mode Pass is shown apart). */
export function liveOwnersBySource(rows: PassSourceRow[]): { source: string; active: number }[] {
  const by = new Map<string, number>();
  for (const r of rows) {
    if (!r.livemode && r.source !== 'grant') continue;
    by.set(r.source, (by.get(r.source) ?? 0) + r.active);
  }
  return [...by.entries()].map(([source, active]) => ({ source, active })).sort((a, b) => b.active - a.active);
}

export function testPassOwners(rows: PassSourceRow[]): number {
  return sum(rows.filter((r) => !r.livemode && r.source !== 'grant').map((r) => r.active));
}

/** Revenue estimate: live card sales times the owner's configured price, plus the USDC actually received. */
export function passRevenue(pass: Overview['pass']): { card: number; usdc: number; total: number } {
  const card = Math.max(0, pass.card_sold_live) * pass.card_price_usd;
  const usdc = Number(pass.usdc_live) || 0;
  return { card, usdc, total: card + usdc };
}

export function lastDays(series: SeriesDay[], n: number): SeriesDay[] {
  return series.slice(-n);
}

export function sumSeries(series: SeriesDay[], key: Exclude<keyof SeriesDay, 'day'>): number {
  return sum(series.map((d) => Number(d[key]) || 0));
}

export function materialsTotal(rows: { qty: number; listed: number }[]): number {
  return sum(rows.map((r) => Number(r.qty) + Number(r.listed)));
}
