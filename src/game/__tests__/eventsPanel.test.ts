import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EventsPanel from '../../components/events/EventsPanel';
import { countdown, eventsView } from '../../components/events/eventsModel';
import { defaultSave } from '../engine';
import { readLeagueResetAt, resetKnownLeagueResetAt } from '../leagueReset';
import { getLeagueEpoch } from '../leagueClock';
import { DAY_MS, HOUR_MS, leagueEventWindows } from '../leagueEvents';
import { setLocale } from '../../locales';

// The "Eventos" panel: what the model says in every state of the League clock, and the markup in both languages.
const EPOCH = Date.UTC(2026, 9, 20);
// the nth event of that id from League day 25 on (the light weeks before it are tested in leagueEvents.test.ts)
const win = (id: string, nth = 0) => leagueEventWindows(EPOCH).filter((w) => w.id === id && w.startMs >= EPOCH + 24 * DAY_MS)[nth];
const save = defaultSave();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  setLocale('pt');
});
afterEach(() => {
  vi.useRealTimers();
  resetKnownLeagueResetAt();
});

describe('the model', () => {
  it('shows nothing without a League clock (offline / not asked), the calendar before the League opens, the running event during it', () => {
    expect(eventsView(undefined, EPOCH, save).mode).toBe('hidden');
    const pre = eventsView(null, EPOCH, save);
    expect(pre.mode).toBe('preseason');
    expect(pre.preview).toHaveLength(18);
    expect(pre.current).toBeNull();
    const inv = win('invasion');
    const run = eventsView(EPOCH, inv.startMs + 2 * HOUR_MS, save);
    expect(run.mode).toBe('running');
    expect(run.current?.id).toBe('invasion');
    expect(run.next?.id).toBe('mining_fever');
    expect(run.msToEnd).toBe(46 * HOUR_MS);
    expect(run.msToNext).toBe(win('mining_fever').startMs - (inv.startMs + 2 * HOUR_MS));
    expect(run.leagueDay).toBe(25);
  });

  it('between events it waits for the next, and after the last one it is over', () => {
    const wait = eventsView(EPOCH, win('invasion').endMs + HOUR_MS, save);
    expect(wait.mode).toBe('waiting');
    expect(wait.next?.id).toBe('mining_fever');
    expect(wait.msToNext).toBe(win('mining_fever').startMs - (win('invasion').endMs + HOUR_MS));
    expect(eventsView(EPOCH, EPOCH + 23.5 * DAY_MS, save).mode).toBe('waiting'); // the rest day before day 25
    expect(eventsView(EPOCH, EPOCH + 61 * DAY_MS, save).mode).toBe('over');
  });

  it('the Semana das Profissoes opens the pick until one is made, and lists the buffs still running', () => {
    const week = win('profession_week');
    const now = week.startMs + 5 * HOUR_MS;
    expect(eventsView(EPOCH, now, save).pick).toEqual({ open: true, chosen: null });
    const picked = { ...save, eventPick: { at: week.startMs, profession: 'mining' as const } };
    expect(eventsView(EPOCH, now, picked).pick).toEqual({ open: false, chosen: 'mining' });
    const buffed = { ...save, eventBuffs: { grand_delivery: { from: now - HOUR_MS, to: now + 2 * HOUR_MS, pct: 0.1 } } };
    expect(eventsView(EPOCH, now, buffed).buffs).toEqual([{ pct: 0.1, msLeft: 2 * HOUR_MS }]);
    expect(eventsView(EPOCH, now + 3 * HOUR_MS, buffed).buffs).toEqual([]);
  });

  it('formats a countdown as days and hours, hours and minutes, or minutes', () => {
    expect(countdown(2 * DAY_MS + 5 * HOUR_MS + 1)).toBe('2d 05h');
    expect(countdown(5 * HOUR_MS + 12 * 60_000)).toBe('5h12');
    expect(countdown(12 * 60_000 - 1)).toBe('12min');
    expect(countdown(-5)).toBe('0min');
  });
});

describe('the panel', () => {
  const render = (extra: Partial<typeof save> = {}) => renderToStaticMarkup(h(EventsPanel, { save: { ...save, ...extra }, onPickProfession: () => undefined }));

  it('renders nothing until the League clock is known (the offline / desktop build never knows it)', () => {
    vi.setSystemTime(EPOCH);
    expect(render()).toBe('');
  });

  it('before the League opens it says "na Liga" and offers the calendar, in both languages', async () => {
    vi.setSystemTime(EPOCH);
    await readLeagueResetAt({ fetchAt: async () => null, storage: null });
    expect(getLeagueEpoch()).toBeNull();
    const pt = render();
    expect(pt).toContain('data-testid="events-preseason"');
    expect(pt).toContain('Eventos');
    expect(pt).toContain('dias 3 a 60');
    expect(pt).toContain('Ver calend');
    setLocale('en');
    const en = render();
    expect(en).toContain('Events');
    expect(en).toContain('from day 3 to 60');
  });

  it('during an event it shows its name, its line, how long is left, the next event and the cap', async () => {
    const inv = win('invasion');
    vi.setSystemTime(inv.startMs + 2 * HOUR_MS);
    await readLeagueResetAt({ fetchAt: async () => EPOCH, storage: null });
    expect(getLeagueEpoch()).toBe(EPOCH);
    const html = render();
    expect(html).toContain('data-testid="events-running"');
    expect(html).toContain('Invasão de Monstros');
    expect(html).toContain('Termina em 1d 22h');
    expect(html).toContain('Febre da Mineração');
    expect(html).toContain('Começa em');
    expect(html).toContain('+15%');
    setLocale('en');
    expect(render()).toContain('Monster Invasion');
  });

  it('the Semana das Profissoes shows the three professions to pick from, then the chosen one', async () => {
    const week = win('profession_week');
    vi.setSystemTime(week.startMs + 3 * HOUR_MS);
    await readLeagueResetAt({ fetchAt: async () => EPOCH, storage: null });
    const open = render();
    expect(open).toContain('data-testid="events-pick"');
    expect(open).toContain('Mineração');
    expect(open).toContain('Lenhador');
    expect(open).toContain('Horta');
    const done = render({ eventPick: { at: week.startMs, profession: 'gardening' } });
    expect(done).toContain('Profissão da semana: Horta');
    expect(done).not.toContain('ev-pick-btn');
  });

  it('between events it says there is none now and when the next starts; after the calendar it says it is over', async () => {
    vi.setSystemTime(win('invasion').endMs + 3 * HOUR_MS);
    await readLeagueResetAt({ fetchAt: async () => EPOCH, storage: null });
    const wait = render();
    expect(wait).toContain('Nenhum evento agora');
    expect(wait).toContain('data-testid="events-next"');
    vi.setSystemTime(EPOCH + 62 * DAY_MS);
    expect(render()).toContain('acabaram');
  });
});
