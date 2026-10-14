-- The public Pass meter, the goal that opens the paid season, the pre-season, and the profession rankings
-- (depends on 0003 entitlements, 0004 progress_snapshots, 0005 seasons / season_entries / season_leaderboard).
--
-- NAMING (also in docs/SEASON_RANKING.md): the RANKED seasons of this file ("Temporada valendo", public.seasons) are NOT the Adventurer Pass reward seasons of
-- src/game/seasons.ts (a fixed 60-day calendar from 2026-10-01 that only drives the Pass track and the seasonal items). That calendar is untouched. Here:
--   * the PRE-SEASON (public.seasons number 0, kind 'pre') is open from the moment this migration is applied, no prize, Pass owners only, same score and anti-cheat rules;
--   * the PAID SEASON (kind 'ranked', number = arena_private.season_goal.season_number, 1 at first) stays 'upcoming' WITHOUT DATES until the number of paid active
--     Adventurer Passes reaches arena_private.season_goal.target (15 000). At that moment it opens by itself, once: starts_at = server now, ends_at = +60 days,
--     freeze_at = ends_at - 2 days, status 'open'; the pre-season is closed (its standings stay in the tables, archived and frozen) and the paid season starts from zero.
--   * "paid" = entitlements with source 'stripe' or 'mercadopago' and status 'active'. Grants (testers, gifts), refunded and revoked rows never count.
--   * No prize amount exists anywhere in this file, and nothing links the count to a prize: the prize is whatever the owner writes in seasons.prize_note.
--
-- HOW THE AUTO-OPEN WORKS (the simplest robust option): an AFTER INSERT / UPDATE OF status row trigger on public.entitlements calls
-- arena_private.try_open_paid_season(). That function (1) returns at once when the goal already fired, (2) takes a ROW LOCK on the single season_goal row (select ... for update)
-- BEFORE counting, (3) counts the paid active Passes (a new statement, so under READ COMMITTED it sees every sale committed while it waited for the lock) and (4) opens the season
-- only when the count reached the target and season_goal.opened_at is still null, stamping opened_at under the same lock. Two concurrent sales therefore serialize on the lock: the
-- second one always counts the first, so the 15 000th sale cannot be missed, and the season opens exactly once. The call is wrapped in an exception block: a failure here is
-- only a warning and can NEVER roll back or block a payment. The webhook code is untouched.
--
-- MANUAL CONTROL (SQL editor, owner only): see "OWNER CONTROLS" at the end.
--
-- NOT APPLIED by the work that wrote this file. The owner applies it when ready (after 0005).
--
-- ROLLBACK (by hand, in this order; deletes the profession entries and the pre-season row only if no season_entries reference it, so clear season 0 entries first if any):
--   drop trigger if exists entitlements_goal_check on public.entitlements;
--   drop function if exists arena_private.entitlements_goal_trigger();
--   drop function if exists arena_private.try_open_paid_season();
--   drop function if exists arena_private.open_paid_season(integer);
--   drop function if exists public.pass_meter();
--   drop function if exists arena_private.paid_pass_count();
--   drop table if exists arena_private.season_goal;
--   drop view if exists public.season_profession_leaderboard;
--   drop function if exists public.season_apply_professions(uuid, uuid, text, jsonb);
--   drop table if exists public.season_profession_entries;
--   drop function if exists arena_private.season_profession_freeze_guard();
--   delete from public.season_entries where season = 0; delete from public.seasons where number = 0;
--   alter table public.seasons drop constraint if exists seasons_kind_check; alter table public.seasons drop column if exists kind;
--   (the nullable dates of the ranked seasons can stay; restore the 0005 not null / check by hand only if you also give every season dates again)

