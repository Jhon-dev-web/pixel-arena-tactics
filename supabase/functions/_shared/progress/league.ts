// The first-League reset, server side (migration 0009_first_league_reset.sql; docs/SEASON_RANKING.md "Reset da primeira Liga").
// Pure and dependency-free like metrics.ts.

/**
 * The reset epoch (ms) a posted save DECLARES it belongs to (save.league.epoch, written by the game when it replaces a pre-reset hero with a fresh one). 0 when absent: every save
 * from before the feature. It is only used to tell an honest old client "your hero has not been reset yet" (a retryable 409, nothing stored, nothing flagged); a save that LIES about it is
 * judged as a fresh run and rejected by the pace audit like any impossible jump.
 */
export function declaredLeagueEpochMs(blob: unknown): number {
  if (!blob || typeof blob !== 'object') return 0;
  const league = (blob as { league?: unknown }).league;
  if (!league || typeof league !== 'object') return 0;
  const epoch = (league as { epoch?: unknown }).epoch;
  return typeof epoch === 'number' && Number.isFinite(epoch) && epoch > 0 ? Math.floor(epoch) : 0;
}

/** Seconds an honest client waits before it asks again after "league_reset_pending" (it resets on its next login / resume check and then posts the fresh hero). */
export const LEAGUE_RESET_RETRY_S = 60;

/** The account age the pace audit uses: time since the later of "account created" and "the League reset". null when neither is known. */
export function effectiveAccountStartMs(accountCreatedMs: number | null, resetAtMs: number | null): number | null {
  if (resetAtMs === null) return accountCreatedMs;
  return accountCreatedMs === null ? resetAtMs : Math.max(accountCreatedMs, resetAtMs);
}
