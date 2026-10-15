-- The first paid League starts every online hero from zero (depends on 0004 progress_snapshots, 0006 seasons / season_goal, 0007 has_open_flags / progress_rate).
--
-- OWNER DECISION (2026-10-15): the pre-season is an open test. When the FIRST paid League opens (the automatic opening when the Pass bar fills, or the owner opening it by hand),
-- every ONLINE hero is reset to zero, once. Later Leagues do not reset. The Pass (a server entitlement) and the username (profiles) are not touched. The offline / desktop build has no
-- Supabase and is not affected.
--
-- HOW IT WORKS
--   * arena_private.season_goal.reset_at (timestamptz, null until the first League opens) is THE reset epoch. It is written in exactly ONE place: the trigger function
--     arena_private.stamp_league_reset(), which fires when a RANKED season becomes 'open' (INSERT with status 'open', or UPDATE to 'open'). Because arena_private.open_paid_season()
--     (the automatic goal AND the owner's manual `select arena_private.open_paid_season(1)`) and a hand `update public.seasons set status = 'open'` all end in that UPDATE, every
--     opening path stamps it, and `where reset_at is null` plus a guard trigger make it a set-once value: no later League, no second opening, no later update can move or clear it.
--   * public.league_reset_at() hands that timestamp (and nothing else) to anon / authenticated. The game reads it on login and on resume (src/game/leagueReset.ts) and replaces any
--     save that predates it with a fresh hero, keeping the account, the username and the Pass.
--   * The progress audit (supabase/functions/_shared/progress/) treats only snapshots created at or after reset_at as history: baselines, peaks, the per-user rate limit and the account
--     age used for pace all restart at reset_at. A post-reset first snapshot that is ahead of what is reachable since reset_at is REJECTED (a flag-only verdict before the reset).
--   * Lifetime flags (arena_private.has_open_flags) only count snapshots from reset_at on: a tester flagged during the open test starts the League clean.
--   * public.my_pioneer() answers true for the signed-in player when the account had at least one accepted ('ok') snapshot before reset_at: the game grants the cosmetic title
--     "Pioneiro" from it when it resets the hero. The answer is read-only, derived from append-only data, and carries no stats.
--
-- NOT APPLIED by the work that wrote this file. The owner applies it (SQL editor or `supabase db push`), in the DEVELOPMENT project first, AFTER 0008. It was never run against a real
-- database: only read by static tests (supabase/functions/_shared/__tests__/migration0009.test.ts). The SQL TEST PLAN at the end is what proves it for real.
--
-- IF THE LEAGUE IS ALREADY OPEN when this is applied, nothing stamps reset_at and nobody is reset. To hold the reset anyway (once): update arena_private.season_goal set reset_at = now();
--
-- ROLLBACK (by hand; reset_at is set-once on purpose, so disable the guard first. Players already reset keep their fresh hero: rollback does not bring old saves back):
--   drop trigger if exists seasons_stamp_league_reset on public.seasons;
--   drop function if exists arena_private.stamp_league_reset();
--   drop function if exists public.my_pioneer();
--   drop function if exists public.league_reset_at();
--   alter table arena_private.season_goal disable trigger season_goal_reset_once;
--   update arena_private.season_goal set reset_at = null;
--   drop trigger if exists season_goal_reset_once on arena_private.season_goal;
--   drop function if exists arena_private.season_goal_reset_once();
--   alter table arena_private.season_goal drop column if exists reset_at;
--   -- and re-run the `create or replace function arena_private.has_open_flags` block of 0007 (without the reset_at condition); put the previous Edge Function build back.

create schema if not exists arena_private;
revoke all on schema arena_private from public, anon, authenticated;
grant usage on schema arena_private to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The epoch: set once, by the opening path only
-- ---------------------------------------------------------------------------------------------------------------------------------------
alter table arena_private.season_goal add column if not exists reset_at timestamptz;

-- Set-once guard: once reset_at has a value, no statement (not even the owner's) can change or clear it. Setting it from null is the only allowed move.
create or replace function arena_private.season_goal_reset_once()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.reset_at is not null and new.reset_at is distinct from old.reset_at then
    raise exception using errcode = '23514', message = 'LEAGUE_RESET_IS_SET_ONCE';
  end if;
  return new;
end;
$$;

revoke all on function arena_private.season_goal_reset_once() from public, anon, authenticated;

drop trigger if exists season_goal_reset_once on arena_private.season_goal;
create trigger season_goal_reset_once
  before update on arena_private.season_goal
  for each row
  execute function arena_private.season_goal_reset_once();

-- THE ONLY place that writes reset_at. Fires when a ranked season becomes 'open'. The first time it stamps the epoch (and clears the snapshot rate limit so a fresh hero can post at
-- once); every later time `where reset_at is null` matches nothing and it does nothing.
create or replace function arena_private.stamp_league_reset()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'ranked' and new.status = 'open' and (tg_op = 'INSERT' or old.status is distinct from 'open') then
    update arena_private.season_goal set reset_at = pg_catalog.now() where id and reset_at is null;
    if found then
      delete from arena_private.progress_rate where true;
    end if;
  end if;
  return null;
end;
$$;

revoke all on function arena_private.stamp_league_reset() from public, anon, authenticated;

drop trigger if exists seasons_stamp_league_reset on public.seasons;
create trigger seasons_stamp_league_reset
  after insert or update of status on public.seasons
  for each row
  execute function arena_private.stamp_league_reset();

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The public read: only the timestamp (null = the League has not opened, nobody was reset)
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.league_reset_at()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select g.reset_at from arena_private.season_goal as g where g.id;
$$;

revoke all on function public.league_reset_at() from public, anon, authenticated;
grant execute on function public.league_reset_at() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Thanks for the testers: "Pioneiro" (cosmetic title). True when the caller had an accepted snapshot before the reset.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.my_pioneer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select exists (
        select 1 from public.progress_snapshots as s
        where s.user_id = (select auth.uid()) and s.verdict = 'ok' and s.created_at < g.reset_at
      )
     from arena_private.season_goal as g
     where g.id and g.reset_at is not null),
    false
  );
