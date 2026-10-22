import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEAGUE_EVENT_SLOTS } from '../leagueEvents';
import { EVENT_SLOTS } from '../../../supabase/functions/_shared/progress/tables';

// (This test lives with the game's tests, not next to the Edge Functions: it compares the SQL with the game's own table, and the functions' strict compile must not pull the game in.)
// Migration 0014 created public.league_events(); migration 0035 (event calendar) REPLACED it with the calendar of days 3 to 60. These tests read the CURRENT definition (the one in 0035) and pin that its
// calendar IS the game's (src/game/leagueEvents.ts), cell by cell, and that the function is read-only and exposes nothing but the calendar. 0014 stays as the history (its own rows are the old 12 events).
// The SQL TEST PLAN at the end of each file is what proves it against a real database.

const root = resolve(__dirname, '../../..');
const sql014 = readFileSync(resolve(root, 'supabase/migrations/0014_economy_events.sql'), 'utf8');
const sql35 = readFileSync(resolve(root, 'supabase/migrations/0035_event_calendar.sql'), 'utf8').replace(/\r\n/g, '\n');
// the current definition of league_events(): the block of 0035 from its create to its grant
const fn = sql35.slice(sql35.indexOf('create or replace function public.league_events()'+String.fromCharCode(10)+'returns table'), sql35.indexOf('grant execute on function public.league_events()'));
const sql = fn + 'grant execute on function public.league_events() to anon, authenticated, service_role;\n';
const code = sql
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');

describe('0035 (replacing 0014): public.league_events()', () => {
  const rows = [...code.matchAll(/\((\d+), '(\w+)', '(\w+)', (\d+), (\d+)\)/g)].map((m) => ({ slot: Number(m[1]), id: m[2], kind: m[3], startHour: Number(m[4]), hours: Number(m[5]) }));

  it('has exactly the rows of the game\'s calendar, in order', () => {
    expect(rows).toHaveLength(LEAGUE_EVENT_SLOTS.length);
    rows.forEach((r, i) => {
      expect(r.slot).toBe(i + 1);
      expect({ id: r.id, kind: r.kind, startHour: r.startHour, hours: r.hours }).toEqual({ id: LEAGUE_EVENT_SLOTS[i].id, kind: LEAGUE_EVENT_SLOTS[i].kind, startHour: LEAGUE_EVENT_SLOTS[i].startHour, hours: LEAGUE_EVENT_SLOTS[i].hours });
    });
  });

  it('is the table the server\'s bounds use (progress/tables.ts is generated from the same game table)', () => {
    expect(EVENT_SLOTS.map((s) => ({ id: s.id, kind: s.kind, startHour: s.startHour, hours: s.hours }))).toEqual(rows.map((r) => ({ id: r.id, kind: r.kind, startHour: r.startHour, hours: r.hours })));
  });

  it('the days it reports are the League days the event covers', () => {
    expect(code).toContain('(c.start_hour / 24) + 1 as league_day_from');
    expect(code).toContain('((c.start_hour + c.hours + 23) / 24) as league_day_to');
  });

  it('the moments are the server\'s League opening plus fixed hours, and null before it opens', () => {
    expect(code).toContain('select (select g.reset_at from arena_private.season_goal as g where g.id) as reset_at');
    expect(code).toContain('o.reset_at + pg_catalog.make_interval(hours => c.start_hour) as starts_at');
    expect(code).toContain('o.reset_at + pg_catalog.make_interval(hours => c.start_hour + c.hours) as ends_at');
    expect(code).not.toContain('now()'); // no device-clock-like input: the calendar moves only with the League
  });

  it('is a read-only security-definer function with an empty search path, public to anon / authenticated, and writes nothing', () => {
    expect(code).toMatch(/create or replace function public\.league_events\(\)\s+returns table/);
    expect(code).toContain('language sql\nstable\nsecurity definer\nset search_path = \'\'');
    expect(code).toContain('revoke all on function public.league_events() from public, anon, authenticated;');
    expect(code).toContain('grant execute on function public.league_events() to anon, authenticated, service_role;');
    for (const bad of [/\binsert\s+into\b/i, /\bupdate\s+\w/i, /\bdelete\s+from\b/i, /\balter\s+table\b/i, /\bcreate\s+table\b/i, /\bdrop\s+(table|column)\b/i]) expect(code).not.toMatch(bad);
  });

  it('exposes the calendar and nothing about a player (the only table it reads is the private goal row, and only reset_at)', () => {
    expect(code.match(/arena_private\.\w+/g)).toEqual(['arena_private.season_goal']);
    expect(code.match(/\bg\.\w+/g)).toEqual(['g.reset_at', 'g.id']);
    expect(code).not.toMatch(/auth\.uid\(\)|user_id|characters|entitlements/);
  });

  it('carries its rollback and its SQL test plan, and says it was not applied', () => {
    expect(sql014).toContain('-- ROLLBACK (by hand');
    expect(sql014).toContain('drop function if exists public.league_events();');
    expect(sql014).toContain('-- SQL TEST PLAN');
    expect(sql35).toContain('-- ROLLBACK (by hand');
    expect(sql35).toContain('-- SQL TEST PLAN');
    expect(sql35).toContain('NOT APPLIED');
    expect(sql35).toContain('re-run the `create or replace function public.league_events()` block of 0014');
  });
});
