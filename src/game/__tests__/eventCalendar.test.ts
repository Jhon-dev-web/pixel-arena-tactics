import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CalendarScreen from '../../components/calendar/CalendarScreen';
import { calendarView, formatEnd, monthGrid, monthOf, shiftMonth } from '../../components/calendar/calendarModel';
import { eventsView } from '../../components/events/eventsModel';
import { hero } from '../../../scripts/sim/duel';
import { applyHuntStart } from '../huntLifecycle';
import { computeHuntingStatus, defaultSave, SaveData, xpToReachLevel } from '../engine';
import { sanitizeHuntSession } from '../huntSession';
import { applyCalendarEvents, applyDevMockFromUrl, CalendarEvent, devMockCalendar, loadEventCalendar, parseCalendarRows, resetCalendarState } from '../eventCalendar';
import { getDatedEvents, setDatedEvents, setLeagueEpoch } from '../leagueClock';
import { computeMiningStatus } from '../engine';
import { applyStartGathering } from '../gathering';
import {
  DAY_MS,
  HOUR_MS,
  applyDungeonRace,
  applyProfessionPick,
  datedEventWindows,
  eventAt,
  eventGatherBonusHours,
  eventSkillXpMultiplier,
  eventWindows,
  grantEventBuff,
  huntEventWindows,
  leagueEventWindows,
  nextEventAfter,
} from '../leagueEvents';
import { resetKnownLeagueResetAt } from '../leagueReset';
import { setLocale } from '../../locales';
import pt from '../../locales/pt.json';
import en from '../../locales/en.json';

// The event calendar (migration 0035, docs/EVENT_CALENDAR.md): events on real dates before the League, played with the SAME rules and caps as the League events, a calendar screen, and nothing at all
// without the server's calendar (offline).

const root = resolve(__dirname, '../../..');
const sql = readFileSync(resolve(root, 'supabase/migrations/0035_event_calendar.sql'), 'utf8').replace(/\r\n/g, '\n');
const seed = [...sql.matchAll(/\('(\w+)', '(hero|profession)', '(\d{4}-\d\d-\d\d \d\d:\d\d)-03', '(\d{4}-\d\d-\d\d \d\d:\d\d)-03', '[^']*'\)/g)].map((m) => ({
  id: m[1],
  kind: m[2] as 'hero' | 'profession',
  startMs: Date.parse(`${m[3].replace(' ', 'T')}:00-03:00`),
  endMs: Date.parse(`${m[4].replace(' ', 'T')}:00-03:00`),
}));
const toEvents = (): CalendarEvent[] => seed.map((s) => ({ source: 'preseason', id: s.id as CalendarEvent['id'], kind: s.kind, startMs: s.startMs, endMs: s.endMs }));
// Brasilia time has no daylight saving: a fixed -03 offset. Weekday / hour of an instant in Brasilia:
const brt = (ms: number) => {
  const d = new Date(ms - 3 * HOUR_MS);
  return { dow: d.getUTCDay(), hour: d.getUTCHours(), min: d.getUTCMinutes() };
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.UTC(2026, 10, 7, 12)); // Saturday 7 Nov 2026, 09:00 in Brasilia: the first weekend event is running
  setLocale('pt');
  resetCalendarState();
  setLeagueEpoch(null);
  resetKnownLeagueResetAt();
});
afterEach(() => {
  vi.useRealTimers();
  resetCalendarState();
  setLeagueEpoch(null);
  resetKnownLeagueResetAt();
});

