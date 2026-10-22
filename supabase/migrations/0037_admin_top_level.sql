-- Admin panel: "Top 25 por nível" for the playtest prize (owner's decision, 22/10/2026: the 25 accounts with the highest hero level get the Adventurer Pass, no draw; ties go to whoever got there first).
-- Depends on 0004 (progress_snapshots), 0020 admin, 0025/0026 Pass per season, 0034 (arena_private.admin_jnum). NOT APPLIED from this repo: the owner runs it (SQL editor or `supabase db push`),
-- in the DEVELOPMENT project first. Run for real by admin/tests/sql/toplevel.integration.test.ts (an in-memory Postgres).
--
-- WHERE THE LEVEL AND THE DATE COME FROM. Not from the save (the player can edit it, and it has no history) but from public.progress_snapshots: the server judges every submission and stamps it with ITS clock;
-- the game submits at most every 10 minutes and about a minute after a level up. Rejected submissions never count. For each account:
--   level      = the highest (hero level + Paragon level) among its accepted submissions up to the cut-off;
--   reached_at = the server time of the FIRST accepted submission that showed that level (the tie-break: earlier wins).
-- Flagged submissions do count (a flag is a sign to look at, not a verdict); the list shows the account's open alerts so the owner can check before granting.
-- p_until (optional) is the cut-off: submissions after it are ignored, so the list can be frozen at the end of the playtest. Null = up to now.
--
-- public.admin_top_level(p_limit, p_until): admin-only (is_admin() first), security definer, empty search_path, STABLE, no write, granted only to `authenticated`. Granting the Pass stays
-- public.admin_grant_pass (0027), one account at a time, with a note and an audit row.
--
-- ROLLBACK (by hand; nothing depends on it): drop function if exists public.admin_top_level(integer, timestamptz);

create or replace function public.admin_top_level(p_limit integer default 25, p_until timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_until timestamptz;
  v_online interval;
  v_ranked bigint;
  v_rows jsonb;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_ONLY';
  end if;
  v_limit := least(greatest(coalesce(p_limit, 25), 1), 200);
  v_until := coalesce(p_until, pg_catalog.now());
  v_online := make_interval(mins => arena_private.admin_cfg('online_window_minutes', '5')::integer);

  with snaps as (
    select s.user_id,
           s.created_at,
           coalesce(arena_private.admin_jnum(s.metrics -> 'heroLevel'), 0)::integer as hero,
           coalesce(arena_private.admin_jnum(s.metrics -> 'paragonLevel'), 0)::integer as paragon
    from public.progress_snapshots as s
    where s.verdict <> 'rejected' and s.created_at <= v_until
  ),
  best as (
    select x.user_id, max(x.hero + x.paragon) as lvl from snaps as x group by x.user_id
  ),
  reached as (
    select b.user_id, b.lvl,
           min(x.created_at) as reached_at,
           (array_agg(x.hero order by x.created_at))[1] as hero,
           (array_agg(x.paragon order by x.created_at))[1] as paragon
    from best as b
    join snaps as x on x.user_id = b.user_id and x.hero + x.paragon = b.lvl
    group by b.user_id, b.lvl
  ),
  ranked as (
    select r.*, row_number() over (order by r.lvl desc, r.reached_at asc, r.user_id) as rank, count(*) over () as total
    from reached as r
  )
  select coalesce(max(k.total), 0),
         coalesce(jsonb_agg(jsonb_build_object(
           'rank', k.rank,
           'user_id', k.user_id,
           'username', pr.username,
           'hero_name', ch.hero_name,
           'level', k.lvl,
           'hero_level', k.hero,
           'paragon_level', k.paragon,
           'reached_at', k.reached_at,
           'last_seen', ch.updated_at,
           'online', coalesce(ch.updated_at >= pg_catalog.now() - v_online, false),
           'pass_valid_now', arena_private.owns_adventurer_pass(k.user_id),
           'pass_source', pass.source,
           'pass_livemode', pass.livemode,
           'open_flags', (
             select count(*) from public.progress_snapshots as f
             where f.user_id = k.user_id and f.verdict <> 'ok'
               and f.created_at >= coalesce((select g.reset_at from arena_private.season_goal as g where g.id), '-infinity'::timestamptz)
               and not exists (select 1 from public.progress_flag_clears as c where c.snapshot_id = f.id)
           ),
           'item_flags', (select count(*) from arena_private.item_account_flags as f where f.user_id = k.user_id)
         ) order by k.rank), '[]'::jsonb)
  into v_ranked, v_rows
  from ranked as k
  left join public.profiles as pr on pr.user_id = k.user_id
  left join public.characters as ch on ch.user_id = k.user_id
  left join lateral (
    select e.source, e.livemode from public.entitlements as e
    where e.user_id = k.user_id and e.kind = 'adventurer_pass' and e.status = 'active'
    order by (e.valid_through_season >= arena_private.current_pass_season()) desc, e.granted_at desc limit 1
  ) as pass on true
  where k.rank <= v_limit;

  return jsonb_build_object('until', v_until, 'limit', v_limit, 'ranked', v_ranked, 'rows', v_rows);
end;
$$;

revoke all on function public.admin_top_level(integer, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_top_level(integer, timestamptz) to authenticated;
