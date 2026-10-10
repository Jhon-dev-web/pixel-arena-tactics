import T from './tunables';

// Seasons of the Adventurer Pass track. Every player shares the same season number, counted from a fixed UTC epoch (never from when the player
// bought or started anything), so a season rolls over for everybody at the same instant. Pure and clock-free: callers pass `now`.

// "Temporada 1" starts on 2026-10-01 00:00 UTC.
export const SEASON_EPOCH_MS = Date.UTC(2026, 9, 1);

const DAY_MS = 24 * 3600 * 1000;
export const seasonLengthMs = (): number => Math.max(1, Math.floor(T.battlePass.seasonDays)) * DAY_MS;

// Season number at `now`, at least 1 (a clock before the epoch counts as season 1; a non-finite one too).
export function seasonNumber(now: number): number {
  if (!Number.isFinite(now)) return 1;
  return Math.max(1, Math.floor((now - SEASON_EPOCH_MS) / seasonLengthMs()) + 1);
}

export const seasonStartMs = (season: number): number => SEASON_EPOCH_MS + (Math.max(1, Math.floor(season)) - 1) * seasonLengthMs();

// Time left in `season` at `now`, clamped to the season length (a clock set backwards never shows more than one season).
export function seasonRemainingMs(season: number, now: number): number {
  return Math.min(seasonLengthMs(), Math.max(0, seasonStartMs(season) + seasonLengthMs() - now));
}

// What the last season settlement delivered (battlepass.ts settleSeason): kept in the save until the player dismisses the "Recompensas da Temporada N entregues" card.
// Rewards are stored as plain {kind, id, amount}, merged per item, so the card does not depend on the track staying the same.
export interface SummaryReward {
  kind: 'gold' | 'material' | 'consumable' | 'gem' | 'shards' | 'cosmetic' | 'relic';
  id?: string;
  amount: number;
}

export interface SeasonSummary {
  season: number; // the season whose rewards these were
  rewards: SummaryReward[];
}

const SUMMARY_KINDS: readonly string[] = ['gold', 'material', 'consumable', 'gem', 'shards', 'cosmetic', 'relic'];

export function sanitizeSeasonSummary(raw: unknown): SeasonSummary | null {
  const r = raw as Partial<SeasonSummary> | null | undefined;
  const season = Math.floor(Number(r?.season));
  if (!r || !Number.isFinite(season) || season < 1 || !Array.isArray(r.rewards)) return null;
  const rewards: SummaryReward[] = [];
  for (const w of r.rewards.slice(0, 200)) {
    const amount = Math.floor(Number(w?.amount));
    if (!w || !SUMMARY_KINDS.includes(w.kind) || !Number.isFinite(amount) || amount <= 0) continue;
    rewards.push({ kind: w.kind, ...(typeof w.id === 'string' ? { id: w.id } : {}), amount: Math.min(amount, 1e9) });
  }
  return rewards.length > 0 ? { season, rewards } : null;
}