create schema if not exists arena_private;
revoke all on schema arena_private from public, anon, authenticated;
grant usage on schema arena_private to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- seasons: a kind, and dates that may be empty while a ranked season has not started
-- ---------------------------------------------------------------------------------------------------------------------------------------
alter table public.seasons add column if not exists kind text not null default 'ranked';
alter table public.seasons drop constraint if exists seasons_kind_check;
alter table public.seasons add constraint seasons_kind_check check (kind in ('pre', 'ranked'));

alter table public.seasons alter column starts_at drop not null;
alter table public.seasons alter column ends_at drop not null;
alter table public.seasons alter column freeze_at drop not null;
alter table public.seasons drop constraint if exists seasons_dates_check;
alter table public.seasons add constraint seasons_dates_check check (
  (starts_at is null and ends_at is null and freeze_at is null)
  or (starts_at is not null and ends_at is not null and freeze_at is not null and starts_at < freeze_at and freeze_at <= ends_at)
);

-- The 0005 seeds assumed a calendar for the ranked seasons: they now wait for the goal (or for the owner) without dates. A season already opened by hand is left alone.
update public.seasons set starts_at = null, ends_at = null, freeze_at = null where kind = 'ranked' and status = 'upcoming';

-- The pre-season: number 0, open now, no real end (the paid season closes it), no prize. If a ranked season is already open (this file applied late), it is born closed.
insert into public.seasons (number, kind, starts_at, ends_at, freeze_at, status, prize_note)
select 0, 'pre', pg_catalog.now(), timestamptz '2099-12-31 00:00:00+00', timestamptz '2099-12-31 00:00:00+00',
       case when exists (select 1 from public.seasons as s where s.kind = 'ranked' and s.status in ('open', 'frozen', 'closed', 'paid')) then 'closed' else 'open' end,
       null
on conflict (number) do nothing;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The goal: ONE row, private. Editable only by the service role (or the owner in the SQL editor).
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists arena_private.season_goal (
  id boolean primary key default true,
  -- Paid active Adventurer Passes that open the paid season.
  target integer not null default 15000,
  -- Which ranked season the goal opens (public.seasons.number, kind 'ranked').
  season_number integer not null default 1,
  -- Set once, under the row lock, when the goal fired. Not null = it will never fire again.
  opened_at timestamptz,
  constraint season_goal_single_row check (id),
  constraint season_goal_target_check check (target between 1 and 10000000)
);

insert into arena_private.season_goal (id) values (true) on conflict (id) do nothing;

revoke all on table arena_private.season_goal from public, anon, authenticated;
grant select, update on table arena_private.season_goal to service_role; -- no insert / delete: the single row is permanent

-- Paid active Passes: the one definition used by the meter and by the trigger.
create or replace function arena_private.paid_pass_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.count(*)::bigint
  from public.entitlements as e
  where e.kind = 'adventurer_pass' and e.status = 'active' and e.source in ('stripe', 'mercadopago');
$$;

revoke all on function arena_private.paid_pass_count() from public, anon, authenticated;

