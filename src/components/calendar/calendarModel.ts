import type { CalendarEvent, CalendarStatus } from '../../game/eventCalendar';
import { DATED_INDEX_BASE, eventWindows, LeagueEventId, LeagueEventKind, leagueEventPreview } from '../../game/leagueEvents';

// What the Calendario screen shows, as data (the component only draws it, and this is what the tests read). Pure: no clock, no React, no storage.
//
// `resetAt` is the server's League opening as the game knows it (leagueReset.ts): a number = the League is on (its events have real dates, computed from it), null / undefined = before the League
// (the League events are listed in League days, "Liga: dia N", and get dates when it opens). The dated events come from the server calendar (eventCalendar.ts).

export interface CalendarEntry {
  /** Stable key: the source and the start. */
  key: string;
  source: 'preseason' | 'league';
  id: LeagueEventId;
  kind: LeagueEventKind;
  startMs: number;
  endMs: number;
}

export type CalendarMode = 'offline' | 'loading' | 'error' | 'ready';

export interface LeaguePreviewEntry {
  id: LeagueEventId;
  kind: LeagueEventKind;
  fromDay: number;
  toDay: number;
  hours: number;
}

export interface CalendarView {
  mode: CalendarMode;
  /** Every event with real dates (the pre-season ones, then the League's once it opened), by start. */
  entries: CalendarEntry[];
  /** Running at `now` (normally 0 or 1). */
  current: CalendarEntry[];
  /** Not started yet, soonest first. */
  upcoming: CalendarEntry[];
  /** Already over, most recent first. */
  past: CalendarEntry[];
  /** Before the League opens: its events in League days; null once it opened (they are in `entries` with dates). */
  leaguePreview: LeaguePreviewEntry[] | null;
  msToEnd: number;
  msToNext: number;
}

export function calendarView(status: CalendarStatus, events: readonly CalendarEvent[], resetAt: number | null | undefined, now: number): CalendarView {
  const base: CalendarView = { mode: 'ready', entries: [], current: [], upcoming: [], past: [], leaguePreview: null, msToEnd: 0, msToNext: 0 };
  if (status === 'offline') return { ...base, mode: 'offline' };
  if (status === 'idle' || status === 'loading') return { ...base, mode: events.length > 0 ? 'ready' : 'loading' };
  if (status === 'error' && events.length === 0) return { ...base, mode: 'error' };

  const epoch = typeof resetAt === 'number' ? resetAt : null;
  const dated = events.filter((e) => e.source === 'preseason').map((e) => ({ id: e.id, kind: e.kind, startMs: e.startMs, endMs: e.endMs }));
  // the very same merge the game rules read (leagueEvents.ts eventWindows): the pre-season events cut at the League opening, then the League's own
  const entries: CalendarEntry[] = eventWindows(epoch, dated).map((w) => {
    const source = w.index >= DATED_INDEX_BASE ? 'preseason' : 'league';
    return { key: `${source}-${w.startMs}`, source, id: w.id, kind: w.kind, startMs: w.startMs, endMs: w.endMs };
  });
  entries.sort((a, b) => a.startMs - b.startMs);

  const current = entries.filter((e) => e.startMs <= now && now < e.endMs);
  const upcoming = entries.filter((e) => e.startMs > now);
  const past = entries.filter((e) => e.endMs <= now).reverse();
  return {
    ...base,
    entries,
    current,
    upcoming,
    past,
    leaguePreview: epoch === null ? leagueEventPreview() : null,
    msToEnd: current[0] ? current[0].endMs - now : 0,
    msToNext: upcoming[0] ? upcoming[0].startMs - now : 0,
  };
}

// ---- the month grid ----------------------------------------------------------------------------------------------------------------------------------

export interface MonthDay {
  /** Local midnight of the day (ms) and of the next day. */
  startMs: number;
  endMs: number;
  /** Day of the month (1..31) and whether the day belongs to the month shown (the grid also holds the tail of the last month and the head of the next). */
  day: number;
  inMonth: boolean;
  /** The events that touch this local day, by start. */
  entries: CalendarEntry[];
}

/** The weeks (Sunday first) of the month `month` (0 to 11) of `year`, in the device's local time, each day with the events that touch it. */
export function monthGrid(year: number, month: number, entries: readonly CalendarEntry[]): MonthDay[][] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const lastOfMonth = new Date(year, month + 1, 0);
  const weeks = Math.ceil((first.getDay() + lastOfMonth.getDate()) / 7);
  const out: MonthDay[][] = [];
  for (let w = 0; w < weeks; w++) {
    const row: MonthDay[] = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
      const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
      const startMs = day.getTime();
      const endMs = next.getTime();
      row.push({ startMs, endMs, day: day.getDate(), inMonth: day.getMonth() === month, entries: entries.filter((e) => e.startMs < endMs && e.endMs > startMs) });
    }
    out.push(row);
  }
  return out;
}

/** The month (year, 0-based month) to open on: the one `now` is in. */
export const monthOf = (now: number): { year: number; month: number } => {
  const d = new Date(now);
  return { year: d.getFullYear(), month: d.getMonth() };
};

/** The month before / after (month may wrap). */
export const shiftMonth = (m: { year: number; month: number }, by: number): { year: number; month: number } => {
  const d = new Date(m.year, m.month + by, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
};

// ---- dates for people -----------------------------------------------------------------------------------------------------------------------------

/** "sex., 06/11, 18:00" in the player's local time. The end of an event is shown a minute early (the event ends at midnight, the screen says 23:59). */
export function formatMoment(ms: number, locale: 'pt' | 'en'): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
}

export const formatStart = formatMoment;
export const formatEnd = (endMs: number, locale: 'pt' | 'en'): string => formatMoment(endMs - 60_000, locale);

export function formatMonthTitle(year: number, month: number, locale: 'pt' | 'en'): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, month, 1));
}

export function formatDayTitle(ms: number, locale: 'pt' | 'en'): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date(ms));
}

/** The seven short weekday names, Sunday first. */
export function weekdayNames(locale: 'pt' | 'en'): string[] {
  const f = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'pt-BR', { weekday: 'short' });
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(2026, 9, 4 + i))); // 4 Oct 2026 is a Sunday
}
