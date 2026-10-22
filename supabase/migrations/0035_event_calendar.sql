-- Event calendar (docs/EVENT_CALENDAR.md): events on REAL DATES for the pre-season, a lighter first month of League events, and one public read function for the game and the portal.
--
--   * arena_private.event_calendar is the owner's table of DATED events (Brasilia time, written with an explicit -03 offset). Rows are seeded below: the launch festival (31/10 to 02/11) and eight weeks
--     of rhythm (a weekend hero event Friday 18h to Sunday 23h59, a profession day on Wednesday). The owner adds, moves or removes rows by SQL (docs/SEASON_RANKING.md, "Calendario de eventos"). `kind` is
--     filled from event_id by a trigger, and the trigger refuses two events that overlap in time (one event at a time).
--   * public.calendar_events(p_from, p_to) is the READ: it returns the dated pre-season events AND the League events converted to real dates (starts_at / ends_at) once the League has opened
--     (arena_private.season_goal.reset_at, the same moment public.league_reset_at() hands out). The pre-season events STOP by themselves when the League opens: a row that starts after the
--     opening is not returned, one that is running is cut at the opening (ends_at = reset_at). An event never overlaps the League reset. Before the League opens the League events carry no dates and are
--     not returned (the game shows them as "Liga: dia N" from its own table, src/game/leagueEvents.ts).
--   * public.league_events() is REPLACED with the new League calendar: the 12 events of days 25 to 60 (unchanged, now slots 7 to 18) plus a lighter first month, days 3 to 23 (six events: three hero, three
--     profession, one weekend-like hero event per week and a profession day, a day of rest between two events). src/game/leagueEvents.ts LEAGUE_EVENT_SLOTS is the same table; migration0014.test.ts
--     compares them cell by cell. The return type is the same as in 0014.
--   * Nothing about any player is exposed. The game applies the dated events with the SAME rules and caps as the League events; the anti-cheat (submit-progress) reads this table through
--     calendar_events() and widens its allowance only for the hours an event really ran.
--
-- Idempotent: the table is created if missing, the seed skips rows that exist (same event and start), functions are replaced.
--
-- NOT APPLIED by the work that wrote this file: the director applies it (npx supabase@2.121.0 db push) and redeploys submit-progress (it reads the calendar for the anti-cheat).
--
-- ROLLBACK (by hand; nothing else depends on these objects):
--   drop function if exists public.calendar_events(timestamptz, timestamptz);
--   drop table if exists arena_private.event_calendar;
--   drop function if exists arena_private.event_calendar_guard();
--   -- and put the 12-event League calendar back: re-run the `create or replace function public.league_events()` block of 0014_economy_events.sql.

create schema if not exists arena_private;

create table if not exists arena_private.event_calendar (
  id bigint generated always as identity primary key,
  event_id text not null,
  kind text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text,
  created_at timestamptz not null default pg_catalog.now(),
  constraint event_calendar_event_check check (event_id in ('launch_festival', 'invasion', 'target_hunt', 'dungeon_race', 'grand_delivery', 'time_rift', 'mining_fever', 'crafts_festival', 'profession_week')),
  constraint event_calendar_kind_check check (kind in ('hero', 'profession')),
  constraint event_calendar_order_check check (ends_at > starts_at),
  constraint event_calendar_length_check check (ends_at - starts_at <= pg_catalog.make_interval(days => 7)),
  constraint event_calendar_start_unique unique (starts_at)
);

-- kind follows event_id (the owner never has to write it), and two events never overlap.
create or replace function arena_private.event_calendar_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.kind := case
    when new.event_id in ('launch_festival', 'invasion', 'target_hunt', 'dungeon_race', 'grand_delivery', 'time_rift') then 'hero'
    when new.event_id in ('mining_fever', 'crafts_festival', 'profession_week') then 'profession'
    else new.kind
  end;
  if exists (
    select 1 from arena_private.event_calendar as e
    where e.id is distinct from new.id and e.starts_at < new.ends_at and e.ends_at > new.starts_at
  ) then
    raise exception 'event_calendar: this event overlaps another one (one event at a time)' using errcode = '23P01';
  end if;
  return new;
