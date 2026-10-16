-- League events (Rodada 22, docs/SEASON_RANKING.md "Eventos da Liga"): the calendar of days 25 to 60 of the League, readable by the portal.
--
--   * public.league_events() returns the calendar, one row per event, in order: the slot (1..12), the event id, its kind ('hero', 'profession' or 'final'), the League days it covers, its length in
--     hours and, once the League has opened, the moments it starts and ends (the server's League opening, public.league_reset_at() of 0009, plus fixed offsets). BEFORE the League opens the
--     two timestamps are null and the days are still there: the game and the portal show the calendar as "na Liga" (in the League).
--   * It is READ-ONLY and holds NO state: the events live in the game (src/game/leagueEvents.ts) and this function is the same table, so the portal can announce what the game plays.
--     supabase/functions/_shared/__tests__/migration0014.test.ts compares the rows below with LEAGUE_EVENT_SLOTS cell by cell: change one and the test fails until the other follows.
--   * Nothing is written, nothing about any player is exposed: only the calendar and the public League opening moment that league_reset_at() already hands out.
--
-- One event at a time, hero and profession events taking turns, a day of rest between two events, the Corrida Final in the last five days. Hours are counted from the League opening
-- (League day 1 starts at hour 0, League day 25 at hour 576, League day 56 at hour 1320).
--
-- NOT APPLIED by the work that wrote this file, and NEVER RUN against a real database: only read by static tests (migration0014.test.ts). The owner applies it AFTER 0013, in the DEVELOPMENT
-- project first, and runs the SQL TEST PLAN at the end. It changes no table and no existing function, so it can be applied at any time, before or after the League opens.
--
-- ROLLBACK (by hand; nothing depends on the function):
--   drop function if exists public.league_events();

create or replace function public.league_events()
returns table (
  slot integer,
  event_id text,
  kind text,
  league_day_from integer,
  league_day_to integer,
  hours integer,
  starts_at timestamptz,
  ends_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with cal(slot, event_id, kind, start_hour, hours) as (
    values
      (1, 'invasion', 'hero', 576, 48),
      (2, 'mining_fever', 'profession', 648, 24),
      (3, 'target_hunt', 'hero', 696, 48),
      (4, 'profession_week', 'profession', 768, 72),
      (5, 'dungeon_race', 'hero', 864, 36),
      (6, 'crafts_festival', 'profession', 936, 48),
      (7, 'grand_delivery', 'hero', 1008, 24),
      (8, 'mining_fever', 'profession', 1056, 24),
      (9, 'time_rift', 'hero', 1104, 24),
      (10, 'profession_week', 'profession', 1152, 72),
      (11, 'invasion', 'hero', 1248, 48),
      (12, 'final_race', 'final', 1320, 120)
  ),
  opened as (
    select (select g.reset_at from arena_private.season_goal as g where g.id) as reset_at
  )
  select
    c.slot,
    c.event_id,
    c.kind,
    (c.start_hour / 24) + 1 as league_day_from,
    ((c.start_hour + c.hours + 23) / 24) as league_day_to,
    c.hours,
    o.reset_at + pg_catalog.make_interval(hours => c.start_hour) as starts_at,
    o.reset_at + pg_catalog.make_interval(hours => c.start_hour + c.hours) as ends_at
  from cal as c
  cross join opened as o
  order by c.start_hour;
$$;

revoke all on function public.league_events() from public, anon, authenticated;
grant execute on function public.league_events() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- SQL TEST PLAN (run in the SQL editor of the DEVELOPMENT project after applying this file)
-- ---------------------------------------------------------------------------------------------------------------------------------------
-- A. Before the League opens (arena_private.season_goal.reset_at is null): `select * from public.league_events();` as anon -> 12 rows in slot order, league_day_from / league_day_to / hours
--    filled (slot 1: 25, 26, 48; slot 12: 56, 60, 120), starts_at and ends_at NULL on every row.
-- B. Open the League (the owner's usual path: public.seasons ranked -> open, which stamps reset_at). The same query now has starts_at = reset_at + start_hour hours and ends_at = starts_at + hours
--    hours; slot 1 starts exactly 24 days after the reset_at that `select public.league_reset_at();` returns, slot 12 ends exactly 60 days after it.
-- C. Order and gaps: `select count(*) from public.league_events() a join public.league_events() b on b.slot = a.slot + 1 where b.starts_at < a.ends_at;` -> 0 (one event at a time);
--    `select count(*) from public.league_events() a join public.league_events() b on b.slot = a.slot + 1 where a.kind = b.kind and a.kind <> 'final';` -> 0 (heroes and professions take turns);
--    `select count(*) from public.league_events() a join public.league_events() b on b.slot = a.slot + 1 where a.event_id = b.event_id;` -> 0 (never the same event twice in a row).
-- D. Read-only and public: as anon `select count(*) from public.league_events();` -> 12; `insert into public.league_events ...` is meaningless (it is a function). `select * from arena_private.season_goal;` as anon
--    still fails with permission denied (the function is security definer, the table stays private).
-- E. Nothing else changed: `select public.league_reset_at();` returns the same value as before this file.
