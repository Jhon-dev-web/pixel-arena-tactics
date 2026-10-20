-- The season ranking loads for players (depends on 0005 / 0006 season_entries / season_profession_entries, 0007 owns_ranking_pass / has_open_flags). NOT APPLIED from this repo: the owner runs it
-- (SQL editor or `supabase db push`), in the DEVELOPMENT project first. It is run for real, as anon and authenticated, by admin/tests/sql/leaderboard.integration.test.ts.
--
-- WHY. public.season_leaderboard and public.season_profession_leaderboard (0007) call arena_private.owns_ranking_pass(uuid) and arena_private.has_open_flags(uuid), whose EXECUTE is revoked from
-- anon and authenticated. Postgres checks a function's EXECUTE privilege as the QUERYING user even inside a view with security_invoker = false (only table privileges follow the view's owner), so every
-- player and every visitor got "42501 permission denied for function owns_ranking_pass" and the Season tab showed "Não foi possível carregar o ranking agora".
--
-- FIX. The two helpers stay private (granting them would let anybody probe any user id). Each view's query moves, unchanged, into a security definer function with an empty search_path in arena_private,
-- and the view becomes `select * from <that function>()`. Only those two functions are granted to anon / authenticated, and arena_private itself stays without USAGE for them, so they cannot be called by name
-- from the API: the view is the only way in. Same columns, same names, same types, same order as before (no user_id, no e-mail). The grants on the views are unchanged.
--
-- Checked and left alone: public.season_my_entry (security definer, runs the helpers as the owner), public.pass_meter (security definer), public.market_listings_public (reads tables only),
-- arena_private.market_sales_ledger (private). No other view or invoker-run SQL reachable by anon / authenticated calls a revoked arena_private function.
--
-- ROLLBACK (by hand): re-run the two `create or replace view` blocks of 0007 (they will fail again for players, that is the bug), then
--   drop function if exists arena_private.season_leaderboard_rows();
--   drop function if exists arena_private.season_profession_leaderboard_rows();

create schema if not exists arena_private;

create or replace function arena_private.season_leaderboard_rows()
returns table (season integer, rank integer, username text, level_total integer, paragon_level integer, highest_floor integer, deepest_depth integer, flag_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.season,
    (pg_catalog.row_number() over (partition by e.season order by e.score desc, e.tiebreak_at asc, e.user_id))::integer,
    p.username,
    (e.score / 1000000)::integer,
    greatest((e.score / 1000000)::integer - 100, 0),
    least((e.score % 1000000)::integer, 100),
    greatest((e.score % 1000000)::integer - 100, 0),
    pg_catalog.cardinality(e.flags)
  from public.season_entries as e
  join public.seasons as s on s.number = e.season
  left join public.profiles as p on p.user_id = e.user_id
  where e.disqualified = false and e.score > 0
    and arena_private.owns_ranking_pass(e.user_id)
    and (s.kind = 'pre' or (pg_catalog.cardinality(e.flags) = 0 and not arena_private.has_open_flags(e.user_id)));
$$;

revoke all on function arena_private.season_leaderboard_rows() from public, anon, authenticated;
grant execute on function arena_private.season_leaderboard_rows() to anon, authenticated;

create or replace function arena_private.season_profession_leaderboard_rows()
returns table (season integer, profession text, rank integer, username text, level integer, score bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.season,
    e.profession,
    (pg_catalog.row_number() over (partition by e.season, e.profession order by e.score desc, e.tiebreak_at asc, e.user_id))::integer,
    p.username,
    e.level,
    e.score
  from public.season_profession_entries as e
  join public.season_entries as se on se.season = e.season and se.user_id = e.user_id
  join public.seasons as s on s.number = e.season
  left join public.profiles as p on p.user_id = e.user_id
  where se.disqualified = false and pg_catalog.cardinality(se.flags) = 0 and e.score > 0
    and arena_private.owns_ranking_pass(e.user_id)
    and (s.kind = 'pre' or not arena_private.has_open_flags(e.user_id));
$$;

revoke all on function arena_private.season_profession_leaderboard_rows() from public, anon, authenticated;
grant execute on function arena_private.season_profession_leaderboard_rows() to anon, authenticated;

create or replace view public.season_leaderboard
with (security_invoker = false)
as
select * from arena_private.season_leaderboard_rows();

revoke all on table public.season_leaderboard from public, anon, authenticated;
grant select on table public.season_leaderboard to anon, authenticated;

create or replace view public.season_profession_leaderboard
with (security_invoker = false)
as
select * from arena_private.season_profession_leaderboard_rows();

revoke all on table public.season_profession_leaderboard from public, anon, authenticated;
grant select on table public.season_profession_leaderboard to anon, authenticated;
