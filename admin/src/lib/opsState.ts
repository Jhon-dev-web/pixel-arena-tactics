// Is the automatic service even running? "No open incident" only means something if the watchdog has been checking. Pure, so it is tested.
import type { AiCost, OpsCheck } from './types';

/** The watchdog runs every 5 minutes: three missed rounds is late. */
export const WATCHDOG_LATE_MS = 15 * 60 * 1000;

export type WatchdogState = 'not-deployed' | 'late' | 'running';

export function watchdogState(checks: OpsCheck[], now: number): { state: WatchdogState; lastCheckedAt: string | null } {
  const times = checks.map((c) => new Date(c.last_checked_at).getTime()).filter((t) => !Number.isNaN(t));
  if (times.length === 0) return { state: 'not-deployed', lastCheckedAt: null };
  const last = Math.max(...times);
  return { state: now - last > WATCHDOG_LATE_MS ? 'late' : 'running', lastCheckedAt: new Date(last).toISOString() };
}

/** The AI auditor has never produced a run (no cost row in any month): not deployed, or the key is missing. */
export function aiNeverRan(cost: AiCost): boolean {
  return cost.months.length === 0 && cost.runs_today === 0;
}
