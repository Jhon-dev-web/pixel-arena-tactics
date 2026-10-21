// How old the derived numbers are. Pure, so it is tested. The routines are scheduled by the owner (docs/ADMIN.md section 4): the daily one every 15 minutes, the aggregates every 6 hours.
import type { Overview } from './types';

/** The daily routine (sign-ups and active players per day) runs every 15 minutes: more than an hour without a run is late. */
export const DAILY_LATE_MS = 60 * 60 * 1000;
/** The aggregates (player cache, gold) run every 6 hours: more than 13 hours without a run is late. */
export const AGGREGATE_LATE_MS = 13 * 60 * 60 * 1000;

export type AggregateState = 'never' | 'late' | 'fresh';

export interface AggregateStatus {
  /** player cache + gold: "dados agregados até" */
  cache: { state: AggregateState; at: string | null };
  /** the daily series: "última execução da rotina diária" */
  daily: { state: AggregateState; at: string | null };
}

function judge(at: string | null | undefined, lateMs: number, now: number): { state: AggregateState; at: string | null } {
  if (!at) return { state: 'never', at: null };
  const t = new Date(at).getTime();
  if (Number.isNaN(t)) return { state: 'never', at: null };
  return { state: now - t > lateMs ? 'late' : 'fresh', at };
}

export function aggregateStatus(f: Overview['freshness'], now: number): AggregateStatus {
  return {
    cache: judge(f.player_cache_refreshed_at ?? f.gold_captured_at, AGGREGATE_LATE_MS, now),
    daily: judge(f.daily_captured_at, DAILY_LATE_MS, now),
  };
}

/** "14:05:11" in the browser's own zone: the time a query finished. */
export function clockTime(ms: number | null | undefined): string {
  if (!ms) return '—';
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(ms));
}
