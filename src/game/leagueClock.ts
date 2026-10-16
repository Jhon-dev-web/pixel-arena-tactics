// The one number the League events hang from: the moment the first League opened on the SERVER (league_reset_at, in ms). A leaf module with no imports, so the pure game code
// (engine.ts, huntCombat.ts, deliveries.ts...) can read it without pulling the Supabase client or React in; leagueReset.ts writes it whenever it learns the value.
//
//   null     the League has not opened (pre-season), or this is the offline / desktop build, or the server was never asked: there is no event calendar to play
//   number   the server's reset moment; league day 1 starts here (leagueEvents.ts counts hours from it)
//
// Nothing here reads the device clock and nothing is persisted: a skewed device clock cannot move the calendar, because the calendar is the server's moment plus fixed offsets.

let epoch: number | null = null;

export const getLeagueEpoch = (): number | null => epoch;

/** Takes the server's reset moment (or null when there is none / it is unknown). Anything that is not a positive finite number counts as null. */
export function setLeagueEpoch(ms: number | null | undefined): void {
  epoch = typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? ms : null;
}
