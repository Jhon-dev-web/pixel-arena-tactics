-- The public Pass meter stops publishing the number of Passes sold and the goal (depends on 0006 and 0007 being applied first).
--
-- WHY: the owner decided (2026-10-15) that the public site shows only a progress bar and the line "When the bar fills, the Season League begins". Neither the target (15 000) nor the
-- count of Passes sold may reach a visitor. pass_meter() was the one function anon could call that returned both (sold, target), so it is redefined here.
--
-- WHAT THIS DOES: drops and recreates public.pass_meter() with a new return shape. A function cannot change its OUT columns with `create or replace`, hence the drop.
--   BEFORE: (sold bigint, target integer, season_open boolean, starts_at timestamptz, ends_at timestamptz, updated_at timestamptz)
--   AFTER : (progress numeric, season_open boolean, starts_at timestamptz, ends_at timestamptz, updated_at timestamptz)
-- `progress` is the fraction paid_pass_count() / target from 0 to 1, ROUNDED DOWN to three decimals (a tenth of a percent), so it reaches exactly 1 only when the goal is reached
-- (a bar never looks full before the League opens). It is the only number the public learns about sales. Nothing else changes: the goal still lives in
-- arena_private.season_goal.target (editable by the owner with the service role or in the SQL editor, see docs/SEASON_RANKING.md), the trigger that opens the paid season still reads
-- the exact count and the exact target, and only live, paid, active Passes count (arena_private.paid_pass_count(), 0007).
--
-- COMPATIBILITY: the portal (portal/public/season-core.js) reads `progress` and ignores anything else. A browser still running the OLD portal build reads sold / target, finds them
-- missing, treats the answer as invalid and shows "progress bar unavailable" until it reloads. Deploy the portal and apply this migration together.
--
-- NOT APPLIED by the work that wrote this file. The owner applies it (SQL editor or `supabase db push`), in the DEVELOPMENT project first. It was never run against a real database:
-- only read by static tests (supabase/functions/_shared/__tests__/seasonRanking.test.ts). The SQL TEST PLAN at the end is what proves it for real.
--
-- ROLLBACK (by hand; restores the 0006 shape, with the live-only count of 0007):
--   drop function if exists public.pass_meter();
--   create function public.pass_meter()
--   returns table (sold bigint, target integer, season_open boolean, starts_at timestamptz, ends_at timestamptz, updated_at timestamptz)
--   language sql stable security definer set search_path = ''
--   as $fn$
--     select arena_private.paid_pass_count(), coalesce((select g.target from arena_private.season_goal as g where g.id), 15000), s.number is not null, s.starts_at, s.ends_at, pg_catalog.now()
--     from (select 1) as one
--     left join lateral (select r.number, r.starts_at, r.ends_at from public.seasons as r
--       where r.kind = 'ranked' and r.status = 'open' and pg_catalog.now() >= r.starts_at and pg_catalog.now() < r.ends_at order by r.number desc limit 1) as s on true;
--   $fn$;
--   revoke all on function public.pass_meter() from public, anon, authenticated;
--   grant execute on function public.pass_meter() to anon, authenticated;
-- (and put the previous portal build back: it reads sold / target.)
--
-- OWNER CONTROL (SQL editor): the goal is unchanged and still private.
--   Change the goal:  update arena_private.season_goal set target = 15000;   -- 1 to 10 000 000; the public bar moves, the number is never shown
--
-- SQL TEST PLAN (run after applying; nothing here is run automatically).
--
-- A. anon: `select * from public.pass_meter();` returns exactly one row with the columns progress, season_open, starts_at, ends_at, updated_at. There is no column called sold or target:
--    `select sold from public.pass_meter();` -> column "sold" does not exist; same for target. Through the REST API: POST /rest/v1/rpc/pass_meter returns [{"progress":0, ...}].
-- B. Progress follows the count. `update arena_private.season_goal set target = 1000;` With 0 paid active live Passes: progress = 0. With 250: progress = 0.250. With 2 of 3 (target = 3):
--    progress = 0.666 (rounded DOWN, never 0.667). With 999 of 1000: 0.999. With 1000 of 1000: 1.000. With more than the goal (insert past it): still 1.000, never above.
-- C. A Pass that does not count does not move it: a 'grant' row, a 'refunded' row, a 'revoked' row and a stripe row with livemode = false leave progress unchanged (0007).
-- D. A missing goal row falls back to 15 000 inside the function: with the single row deleted (service role only) progress still answers. Restore the row afterwards.
-- E. Privileges: `select has_function_privilege('anon', 'public.pass_meter()', 'execute');` -> true. `select * from arena_private.season_goal;` as anon -> permission denied for schema
--    arena_private. `select arena_private.paid_pass_count();` as anon -> permission denied.
-- F. The season dates: with the paid season open (the goal fired), season_open = true and starts_at / ends_at are its dates; before that season_open = false and both are null.
-- G. The goal still opens the season: the trigger from 0006 / 0007 is untouched, so test C / E of 0006 still pass (the season opens at the exact count, not at the rounded progress).
-- ---------------------------------------------------------------------------------------------------------------------------------------

drop function if exists public.pass_meter();

create function public.pass_meter()
returns table (progress numeric, season_open boolean, starts_at timestamptz, ends_at timestamptz, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select
    -- count / target, never above 1, rounded DOWN to a tenth of a percent: 1 only when the goal is reached. The count and the target themselves are never returned.
    pg_catalog.floor(
      least(1::numeric, arena_private.paid_pass_count()::numeric / greatest(1, coalesce((select g.target from arena_private.season_goal as g where g.id), 15000))::numeric) * 1000
    ) / 1000,
    s.number is not null,
    s.starts_at,
    s.ends_at,
    pg_catalog.now()
  from (select 1) as one
  left join lateral (
    select r.number, r.starts_at, r.ends_at
    from public.seasons as r
    where r.kind = 'ranked' and r.status = 'open' and pg_catalog.now() >= r.starts_at and pg_catalog.now() < r.ends_at
    order by r.number desc
    limit 1
  ) as s on true;
$$;

revoke all on function public.pass_meter() from public, anon, authenticated;
grant execute on function public.pass_meter() to anon, authenticated;