-- Opens a ranked season: status 'open', starts now, 60 days, freeze 2 days before the end; closes the pre-season. Only an 'upcoming' ranked season opens (a closed one never reopens).
-- Returns true when it opened. Used by the trigger AND callable by the owner in the SQL editor.
create or replace function arena_private.open_paid_season(p_season integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  update public.seasons
  set starts_at = pg_catalog.now(),
      ends_at = pg_catalog.now() + interval '60 days',
      freeze_at = pg_catalog.now() + interval '58 days',
      status = 'open'
  where number = p_season and kind = 'ranked' and status = 'upcoming';
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return false;
  end if;
  -- Archive the pre-season: closed seasons take no more changes (season_is_open), their entries stay where they are.
  update public.seasons set status = 'closed' where kind = 'pre' and status = 'open';
  update arena_private.season_goal set opened_at = coalesce(opened_at, pg_catalog.now());
  return true;
end;
$$;

revoke all on function arena_private.open_paid_season(integer) from public, anon, authenticated;

create or replace function arena_private.try_open_paid_season()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_goal arena_private.season_goal%rowtype;
begin
  -- Cheap exit after the goal fired (no lock, no count).
  if exists (select 1 from arena_private.season_goal as g where g.opened_at is not null) then
    return false;
  end if;
  -- The lock comes BEFORE the count: a concurrent sale waits here, then counts again and sees the sale that made us wait.
  select * into v_goal from arena_private.season_goal as g where g.id for update;
  if not found or v_goal.opened_at is not null then
    return false;
  end if;
  if arena_private.paid_pass_count() < v_goal.target then
    return false;
  end if;
  perform arena_private.open_paid_season(v_goal.season_number);
  -- The goal fires ONCE, even if that season was not 'upcoming' any more (the owner opened or closed it by hand): never retried, never reopened.
  update arena_private.season_goal set opened_at = pg_catalog.now() where id and opened_at is null;
  return true;
end;
$$;

revoke all on function arena_private.try_open_paid_season() from public, anon, authenticated;

create or replace function arena_private.entitlements_goal_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'adventurer_pass' and new.status = 'active' and new.source in ('stripe', 'mercadopago') then
    begin
      perform arena_private.try_open_paid_season();
    exception when others then
      -- Never block or undo a payment because of the ranking.
      raise warning 'try_open_paid_season failed: %', sqlerrm;
    end;
  end if;
  return null;
end;
$$;

revoke all on function arena_private.entitlements_goal_trigger() from public, anon, authenticated;

drop trigger if exists entitlements_goal_check on public.entitlements;
create trigger entitlements_goal_check
  after insert or update of status on public.entitlements
  for each row
  execute function arena_private.entitlements_goal_trigger();

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- pass_meter(): the ONLY thing the public site learns about sales. No user id, no amount, no e-mail, no source.
-- Returns one row: sold (paid active Passes), target, season_open (a ranked season is open now) and its dates when open.
-- STABLE: PostgREST caches nothing, but the plan is one indexed count; the site asks once a minute per visitor.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.pass_meter()
returns table (sold bigint, target integer, season_open boolean, starts_at timestamptz, ends_at timestamptz, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select
    arena_private.paid_pass_count(),
    coalesce((select g.target from arena_private.season_goal as g where g.id), 15000),
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

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Profession rankings: score = the profession's total skill XP; the server time it was reached breaks a tie. Mining, Woodcutting and Gardening are the professions with levels.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists public.season_profession_entries (
  season integer not null references public.seasons (number),
  user_id uuid not null references auth.users (id) on delete cascade,
  profession text not null,
  score bigint not null default 0,
  -- The level the server computed from the XP at that moment (shown on the board).
  level integer not null default 1,
  tiebreak_at timestamptz not null default now(),
  best_snapshot_id uuid references public.progress_snapshots (id),
  primary key (season, user_id, profession),
  constraint season_profession_entries_profession_check check (profession in ('mining', 'woodcutting', 'gardening')),
  constraint season_profession_entries_score_check check (score >= 0),
  constraint season_profession_entries_level_check check (level between 1 and 200)
);

create index if not exists season_profession_entries_rank_idx on public.season_profession_entries (season, profession, score desc, tiebreak_at asc);

create or replace function arena_private.season_profession_freeze_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.score is distinct from old.score or new.tiebreak_at is distinct from old.tiebreak_at or new.best_snapshot_id is distinct from old.best_snapshot_id then
    if not arena_private.season_is_open(new.season) then
      raise exception using errcode = '23514', message = 'SEASON_NOT_OPEN';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function arena_private.season_profession_freeze_guard() from public, anon, authenticated;

drop trigger if exists season_profession_freeze_guard on public.season_profession_entries;
create trigger season_profession_freeze_guard
  before insert or update on public.season_profession_entries
  for each row
  execute function arena_private.season_profession_freeze_guard();

alter table public.season_profession_entries enable row level security;
revoke all on table public.season_profession_entries from public, anon, authenticated;
grant select, insert, update on table public.season_profession_entries to service_role; -- the public sees the view only
-- No policy: with RLS on and no policy, anon / authenticated read and change nothing.

-- Called by the submit-progress function (service role) right after season_apply_snapshot answered 'updated' or 'unchanged'. It checks every condition AGAIN itself
-- (ok verdict, season open before freeze_at, Pass on the server, e-mail confirmed, not disqualified). p_professions = [{"profession":"mining","xp":1234,"level":12}, ...].
-- Returns 'updated' (some profession reached a new best), 'unchanged', or why nothing happened.
create or replace function public.season_apply_professions(p_user_id uuid, p_snapshot_id uuid, p_verdict text, p_professions jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season integer;
  v_confirmed boolean;
  v_disqualified boolean;
  v_item record;
  v_rows integer;
  v_changed boolean := false;
begin
  if p_verdict <> 'ok' then
    return 'not_ok';
  end if;
  if p_professions is null or pg_catalog.jsonb_typeof(p_professions) <> 'array' then
    return 'nothing';
  end if;

  select s.number into v_season
  from public.seasons as s
  where s.status = 'open' and pg_catalog.now() >= s.starts_at and pg_catalog.now() < s.freeze_at
  order by s.number desc
  limit 1;
  if v_season is null then
    return 'season_not_open';
  end if;

  if not arena_private.owns_adventurer_pass(p_user_id) then
    return 'no_pass';
  end if;

  select (u.email_confirmed_at is not null) into v_confirmed from auth.users as u where u.id = p_user_id;
  if not coalesce(v_confirmed, false) then
    return 'email_unconfirmed';
  end if;

  select e.disqualified into v_disqualified from public.season_entries as e where e.season = v_season and e.user_id = p_user_id;
  if coalesce(v_disqualified, false) then
    return 'disqualified';
  end if;

  for v_item in
    select x.profession, x.xp, x.level
    from pg_catalog.jsonb_to_recordset(p_professions) as x(profession text, xp bigint, level integer)
  loop
    if v_item.profession not in ('mining', 'woodcutting', 'gardening') or v_item.xp is null or v_item.xp <= 0 then
      continue;
    end if;
    insert into public.season_profession_entries as pe (season, user_id, profession, score, level, tiebreak_at, best_snapshot_id)
    values (v_season, p_user_id, v_item.profession, least(v_item.xp, 1000000000000), least(greatest(coalesce(v_item.level, 1), 1), 200), pg_catalog.now(), p_snapshot_id)
    on conflict (season, user_id, profession) do update
      set score = excluded.score, level = excluded.level, tiebreak_at = pg_catalog.now(), best_snapshot_id = excluded.best_snapshot_id
      where pe.score < excluded.score;
    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      v_changed := true;
    end if;
  end loop;

  return case when v_changed then 'updated' else 'unchanged' end;
end;
$$;

revoke all on function public.season_apply_professions(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.season_apply_professions(uuid, uuid, text, jsonb) to service_role;

-- The public profession leaderboard: season, profession, rank, username, level, score. Nothing that identifies the account. Players with any flag or a disqualification are not shown
-- (the public sees only clean entries). Runs with the view owner's rights on purpose (the entries tables are private).
create or replace view public.season_profession_leaderboard
with (security_invoker = false)
as
select
  e.season,
  e.profession,
  (pg_catalog.row_number() over (partition by e.season, e.profession order by e.score desc, e.tiebreak_at asc, e.user_id))::integer as rank,
  p.username,
  e.level,
  e.score
from public.season_profession_entries as e
join public.season_entries as se on se.season = e.season and se.user_id = e.user_id
left join public.profiles as p on p.user_id = e.user_id
where se.disqualified = false and pg_catalog.cardinality(se.flags) = 0 and e.score > 0;

revoke all on table public.season_profession_leaderboard from public, anon, authenticated;
grant select on table public.season_profession_leaderboard to anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- OWNER CONTROLS (SQL editor; none of this is run automatically)
--   Change the goal:             update arena_private.season_goal set target = 12000;
--   Which season it opens:       update arena_private.season_goal set season_number = 2, opened_at = null;   -- next cycle: season 2 must be 'upcoming' (null dates)
--   Open the paid season now:    select arena_private.open_paid_season(1);                                   -- same effect as the goal: 60 days from now, pre-season closed
--   Close / end a season:        update public.seasons set status = 'closed' where number = 1;               -- 'frozen' to stop changes but keep it shown; 'paid' once prizes were paid
--   Set a prize text:            update public.seasons set prize_note = '<your text>' where number = 1;      -- free text, shown as written; never computed from the count
--   Reopen the pre-season:       update public.seasons set status = 'open' where number = 0;                 -- only if you want it back after a paid season closed
--
-- SQL TEST PLAN (run after applying; nothing here is run automatically).
--
-- A. anon: `select * from public.pass_meter();` works and returns one row (sold, target, season_open, starts_at, ends_at, updated_at); `select * from public.season_profession_leaderboard;` works;
--    `select * from arena_private.season_goal;` -> permission denied for schema arena_private; `select * from public.season_profession_entries;` -> permission denied;
--    `select public.season_apply_professions(...)` -> permission denied; `select arena_private.paid_pass_count();` -> permission denied.
-- B. The count counts only paid active rows. As the owner insert entitlements for four different users with sources 'stripe', 'mercadopago', 'grant' and a 'stripe' one then
--    updated to status 'refunded': pass_meter().sold = 2. Clean up.
-- C. The goal fires once, not below. `update arena_private.season_goal set target = 3;` Insert 2 paid active rows: seasons 1 still 'upcoming' (null dates), pre-season 0 'open'.
--    Insert the 3rd paid row: season 1 -> status 'open', starts_at ~ now, ends_at = +60 days, freeze_at = +58 days; season 0 -> 'closed'; season_goal.opened_at set.
--    Insert a 4th: nothing changes (dates identical). Set season 1 to 'closed' by hand and insert a 5th paid row: it stays closed.
-- D. grant / refunded / revoked do not fire it: with target = 1, insert a 'grant' row, then a 'stripe' row updated to 'revoked' before commit: still upcoming; a 'stripe' active row opens it.
-- E. Concurrency: with target = 2 and one paid row present, open two sessions, each `begin; insert ... 'stripe' ...;` (do not commit), then commit the first and then the second:
--    exactly one transition happens (opened_at set once) and the season opened once; the second commit waits on the lock row and then counts both.
-- F. A failure in the function never blocks a sale: `alter function arena_private.try_open_paid_season() rename to x;` then insert a paid row -> the insert succeeds and a WARNING is logged. Rename back.
-- G. Profession entries (as the owner, with an open season): select public.season_apply_professions('<user>', '<snapshot>', 'ok', '[{"profession":"mining","xp":900,"level":9}]');
--    -> 'no_pass' without an entitlement, 'email_unconfirmed' until confirmed, 'updated' first time, 'unchanged' for the same or a lower xp, 'not_ok' for 'flagged' / 'rejected',
--    'season_not_open' when no season is open or now() >= freeze_at, 'disqualified' after season_entries.disqualified = true.
-- H. The view shows rank by score desc then tiebreak_at asc, one row per (season, profession, player), and no row for a player whose season_entries.flags is not empty.
--    `\d+ public.season_profession_leaderboard` lists exactly season, profession, rank, username, level, score.
-- I. Archive: after C, `select count(*) from public.season_entries where season = 0` is unchanged by new snapshots (the freeze guard raises SEASON_NOT_OPEN on a manual update of a score in season 0),
--    and season 1 has no rows until the first new snapshot arrives (everyone starts from zero).
-- ---------------------------------------------------------------------------------------------------------------------------------------