$$;

revoke all on function public.my_pioneer() from public, anon, authenticated;
grant execute on function public.my_pioneer() to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Lifetime flags start at the reset: only a flagged / rejected snapshot created at or after reset_at is an open flag.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function arena_private.has_open_flags(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.progress_snapshots as s
    where s.user_id = p_user_id
      and s.verdict <> 'ok'
      and s.created_at >= coalesce((select g.reset_at from arena_private.season_goal as g where g.id), '-infinity'::timestamptz)
      and not exists (select 1 from public.progress_flag_clears as c where c.snapshot_id = s.id)
  );
$$;

revoke all on function arena_private.has_open_flags(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- SQL TEST PLAN (run after applying; nothing here is run automatically).
--
-- A. Before the League: `select public.league_reset_at();` as anon -> null. `select * from arena_private.season_goal;` as anon -> permission denied for schema arena_private.
--    As authenticated, `select public.my_pioneer();` -> false.
-- B. Opening by the goal stamps it once: `update arena_private.season_goal set target = 1;` insert one paid active livemode stripe entitlement -> season 1 'open' and
--    `select public.league_reset_at();` returns that moment (equal to season 1's starts_at, within the same transaction clock). `select count(*) from arena_private.progress_rate;` -> 0.
-- C. Opening by hand stamps it: on a fresh project `select arena_private.open_paid_season(1);` -> the same stamp. So does `update public.seasons set status = 'open' where number = 1 and status <> 'open';`.
-- D. Set-once: after B, `update arena_private.season_goal set reset_at = null;` -> LEAGUE_RESET_IS_SET_ONCE; `update arena_private.season_goal set reset_at = now();` -> same error.
--    Close season 1 by hand, set season_goal.season_number = 2, opened_at = null, and open season 2 (open_paid_season(2)): reset_at is unchanged (later Leagues do not reset).
-- E. The pre-season does not stamp: reopening season 0 (`update public.seasons set status = 'open' where number = 0;`) leaves reset_at null on a project where no ranked season ever opened.
-- F. Public surface: as anon `select public.league_reset_at();` works; `select public.my_pioneer();` -> permission denied; as authenticated both work. Neither exposes any other column.
-- G. Pioneer: with reset_at set, a user with an 'ok' snapshot whose created_at < reset_at -> my_pioneer() true; a user whose only snapshots are flagged / rejected, or were created after
--    reset_at, or who has none -> false.
-- H. Flags restart: a user with a 'rejected' snapshot before reset_at and none after -> arena_private.has_open_flags(user) false; with a 'flagged' one after reset_at -> true; after
--    public.progress_clear_flags(...) -> false again.
-- I. Account age / baselines (Edge Function, see supabase/functions/_shared/__tests__/progress.test.ts): a level-80 save posted after reset_at, with no snapshot since reset_at, is
--    REJECTED (BASELINE_AHEAD_OF_ACCOUNT_AGE); a default save is 'ok'; the 10 minute rate limit is not carried over from before the reset.
-- ---------------------------------------------------------------------------------------------------------------------------------------