describe('migration 0035: the pre-season calendar (the seed)', () => {
  it('has the launch festival and eight weeks of rhythm: 17 events, in order, one at a time with a rest between', () => {
    expect(seed).toHaveLength(17);
    expect(seed[0]).toMatchObject({ id: 'launch_festival', kind: 'hero', startMs: Date.parse('2026-10-31T00:00:00-03:00'), endMs: Date.parse('2026-11-03T00:00:00-03:00') });
    for (let i = 1; i < seed.length; i++) {
      expect(seed[i].startMs, `${i}`).toBeGreaterThan(seed[i - 1].endMs); // a rest between two events
      expect(seed[i].id).not.toBe(seed[i - 1].id);
    }
  });

  it('weekend hero events run Friday 18h to Sunday 23h59 (Brasilia), rotating the five hero events; profession days start on Wednesday and last 24 to 48 h', () => {
    const weekends = seed.filter((s) => s.id !== 'launch_festival' && s.kind === 'hero');
    const days = seed.filter((s) => s.kind === 'profession');
    expect(weekends).toHaveLength(8);
    expect(days).toHaveLength(8);
    for (const w of weekends) {
      expect(brt(w.startMs)).toEqual({ dow: 5, hour: 18, min: 0 }); // Friday 18:00
      expect(brt(w.endMs)).toEqual({ dow: 1, hour: 0, min: 0 }); // Monday 00:00 = Sunday 23:59:59 over
      expect((w.endMs - w.startMs) / HOUR_MS).toBe(54);
    }
    expect(weekends.slice(0, 5).map((w) => w.id)).toEqual(['invasion', 'target_hunt', 'dungeon_race', 'time_rift', 'grand_delivery']);
    expect(weekends[5].id).toBe('invasion'); // the rotation goes round again
    for (const d of days) {
      expect(brt(d.startMs)).toEqual({ dow: 3, hour: 0, min: 0 }); // Wednesday 00:00
      expect([24, 48]).toContain((d.endMs - d.startMs) / HOUR_MS);
    }
    expect(new Set(days.map((d) => d.id))).toEqual(new Set(['mining_fever', 'crafts_festival', 'profession_week']));
  });

  it('the events are the ones the game already has (no new economy): every id has rules or a profession effect and a name in both languages', () => {
    for (const tree of [pt, en]) {
      const ev = (tree as unknown as { events: Record<string, string> }).events;
      for (const s of seed) {
        expect(typeof ev[`name_${s.id}`], s.id).toBe('string');
        expect(typeof ev[`desc_${s.id}`], s.id).toBe('string');
      }
    }
  });

  it('the table refuses overlaps, fills kind itself, is private, and the read function cuts at the League opening', () => {
    const code = sql
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n');
    expect(code).toContain('create table if not exists arena_private.event_calendar');
    expect(code).toContain('raise exception \'event_calendar: this event overlaps another one');
    expect(code).toContain('revoke all on table arena_private.event_calendar from public, anon, authenticated;');
    expect(code).toContain('alter table arena_private.event_calendar enable row level security;');
    expect(code).toContain('where o.reset_at is null or e.starts_at < o.reset_at'); // an event that starts after the opening is not returned
    expect(code).toContain('least(e.ends_at, coalesce(o.reset_at, e.ends_at))'); // one that is running is cut at it
    expect(code).toContain('grant execute on function public.calendar_events(timestamptz, timestamptz) to anon, authenticated, service_role;');
    expect(code).not.toMatch(/auth\.uid\(\)|user_id|characters|entitlements/); // nothing about a player
    expect(sql).toContain('-- ROLLBACK (by hand');
    expect(sql).toContain('drop function if exists public.calendar_events(timestamptz, timestamptz);');
    expect(sql).toContain('-- SQL TEST PLAN');
    expect(sql).toContain('NOT APPLIED');
  });
});

describe('parsing what the server answers', () => {
  it('keeps well-formed rows by start and drops unknown events, unknown kinds and broken dates', () => {
    const rows = [
      { source: 'preseason', event_id: 'invasion', kind: 'hero', starts_at: '2026-11-06T21:00:00+00:00', ends_at: '2026-11-09T03:00:00+00:00', hours: 54 },
      { source: 'league', event_id: 'invasion', kind: 'hero', starts_at: '2026-12-01T10:00:00+00:00', ends_at: '2026-12-03T10:00:00+00:00', league_day_from: 3, league_day_to: 4 },
      { source: 'preseason', event_id: 'made_up', kind: 'hero', starts_at: '2026-11-01T00:00:00+00:00', ends_at: '2026-11-02T00:00:00+00:00' },
      { source: 'preseason', event_id: 'invasion', kind: 'odd', starts_at: '2026-11-01T00:00:00+00:00', ends_at: '2026-11-02T00:00:00+00:00' },
      { source: 'preseason', event_id: 'invasion', kind: 'hero', starts_at: 'nope', ends_at: '2026-11-02T00:00:00+00:00' },
      { source: 'preseason', event_id: 'mining_fever', kind: 'profession', starts_at: '2026-11-04T03:00:00+00:00', ends_at: '2026-11-05T03:00:00+00:00' },
      null,
    ];
    const out = parseCalendarRows(rows);
    expect(out.map((e) => `${e.source}:${e.id}`)).toEqual(['preseason:mining_fever', 'preseason:invasion', 'league:invasion']);
    expect(out[2]).toMatchObject({ leagueDayFrom: 3, leagueDayTo: 4 });
    expect(parseCalendarRows('x')).toEqual([]);
  });
});

