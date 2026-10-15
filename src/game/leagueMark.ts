// The marker a save carries about the first League's reset (migration 0009_first_league_reset.sql; docs/SEASON_RANKING.md "Reset da primeira Liga").
// No game imports: engine.ts (the save type) and leagueReset.ts (the logic) both use it.

export interface LeagueMark {
  /**
   * The server's reset moment (league_reset_at, in ms) this hero belongs to. A hero whose epoch is below the server's reset moment predates the first League and is replaced by a
   * fresh one; setting it to the server's own value (never the device clock) is what makes the check exact, so a skewed clock can neither skip nor repeat the reset.
   */
  epoch: number;
  /** The one-time "everyone started together" screen was dismissed. */
  noticeSeen: boolean;
  /** The server was asked whether this account was a tester ("Pioneiro", cosmetic title) and the answer was applied. */
  pioneerChecked: boolean;
}

/** Reads a save's marker defensively: anything that is not a proper marker means "never reset" (epoch 0). */
export function sanitizeLeagueMark(raw: unknown): LeagueMark | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const epoch = typeof r.epoch === 'number' && Number.isFinite(r.epoch) && r.epoch > 0 ? Math.floor(r.epoch) : 0;
  if (epoch === 0) return undefined;
  return { epoch, noticeSeen: r.noticeSeen === true, pioneerChecked: r.pioneerChecked === true };
}

export const leagueEpochOf = (save: { league?: LeagueMark }): number => save.league?.epoch ?? 0;
