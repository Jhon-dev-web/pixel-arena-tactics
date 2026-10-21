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

/** Passes by source, live ones only (a test-mode Pass is shown apart). `measure` is 'active' (history: every active row) or 'valid_now' (covers the current season; falls back to history when the database does not say). */
export function liveOwnersBySource(rows: PassSourceRow[], measure: 'active' | 'valid_now' = 'active'): { source: string; active: number }[] {
  const by = new Map<string, number>();
  for (const r of rows) {
    if (!r.livemode && r.source !== 'grant') continue;
    by.set(r.source, (by.get(r.source) ?? 0) + (measure === 'valid_now' ? (r.valid_now ?? r.active) : r.active));
  }
  return [...by.entries()].map(([source, active]) => ({ source, active })).sort((a, b) => b.active - a.active);
}

export function testPassOwners(rows: PassSourceRow[], measure: 'active' | 'valid_now' = 'active'): number {
  return sum(rows.filter((r) => !r.livemode && r.source !== 'grant').map((r) => (measure === 'valid_now' ? (r.valid_now ?? r.active) : r.active)));
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

// ---- The Pass: "valid this season" and "history" are two measures (migration 0026) -------------------------------------------------------------------------------------

export interface PassMeasures {
  /** False until migration 0026 is applied: the database then only knows the history. */
  known: boolean;
  season: number | null;
  validNow: number | null;
  ranking: number | null;
  /** Accounts that ever held an active Pass, whatever season it covered. */
  history: number;
  expired: number | null;
}

export function passMeasures(pass: Overview['pass']): PassMeasures {
  const known = typeof pass.owners_valid_now === 'number';
  return {
    known,
    season: pass.current_season ?? null,
    validNow: known ? pass.owners_valid_now! : null,
    ranking: typeof pass.owners_valid_ranking === 'number' ? pass.owners_valid_ranking : null,
    history: pass.owners_history ?? pass.owners_active,
    expired: typeof pass.owners_expired === 'number' ? pass.owners_expired : null,
  };
}

export type PassState = 'valid' | 'expired' | 'none' | 'unknown';

/** What the Pass of one account is right now. `unknown` = a Pass exists but the database does not say whether it is still valid (migration 0026 not applied). */
export function playerPassState(p: { pass_source: string | null; pass_valid_now?: boolean; pass_history?: number }): PassState {
  if (typeof p.pass_valid_now === 'boolean') return p.pass_valid_now ? 'valid' : (p.pass_history ?? (p.pass_source ? 1 : 0)) > 0 ? 'expired' : 'none';
  return p.pass_source ? 'unknown' : 'none';
}
