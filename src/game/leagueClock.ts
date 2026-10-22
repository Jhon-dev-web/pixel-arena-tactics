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

// ---- the dated (pre-season) events -----------------------------------------------------------------------------------------------------------
// Before the League opens the server publishes a calendar of events on REAL dates (public.calendar_events(), migration 0035; the table is arena_private.event_calendar). The game reads it
// (eventCalendar.ts) and parks the rows here, in memory only, so the pure game code can see them next to the League clock. Same rule as above: nothing here is read from the device clock
// and nothing is persisted. The offline / desktop build never asks, so this stays empty there.

/** One dated event as the server hands it out, in ms. `id` is a LeagueEventId (leagueEvents.ts validates it before it gets here). */
export interface DatedEvent {
  id: string;
  kind: 'hero' | 'profession' | 'final';
  startMs: number;
  endMs: number;
}

let dated: readonly DatedEvent[] = [];

export const getDatedEvents = (): readonly DatedEvent[] => dated;

/** Replaces the dated events (an empty list clears them). Keeps only well-formed rows and sorts them by start. */
export function setDatedEvents(list: readonly DatedEvent[] | null | undefined): void {
  dated = (list ?? [])
    .filter((e) => e && typeof e.id === 'string' && Number.isFinite(e.startMs) && Number.isFinite(e.endMs) && e.endMs > e.startMs && e.startMs > 0)
    .slice()
    .sort((a, b) => a.startMs - b.startMs);
}
