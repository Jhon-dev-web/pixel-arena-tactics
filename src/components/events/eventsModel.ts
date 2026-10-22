import type { SaveData } from '../../game/engine';
import { activeEventBuffs, eventAt, LeagueEventWindow, leagueDayAt, leagueEventPreview, nextEventAfter, pickedProfession, ProfessionId } from '../../game/leagueEvents';

// What the "Eventos" panel shows, as data (the component only draws it, and this is what the tests read). `resetAt` is the server's League opening as the game knows it
// (leagueReset.ts useLeagueResetAt): undefined = not asked yet / the offline build (nothing is shown), null = the League has not opened (pre-season: the calendar is shown as "na Liga"),
// a number = the League is on and the clock is the server's.
export type EventsMode = 'hidden' | 'preseason' | 'waiting' | 'running' | 'over';

export interface EventsView {
  mode: EventsMode;
  current: LeagueEventWindow | null;
  next: LeagueEventWindow | null;
  /** Milliseconds until the running event ends / until the next one starts (0 when there is none). */
  msToEnd: number;
  msToNext: number;
  leagueDay: number;
  /** Semana das Profissoes: the pick is open (a week is running and nothing was picked for it) or already made. */
  pick: { open: boolean; chosen: ProfessionId | null };
  /** The Hunting XP buffs the player holds that are still running. */
  buffs: { pct: number; msLeft: number }[];
  /** Pre-season only: the calendar in League days. */
  preview: ReturnType<typeof leagueEventPreview>;
}

export function eventsView(resetAt: number | null | undefined, now: number, save: Pick<SaveData, 'eventBuffs' | 'eventPick'>): EventsView {
  const base: EventsView = { mode: 'hidden', current: null, next: null, msToEnd: 0, msToNext: 0, leagueDay: 0, pick: { open: false, chosen: null }, buffs: [], preview: [] };
  if (resetAt === undefined) return base;
  // Before the League the events are the dated ones of the server calendar (leagueClock.ts getDatedEvents; none offline or before the calendar is read); after it, the dated ones that are over and the League's.
  const current = eventAt(resetAt, now);
  const next = nextEventAfter(resetAt, now);
  const buffs = activeEventBuffs(save, now).map((b) => ({ pct: b.pct, msLeft: b.to - now }));
  const chosen = current ? pickedProfession(save, current) : null;
  return {
    ...base,
    mode: resetAt === null ? 'preseason' : current ? 'running' : next ? 'waiting' : 'over',
    preview: resetAt === null ? leagueEventPreview() : [],
    current,
    next,
    msToEnd: current ? current.endMs - now : 0,
    msToNext: next ? next.startMs - now : 0,
    leagueDay: resetAt === null ? 0 : leagueDayAt(resetAt, now),
    pick: { open: current?.id === 'profession_week' && chosen === null, chosen },
    buffs,
  };
}

/** "2d 05h", "5h12", "12min": the countdown shape of the panel (rounded up, never negative). */
export function countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 60_000));
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (d > 0) return `${d}d ${pad(h)}h`;
  if (h > 0) return `${h}h${pad(m)}`;
  return `${m}min`;
}