describe('dated events play exactly like League events', () => {
  const find = (id: string, nth = 0) => seed.filter((s) => s.id === id)[nth];

  it('the dated windows are found by eventAt / nextEventAfter with no League clock, and stop at the League opening', () => {
    setDatedEvents(toEvents());
    const inv = find('invasion');
    expect(eventAt(null, inv.startMs - 1)).toBeNull();
    expect(eventAt(null, inv.startMs)?.id).toBe('invasion');
    expect(eventAt(null, inv.endMs)).toBeNull();
    expect(nextEventAfter(null, inv.endMs)?.id).toBe('crafts_festival');
    // the League opens in the middle of the second weekend event: it is cut there, and the later ones are gone
    const weekend2 = find('target_hunt');
    const epoch = weekend2.startMs + 10 * HOUR_MS;
    const cut = datedEventWindows(epoch).filter((w) => w.startMs <= epoch && w.endMs > weekend2.startMs);
    expect(cut).toHaveLength(1);
    expect(cut[0].endMs).toBe(epoch);
    expect(datedEventWindows(epoch).every((w) => w.endMs <= epoch)).toBe(true);
    // an event never overlaps the League: the merged list has no overlap
    const all = eventWindows(epoch);
    for (let i = 1; i < all.length; i++) expect(all[i].startMs).toBeGreaterThanOrEqual(all[i - 1].endMs);
  });

  it('hero events: the Hunting session sees the rules of the dated event (the Festival de Abertura = the Invasao rules), and none outside it', () => {
    setDatedEvents(toEvents());
    const fest = find('launch_festival');
    const w = huntEventWindows(null, fest.startMs, 2 * DAY_MS);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ id: 'launch_festival', streakStep: 50, streakGain: 0.01, streakCap: 0.1, escalateEvery: 100, escalatePct: 0.03, escalateCap: 0.3, from: 0 });
    const inv = find('invasion');
    expect(huntEventWindows(null, inv.startMs - 5 * HOUR_MS, 10 * HOUR_MS)[0]).toMatchObject({ id: 'invasion', from: 5 * HOUR_MS });
    const tgt = find('target_hunt');
    expect(huntEventWindows(null, tgt.startMs, HOUR_MS)[0]).toMatchObject({ id: 'target_hunt', targetEvery: 300, targetBuffPct: 0.08 });
    expect(huntEventWindows(null, fest.endMs + 5 * HOUR_MS, HOUR_MS)).toEqual([]);
    // a session carries the dated windows it started with (the server's word, in the save), so it plays them even before the calendar is read again
    const carried = huntEventWindows(null, fest.startMs, HOUR_MS, [{ id: 'launch_festival', kind: 'hero', startMs: fest.startMs, endMs: fest.endMs }]);
    expect(carried[0]).toMatchObject({ id: 'launch_festival' });
  });

  it('timed buffs: the Corrida da Masmorra pays its Gold and buff inside the dated window and nothing outside it', () => {
    setDatedEvents(toEvents());
    const race = find('dungeon_race');
    const s = defaultSave();
    const inside = applyDungeonRace(s, 24, 1, race.startMs + HOUR_MS, null);
    expect(inside.gold).toBe(120);
    expect(inside.save.eventBuffs?.dungeon_race).toMatchObject({ pct: 0.08 });
    expect(applyDungeonRace(s, 24, 1, race.endMs + HOUR_MS, null).gold).toBe(0);
    // Grande Entrega
    const gd = find('grand_delivery');
    expect(grantEventBuff(s, 'grand_delivery', gd.startMs + HOUR_MS, null).eventBuffs?.grand_delivery?.pct).toBe(0.1);
    expect(grantEventBuff(s, 'grand_delivery', gd.startMs - HOUR_MS, null)).toBe(s);
    // without the server calendar nothing is paid
    setDatedEvents([]);
    expect(applyDungeonRace(s, 24, 1, race.startMs + HOUR_MS, null).gold).toBe(0);
  });

  it('profession events: Febre da Mineracao (+25% ore), Festival dos Oficios (+15% XP) and the Semana das Profissoes pick work on dated windows', () => {
    setDatedEvents(toEvents());
    const fever = find('mining_fever');
    expect(eventGatherBonusHours('mining', fever.startMs, 4 * HOUR_MS, null)).toBeCloseTo(1, 9); // 4 h x 25%
    expect(eventGatherBonusHours('woodcutting', fever.startMs, 4 * HOUR_MS, null)).toBe(0);
    const mine = defaultSave();
    const session = applyStartGathering(mine, 'mining', 'copper', fever.startMs + HOUR_MS)!.save;
    const at = fever.startMs + 7 * HOUR_MS;
    const withEvent = computeMiningStatus(session, at).oreReady;
    setDatedEvents([]);
    const plain = computeMiningStatus(session, at).oreReady;
    expect(withEvent / plain).toBeGreaterThan(1.2); // +25% of the units (whole ores, so a few units of rounding)
    expect(withEvent / plain).toBeLessThan(1.3);

    setDatedEvents(toEvents());
    const crafts = find('crafts_festival');
    const s = defaultSave();
    expect(eventSkillXpMultiplier(s, 'mining', crafts.startMs + HOUR_MS, crafts.startMs + 5 * HOUR_MS, null)).toBeCloseTo(1.15, 9);
    const week = find('profession_week');
    const picked = applyProfessionPick(s, 'woodcutting', week.startMs + HOUR_MS, null)!;
    expect(picked.eventPick).toEqual({ at: week.startMs, profession: 'woodcutting' });
    expect(eventSkillXpMultiplier(picked, 'woodcutting', week.startMs + HOUR_MS, week.startMs + 3 * HOUR_MS, null)).toBeCloseTo(1.25, 9);
    expect(eventSkillXpMultiplier(picked, 'mining', week.startMs + HOUR_MS, week.startMs + 3 * HOUR_MS, null)).toBe(1);
  });

  it('the store clears and replaces cleanly, and ignores rows that are not valid windows', () => {
    setDatedEvents([{ id: 'invasion', kind: 'hero', startMs: 10, endMs: 5 }, { id: 'invasion', kind: 'hero', startMs: 0, endMs: 5 }, { id: 'invasion', kind: 'hero', startMs: Number.NaN, endMs: 5 }]);
    expect(getDatedEvents()).toEqual([]);
    setDatedEvents(toEvents().map((e) => ({ id: e.id, kind: e.kind, startMs: e.startMs, endMs: e.endMs })));
    expect(getDatedEvents()).toHaveLength(17);
    setDatedEvents(null);
    expect(getDatedEvents()).toEqual([]);
  });

  it('the League window list of the game is unchanged by dated events that are over (a League event is never touched)', () => {
    setDatedEvents(toEvents());
    const epoch = Date.UTC(2026, 11, 29); // after the whole pre-season calendar
    const league = leagueEventWindows(epoch);
    expect(eventWindows(epoch).filter((w) => w.index < 1000)).toEqual(league);
  });
});