end;
$$;

drop trigger if exists event_calendar_guard on arena_private.event_calendar;
create trigger event_calendar_guard
  before insert or update on arena_private.event_calendar
  for each row execute function arena_private.event_calendar_guard();

alter table arena_private.event_calendar enable row level security;
revoke all on table arena_private.event_calendar from public, anon, authenticated;
grant select, insert, update, delete on table arena_private.event_calendar to service_role;

-- The seed: Brasilia time (-03). Festival de Abertura 31/10 00h to 02/11 23h59; then Wednesdays (profession day, 24 to 48 h) and Fridays 18h to Sunday 23h59 (hero event).
insert into arena_private.event_calendar (event_id, kind, starts_at, ends_at, note)
select v.event_id, v.kind, v.starts_at::timestamptz, v.ends_at::timestamptz, v.note
from (
  values
    ('launch_festival', 'hero', '2026-10-31 00:00-03', '2026-11-03 00:00-03', 'Festival de Abertura'),
    ('mining_fever', 'profession', '2026-11-04 00:00-03', '2026-11-05 00:00-03', 'Dia de profissao'),
    ('invasion', 'hero', '2026-11-06 18:00-03', '2026-11-09 00:00-03', 'Fim de semana'),
    ('crafts_festival', 'profession', '2026-11-11 00:00-03', '2026-11-13 00:00-03', 'Dia de profissao'),
    ('target_hunt', 'hero', '2026-11-13 18:00-03', '2026-11-16 00:00-03', 'Fim de semana'),
    ('profession_week', 'profession', '2026-11-18 00:00-03', '2026-11-20 00:00-03', 'Dia de profissao'),
    ('dungeon_race', 'hero', '2026-11-20 18:00-03', '2026-11-23 00:00-03', 'Fim de semana'),
    ('mining_fever', 'profession', '2026-11-25 00:00-03', '2026-11-26 00:00-03', 'Dia de profissao'),
    ('time_rift', 'hero', '2026-11-27 18:00-03', '2026-11-30 00:00-03', 'Fim de semana'),
    ('crafts_festival', 'profession', '2026-12-02 00:00-03', '2026-12-04 00:00-03', 'Dia de profissao'),
    ('grand_delivery', 'hero', '2026-12-04 18:00-03', '2026-12-07 00:00-03', 'Fim de semana'),
    ('profession_week', 'profession', '2026-12-09 00:00-03', '2026-12-11 00:00-03', 'Dia de profissao'),
    ('invasion', 'hero', '2026-12-11 18:00-03', '2026-12-14 00:00-03', 'Fim de semana'),
    ('mining_fever', 'profession', '2026-12-16 00:00-03', '2026-12-17 00:00-03', 'Dia de profissao'),
    ('target_hunt', 'hero', '2026-12-18 18:00-03', '2026-12-21 00:00-03', 'Fim de semana'),
    ('crafts_festival', 'profession', '2026-12-23 00:00-03', '2026-12-25 00:00-03', 'Dia de profissao'),
    ('dungeon_race', 'hero', '2026-12-25 18:00-03', '2026-12-28 00:00-03', 'Fim de semana')
) as v(event_id, kind, starts_at, ends_at, note)
where not exists (select 1 from arena_private.event_calendar as e where e.event_id = v.event_id and e.starts_at = v.starts_at::timestamptz);

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The League calendar (days 3 to 60), replacing the 12-event one of 0014. Hours are counted from the League opening (League day 1 starts at hour 0, day 3 at hour 48, day 25 at hour 576).
-- ---------------------------------------------------------------------------------------------------------------------------------------
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
      (1, 'invasion', 'hero', 48, 48),
      (2, 'mining_fever', 'profession', 120, 24),
      (3, 'dungeon_race', 'hero', 216, 36),
      (4, 'crafts_festival', 'profession', 288, 48),
      (5, 'target_hunt', 'hero', 384, 48),
      (6, 'profession_week', 'profession', 480, 72),
      (7, 'invasion', 'hero', 576, 48),
      (8, 'mining_fever', 'profession', 648, 24),
      (9, 'target_hunt', 'hero', 696, 48),
      (10, 'profession_week', 'profession', 768, 72),
      (11, 'dungeon_race', 'hero', 864, 36),
      (12, 'crafts_festival', 'profession', 936, 48),
      (13, 'grand_delivery', 'hero', 1008, 24),
      (14, 'mining_fever', 'profession', 1056, 24),
      (15, 'time_rift', 'hero', 1104, 24),
      (16, 'profession_week', 'profession', 1152, 72),
      (17, 'invasion', 'hero', 1248, 48),
      (18, 'final_race', 'final', 1320, 120)
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
-- The read: dated pre-season events + League events with real dates, between p_from and p_to (either may be null = no limit), ordered by start.
--   source 'preseason': a row of arena_private.event_calendar (slot = its id, no League days), cut at the League opening when there is one.
--   source 'league'   : a League event with real dates (only once the League has opened; league_day_from / league_day_to say which League days it covers).
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.calendar_events(p_from timestamptz default null, p_to timestamptz default null)
returns table (
  source text,
  slot integer,
  event_id text,
  kind text,
  starts_at timestamptz,
  ends_at timestamptz,
  hours integer,
  league_day_from integer,
  league_day_to integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with opened as (
    select (select g.reset_at from arena_private.season_goal as g where g.id) as reset_at
  ),
  merged as (
    select
      'preseason'::text as source,
      e.id::integer as slot,
      e.event_id,
      e.kind,
      e.starts_at,
      least(e.ends_at, coalesce(o.reset_at, e.ends_at)) as ends_at,
      null::integer as league_day_from,
      null::integer as league_day_to
    from arena_private.event_calendar as e
    cross join opened as o
    where o.reset_at is null or e.starts_at < o.reset_at
    union all
    select 'league'::text, l.slot, l.event_id, l.kind, l.starts_at, l.ends_at, l.league_day_from, l.league_day_to
    from public.league_events() as l
    where l.starts_at is not null
  )
  select
    m.source,
    m.slot,
    m.event_id,
    m.kind,
    m.starts_at,
    m.ends_at,
    pg_catalog.round(pg_catalog.date_part('epoch', m.ends_at - m.starts_at) / 3600)::integer as hours,
    m.league_day_from,
    m.league_day_to
  from merged as m
  where (p_from is null or m.ends_at > p_from) and (p_to is null or m.starts_at < p_to)
  order by m.starts_at, m.source;
$$;

revoke all on function public.calendar_events(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.calendar_events(timestamptz, timestamptz) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- SQL TEST PLAN (run in the SQL editor of the DEVELOPMENT project after applying this file)
-- ---------------------------------------------------------------------------------------------------------------------------------------
-- A. Before the League opens (arena_private.season_goal.reset_at is null), as anon: `select * from public.calendar_events();` -> 17 rows, all source 'preseason', first = launch_festival
--    2026-10-31 00:00-03 to 2026-11-03 00:00-03 (72 h), last = dungeon_race ending 2026-12-28 00:00-03. `select count(*) from public.league_events();` -> 18 (starts_at null).
-- B. Window filter: `select count(*) from public.calendar_events('2026-11-04 00:00-03', '2026-11-10 00:00-03');` -> 2 (the Wednesday mining_fever and the weekend invasion).
-- C. Overlap guard: `insert into arena_private.event_calendar (event_id, starts_at, ends_at) values ('invasion', '2026-11-04 12:00-03', '2026-11-05 12:00-03');` -> error (overlaps mining_fever);
--    the same insert at a free time works and kind is filled in ('hero'); delete it afterwards.
-- D. League opening: after the League opens (reset_at = R), `select * from public.calendar_events();` has NO preseason row that starts at or after R, the one running at R ends exactly at R, and 18
--    'league' rows start at R + 48 h (slot 1) ... R + 1320 h (slot 18, 120 h). Nothing 'preseason' overlaps a 'league' row.
-- E. Private: as anon `select * from arena_private.event_calendar;` -> permission denied; `select * from public.calendar_events();` works. The functions expose only the calendar.
