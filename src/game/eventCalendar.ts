import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from '../lib/supabaseClient';
import { setDatedEvents } from './leagueClock';
import { isLeagueEventId, LeagueEventId, LeagueEventKind } from './leagueEvents';

// The event calendar as the game knows it (docs/EVENT_CALENDAR.md): what public.calendar_events() (migration 0035) answers, kept IN MEMORY ONLY (the online build keeps no game data in the browser's
// storage). Two kinds of rows:
//   'preseason'  an event on real dates, before the League opens. Its rows are also handed to leagueClock.ts (setDatedEvents) so the game rules (huntCombat, gathering, deliveries...) play it exactly
//                like a League event.
//   'league'     a League event with real dates, only once the League has opened (the game computes the same dates itself from the League clock; these rows are what the calendar screen can show
//                and the portal reads).
// The offline / desktop build has no server: status 'offline', no events, the calendar screen says so.

export type CalendarSource = 'preseason' | 'league';

export interface CalendarEvent {
  source: CalendarSource;
  id: LeagueEventId;
  kind: LeagueEventKind;
  startMs: number;
  endMs: number;
  /** League events only: the League days the event covers. */
  leagueDayFrom?: number;
  leagueDayTo?: number;
}

export type CalendarStatus = 'idle' | 'loading' | 'ready' | 'error' | 'offline';
export interface CalendarState {
  status: CalendarStatus;
  events: readonly CalendarEvent[];
}

const KINDS: readonly LeagueEventKind[] = ['hero', 'profession', 'final'];

/** What the server answered, as clean events: unknown ids, unknown kinds and broken dates are dropped (the screen never shows what it cannot name). Sorted by start. */
export function parseCalendarRows(raw: unknown): CalendarEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: CalendarEvent[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || typeof r !== 'object') continue;
    const source = r.source === 'league' ? 'league' : r.source === 'preseason' ? 'preseason' : null;
    const startMs = typeof r.starts_at === 'string' ? Date.parse(r.starts_at) : Number.NaN;
    const endMs = typeof r.ends_at === 'string' ? Date.parse(r.ends_at) : Number.NaN;
    if (!source || !isLeagueEventId(r.event_id) || !KINDS.includes(r.kind as LeagueEventKind) || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;
    const ev: CalendarEvent = { source, id: r.event_id, kind: r.kind as LeagueEventKind, startMs, endMs };
    if (source === 'league' && typeof r.league_day_from === 'number' && typeof r.league_day_to === 'number') {
      ev.leagueDayFrom = r.league_day_from;
      ev.leagueDayTo = r.league_day_to;
    }
    out.push(ev);
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

/** THE read: public.calendar_events(). Throws when the server cannot be asked. */
export async function fetchCalendarEvents(): Promise<CalendarEvent[]> {
  if (!supabase) throw new Error('not_configured');
  const { data, error } = await supabase.rpc('calendar_events');
  if (error) throw new Error('calendar_read_failed');
  return parseCalendarRows(data);
}

// ---- the store ----------------------------------------------------------------------------------------------------------------------------------

let state: CalendarState = { status: 'idle', events: [] };
const listeners = new Set<() => void>();
const emit = (next: CalendarState): void => {
  state = next;
  listeners.forEach((l) => l());
};

export const getCalendarState = (): CalendarState => state;

/** Puts the events in the store and hands the pre-season ones to the game rules. */
export function applyCalendarEvents(events: readonly CalendarEvent[]): void {
  setDatedEvents(events.filter((e) => e.source === 'preseason').map((e) => ({ id: e.id, kind: e.kind, startMs: e.startMs, endMs: e.endMs })));
  emit({ status: 'ready', events });
}

/** Test helper: forget everything (and stop the game rules from seeing dated events). */
export function resetCalendarState(): void {
  setDatedEvents([]);
  emit({ status: 'idle', events: [] });
}

let inflight: Promise<void> | null = null;

/**
 * Asks the server and remembers the answer. Never throws. Offline (no backend) = status 'offline'. A failed ask keeps the events already known (the screen shows them) and only says 'error' when
 * there are none yet; the next sync asks again.
 */
export function loadEventCalendar(fetchRows: () => Promise<CalendarEvent[]> = fetchCalendarEvents, hasBackend: boolean = !!supabase): Promise<void> {
  if (!hasBackend) {
    emit({ status: 'offline', events: [] });
    return Promise.resolve();
  }
  if (inflight) return inflight;
  if (state.status === 'idle' || state.status === 'error') emit({ status: 'loading', events: state.events });
  inflight = (async () => {
    try {
      applyCalendarEvents(await fetchRows());
    } catch {
      emit({ status: state.events.length > 0 ? 'ready' : 'error', events: state.events });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** React: the calendar state; asks once when nobody has yet (the game's own sync, App.tsx, keeps it fresh while playing). */
export function useEventCalendar(): CalendarState {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getCalendarState,
    getCalendarState,
  );
  useEffect(() => {
    if (state.status === 'idle') void loadEventCalendar();
  }, []);
  return value;
}

// ---- DEV only: a sample calendar for looking at the screen offline -----------------------------------------------------------------------------

/**
 * Development helper (stripped from the production build): fills the store with a sample pre-season calendar around `now`, in the shape the server answers, so the calendar screen can be looked at in
 * the offline dev build. Never runs in production and never touches a real account.
 */
export function devMockCalendar(now: number = Date.now()): CalendarEvent[] {
  const H = 3_600_000;
  const day0 = new Date(now);
  day0.setHours(0, 0, 0, 0);
  const d = (n: number, h = 0): number => day0.getTime() + n * 24 * H + h * H;
  const sample: CalendarEvent[] = [
    { source: 'preseason', id: 'launch_festival', kind: 'hero', startMs: d(-3), endMs: d(0) },
    { source: 'preseason', id: 'mining_fever', kind: 'profession', startMs: d(0), endMs: d(1) },
    { source: 'preseason', id: 'invasion', kind: 'hero', startMs: d(2, 18), endMs: d(5) },
    { source: 'preseason', id: 'crafts_festival', kind: 'profession', startMs: d(7), endMs: d(9) },
    { source: 'preseason', id: 'target_hunt', kind: 'hero', startMs: d(9, 18), endMs: d(12) },
    { source: 'preseason', id: 'profession_week', kind: 'profession', startMs: d(14), endMs: d(16) },
    { source: 'preseason', id: 'dungeon_race', kind: 'hero', startMs: d(16, 18), endMs: d(19) },
  ];
  return sample;
}

/** DEV only: `?calendarMock=1` in the address of the offline dev build loads the sample calendar. Returns true when it did. */
export function applyDevMockFromUrl(search: string = typeof window === 'undefined' ? '' : window.location.search): boolean {
  if (!import.meta.env.DEV || !/[?&]calendarMock=1\b/.test(search)) return false;
  applyCalendarEvents(devMockCalendar());
  return true;
}