describe('the "Eventos" panel model with dated events', () => {
  it('before the League it shows the running dated event, the next one and the League preview; after it, the same clock', () => {
    setDatedEvents(toEvents());
    const save = defaultSave();
    const inv = seed.find((s) => s.id === 'invasion')!;
    const view = eventsView(null, inv.startMs + 2 * HOUR_MS, save);
    expect(view.mode).toBe('preseason');
    expect(view.current?.id).toBe('invasion');
    expect(view.next?.id).toBe('crafts_festival');
    expect(view.msToEnd).toBe(52 * HOUR_MS);
    expect(view.preview).toHaveLength(18);
    expect(view.leagueDay).toBe(0);
    // no calendar read (offline, or before the first answer): nothing running
    setDatedEvents([]);
    expect(eventsView(null, inv.startMs + 2 * HOUR_MS, save).current).toBeNull();
    expect(eventsView(undefined, inv.startMs, save).mode).toBe('hidden');
  });
});

describe('the Calendario model', () => {
  const NOW = Date.UTC(2026, 10, 7, 12);

  it('offline and loading and error are their own states', () => {
    expect(calendarView('offline', [], undefined, NOW).mode).toBe('offline');
    expect(calendarView('loading', [], undefined, NOW).mode).toBe('loading');
    expect(calendarView('error', [], undefined, NOW).mode).toBe('error');
    expect(calendarView('error', toEvents(), null, NOW).mode).toBe('ready'); // a failed refresh keeps what it knew
  });

  it('splits now / upcoming / past, with the countdowns, and lists the League in League days before it opens', () => {
    const v = calendarView('ready', toEvents(), null, NOW);
    expect(v.mode).toBe('ready');
    expect(v.current.map((e) => e.id)).toEqual(['invasion']);
    expect(v.upcoming[0].id).toBe('crafts_festival');
    expect(v.past.map((e) => e.id)).toEqual(['mining_fever', 'launch_festival']); // most recent first
    expect(v.entries).toHaveLength(17);
    expect(v.msToEnd).toBe(seed.find((s) => s.id === 'invasion')!.endMs - NOW);
    expect(v.msToNext).toBe(seed.find((s) => s.id === 'crafts_festival')!.startMs - NOW);
    expect(v.leaguePreview).toHaveLength(18);
    expect(v.leaguePreview![0]).toMatchObject({ id: 'invasion', fromDay: 3, toDay: 4 });
  });

  it('once the League opened its events have real dates and the pre-season ones stop where it begins', () => {
    const epoch = seed.find((s) => s.id === 'target_hunt')!.startMs + 10 * HOUR_MS;
    const v = calendarView('ready', toEvents(), epoch, epoch + DAY_MS);
    expect(v.leaguePreview).toBeNull();
    expect(v.entries.filter((e) => e.source === 'league')).toHaveLength(18);
    expect(v.entries.filter((e) => e.source === 'preseason').every((e) => e.endMs <= epoch)).toBe(true);
    for (let i = 1; i < v.entries.length; i++) expect(v.entries[i].startMs).toBeGreaterThanOrEqual(v.entries[i - 1].endMs);
  });

  it('the month grid has whole weeks, marks the other months, and puts each event on the local days it touches', () => {
    const v = calendarView('ready', toEvents(), null, NOW);
    const { year, month } = monthOf(NOW);
    const weeks = monthGrid(year, month, v.entries);
    expect(weeks.length).toBeGreaterThanOrEqual(4);
    for (const w of weeks) expect(w).toHaveLength(7);
    const flat = weeks.flat();
    expect(flat.filter((d) => d.inMonth)).toHaveLength(30); // November
    const withInvasion = flat.filter((d) => d.entries.some((e) => e.id === 'invasion'));
    expect(withInvasion.length).toBeGreaterThanOrEqual(3);
    expect(withInvasion.length).toBeLessThanOrEqual(4); // Friday evening to Sunday night, in any time zone a player can have
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
  });

  it('the end of an event is shown a minute early (it ends at midnight: the screen says 23:59)', () => {
    const localMidnight = new Date(2026, 10, 9, 0, 0).getTime(); // whatever the player's time zone, an event that ends at local midnight reads 23:59
    expect(formatEnd(localMidnight, 'en')).toMatch(/23:59/);
  });
});

describe('the Calendario screen', () => {
  const render = () => renderToStaticMarkup(h(CalendarScreen));

  it('says "only in the online game" when there is no backend (offline / desktop)', async () => {
    await loadEventCalendar(async () => [], false);
    const html = render();
    expect(html).toContain('data-testid="calendar-offline"');
    expect(html).toContain('Eventos só no jogo online');
    expect(html).not.toContain('data-testid="cal-month"');
    setLocale('en');
    expect(render()).toContain('Events are only in the online game');
  });

  it('shows the loading and the error states', async () => {
    expect(render()).toContain('data-testid="calendar-loading"');
    await loadEventCalendar(async () => Promise.reject(new Error('x')), true);
    expect(render()).toContain('data-testid="calendar-error"');
  });

  it('draws the month, the legend, Agora / Proximos / Passados and the League in League days, with the countdowns', () => {
    applyCalendarEvents(toEvents());
    const html = render();
    expect(html).toContain('data-testid="cal-month"');
    expect(html).toContain('data-testid="cal-bar"');
    expect(html).toContain('Herói');
    expect(html).toContain('Profissão');
    expect(html).toContain('Final');
    expect(html).toContain('Invasão de Monstros');
    expect(html).toContain('data-testid="cal-now"');
    expect(html).toContain('Termina em'); // the running event
    expect(html).toContain('Começa em'); // the next one
    expect(html).toContain('data-testid="cal-upcoming"');
    expect(html).toContain('data-testid="cal-past"');
    expect(html).toContain('data-testid="cal-league"');
    expect(html).toContain('As datas aparecem quando a Liga abrir');
    expect(html).not.toMatch(/\/h\b|drop rate|%\s*de\s*chance/i);
  });

  it('works in English and has a name and a bonus line for every event', () => {
    setLocale('en');
    applyCalendarEvents(toEvents());
    const html = render();
    expect(html).toContain('Monster Invasion');
    expect(html).toContain('Ends in');
    expect(html).toContain('Starts in');
    expect(html).toContain('The dates appear when the League opens');
    expect(Object.keys((pt as unknown as { calendar: object }).calendar).sort()).toEqual(Object.keys((en as unknown as { calendar: object }).calendar).sort());
  });

  it('DEV mock: the sample calendar exists, is in the server shape, and loads only from ?calendarMock=1', () => {
    expect(applyDevMockFromUrl('?x=1')).toBe(false);
    expect(devMockCalendar(Date.now()).length).toBeGreaterThan(3);
    expect(applyDevMockFromUrl('?calendarMock=1')).toBe(true);
    expect(getDatedEvents().length).toBeGreaterThan(3);
  });
});

describe('a Hunting session under a dated event', () => {
  const strong = (): SaveData => ({ ...hero('5', 8, { level: 100, rarity: 'legendary' }), xp: xpToReachLevel(100), highestDungeonFloor: 100 });
  const run = (withEvent: boolean) => {
    const w = seed.find((s) => s.id === 'launch_festival')!;
    const now = w.startMs + 5 * HOUR_MS;
    const startedAt = now - 3 * HOUR_MS;
    vi.setSystemTime(now);
    const base = { ...strong(), huntProgress: { 'blood_abyss:shallow': { ceiling: 6, promotionWins: 0 } } };
    setDatedEvents(withEvent ? toEvents().map((e) => ({ id: e.id, kind: e.kind, startMs: e.startMs, endMs: e.endMs })) : []);
    const started = applyHuntStart(base, 'blood_abyss', 'shallow', startedAt)!;
    return { started, status: computeHuntingStatus(started, now) };
  };

  it('plays the Festival de Abertura rules: a little more XP (the streak, capped), no League clock needed, and the session carries the window it started under', () => {
    const plain = run(false);
    const event = run(true);
    const ratio = event.status.xpReady / plain.status.xpReady;
    expect(ratio).toBeGreaterThan(1.05);
    expect(ratio).toBeLessThanOrEqual(1.1 + 1e-9); // the cap of the hero events
    expect(event.started.huntSession!.league).toBeUndefined();
    expect(event.started.huntSession!.datedEvents).toEqual([expect.objectContaining({ id: 'launch_festival', kind: 'hero' })]);
    expect(plain.started.huntSession!.datedEvents).toBeUndefined();
    // it survives a reload, and a garbled copy is dropped
    expect(sanitizeHuntSession(JSON.parse(JSON.stringify(event.started.huntSession)))!.datedEvents).toEqual(event.started.huntSession!.datedEvents);
    const broken = JSON.parse(JSON.stringify(event.started.huntSession));
    broken.datedEvents = [{ id: 'launch_festival', kind: 'wizard', startMs: 1, endMs: 2 }, 'x', { id: 7 }];
    expect(sanitizeHuntSession(broken)!.datedEvents).toBeUndefined();
  });
});
