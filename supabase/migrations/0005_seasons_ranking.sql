-- NOTE: the ranked seasons seeded below are given no dates (and a pre-season is added) by 0006_portal_meter_and_profession_ranking.sql: the paid season opens when the Pass goal is reached, not on a calendar.
-- Seasons and the ranking (depends on 0002 profiles, 0003 entitlements, 0004 progress_snapshots).
--
-- Who may rank: Adventurer Pass owners (a row in public.entitlements, via arena_private.owns_adventurer_pass), with a confirmed e-mail, while the season is `open`
-- and the server clock is before `freeze_at`, and only with a snapshot whose verdict is 'ok'. The SCORE is computed by the Edge Function (pure code, tested) from the
-- server-extracted metrics and handed to public.season_apply_snapshot, which is callable by the service role ONLY. No prize amount is stored anywhere here: `prize_note`
-- is free text the owner writes himself.
--
-- NOT APPLIED by the work that wrote this file. The owner applies it when ready. All seeded seasons start as 'upcoming': nothing ranks until the owner sets one to 'open'.
--
-- ROLLBACK (by hand, in this order; deletes every entry):
--   drop view if exists public.season_leaderboard;
--   drop function if exists public.season_my_entry(integer);
--   drop function if exists public.season_apply_snapshot(uuid, uuid, text, text[], bigint);
--   drop table if exists public.season_entries;
--   drop table if exists public.seasons;
--   drop function if exists arena_private.season_entries_freeze_guard();
--   drop function if exists arena_private.season_is_open(integer);

create schema if not exists arena_private;
revoke all on schema arena_private from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- seasons
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists public.seasons (
  number integer primary key,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- After this instant (server clock) no entry changes, whatever `status` says. Leave time between freeze_at and ends_at for the manual audit.
  freeze_at timestamptz not null,
  status text not null default 'upcoming',
  -- Free text the owner fills himself (shown in the game only when not empty). The code never stores or invents an amount.
  prize_note text,
  constraint seasons_status_check check (status in ('upcoming', 'open', 'frozen', 'closed', 'paid')),
  constraint seasons_dates_check check (starts_at < freeze_at and freeze_at <= ends_at)
);

-- Same epoch and length as src/game/seasons.ts: season 1 = 2026-10-01 00:00 UTC, 60 days each. Freeze = 2 days before the end (the owner can change it per season).
insert into public.seasons (number, starts_at, ends_at, freeze_at)
select n,
       timestamptz '2026-10-01 00:00:00+00' + ((n - 1) * 60) * interval '1 day',
       timestamptz '2026-10-01 00:00:00+00' + (n * 60) * interval '1 day',
       timestamptz '2026-10-01 00:00:00+00' + (n * 60 - 2) * interval '1 day'
from generate_series(1, 8) as n
on conflict (number) do nothing;

alter table public.seasons enable row level security;
revoke all on table public.seasons from public, anon, authenticated;
grant select on table public.seasons to anon, authenticated;
grant select, insert, update on table public.seasons to service_role;

drop policy if exists seasons_select_all on public.seasons;
create policy seasons_select_all on public.seasons for select to anon, authenticated using (true);

-- "Is this season taking changes right now?" The one definition used by the guard trigger.
create or replace function arena_private.season_is_open(p_season integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.seasons as s
    where s.number = p_season and s.status = 'open' and pg_catalog.now() >= s.starts_at and pg_catalog.now() < s.freeze_at
  );
$$;

revoke all on function arena_private.season_is_open(integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- season_entries
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists public.season_entries (
  id uuid primary key default gen_random_uuid(),
  season integer not null references public.seasons (number),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- level_total * 1,000,000 + (highest floor + deepest depth): see supabase/functions/_shared/progress/metrics.ts computeScore.
  score bigint not null default 0,
  -- The server time this score was first reached: earlier wins a tie.
  tiebreak_at timestamptz not null default now(),
  best_snapshot_id uuid references public.progress_snapshots (id),
  -- Every reason code of every flagged / rejected snapshot of this player in this season ('R:' prefix = rejected). Visible as a count on the leaderboard.
  flags text[] not null default '{}',
  disqualified boolean not null default false,
  created_at timestamptz not null default now(),
  constraint season_entries_season_user_unique unique (season, user_id),
  constraint season_entries_score_check check (score >= 0)
);

create index if not exists season_entries_rank_idx on public.season_entries (season, score desc, tiebreak_at asc);

-- Defence in depth: once the season is not open (or the server clock is past freeze_at), score / tiebreak / best snapshot cannot change, not even by the owner by accident.
-- Flags and `disqualified` stay editable (the audit). To correct a score after the freeze on purpose, disable this trigger in the SQL editor first.
create or replace function arena_private.season_entries_freeze_guard()
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

revoke all on function arena_private.season_entries_freeze_guard() from public, anon, authenticated;

drop trigger if exists season_entries_freeze_guard on public.season_entries;
create trigger season_entries_freeze_guard
  before insert or update on public.season_entries
  for each row
  execute function arena_private.season_entries_freeze_guard();

alter table public.season_entries enable row level security;
revoke all on table public.season_entries from public, anon, authenticated;
grant select on table public.season_entries to authenticated; -- own row only (policy below); the public sees the view
grant select, insert, update on table public.season_entries to service_role;

drop policy if exists season_entries_select_own on public.season_entries;
create policy season_entries_select_own
  on public.season_entries
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- season_apply_snapshot: called by the submit-progress function (service role) right after it stored a snapshot.
-- Returns one of: 'updated' (new best), 'unchanged' (ok but not a new best), 'flags_recorded' (flagged / rejected snapshot: only the flags move),
--                 'season_not_open', 'no_pass', 'email_unconfirmed', 'disqualified'.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.season_apply_snapshot(p_user_id uuid, p_snapshot_id uuid, p_verdict text, p_reasons text[], p_score bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season integer;
  v_entry public.season_entries%rowtype;
  v_exists boolean;
  v_confirmed boolean;
  v_flags text[];
  v_new text[];
begin
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

  select * into v_entry from public.season_entries as e where e.season = v_season and e.user_id = p_user_id for update;
  v_exists := found;
  if v_exists and v_entry.disqualified then
    return 'disqualified';
  end if;

  if p_verdict <> 'ok' then
    -- Flagged or rejected: never moves the score; the reasons are remembered (the owner audits flagged accounts, and the leaderboard shows how many).
    select pg_catalog.array_agg(case when p_verdict = 'rejected' then 'R:' || r else r end) into v_new from pg_catalog.unnest(coalesce(p_reasons, '{}'::text[])) as r;
    select coalesce(pg_catalog.array_agg(distinct x order by x), '{}'::text[]) into v_flags
    from pg_catalog.unnest(case when v_exists then v_entry.flags else '{}'::text[] end || coalesce(v_new, '{}'::text[])) as x;
    if v_exists then
      update public.season_entries set flags = v_flags where id = v_entry.id;
    else
      insert into public.season_entries (season, user_id, score, best_snapshot_id, flags) values (v_season, p_user_id, 0, null, v_flags);
    end if;
    return 'flags_recorded';
  end if;

  if not v_exists then
    insert into public.season_entries (season, user_id, score, tiebreak_at, best_snapshot_id) values (v_season, p_user_id, p_score, pg_catalog.now(), p_snapshot_id);
    return 'updated';
  end if;
  if p_score > v_entry.score then
    update public.season_entries set score = p_score, tiebreak_at = pg_catalog.now(), best_snapshot_id = p_snapshot_id where id = v_entry.id;
    return 'updated';
  end if;
  return 'unchanged';
end;
$$;

revoke all on function public.season_apply_snapshot(uuid, uuid, text, text[], bigint) from public, anon, authenticated;
grant execute on function public.season_apply_snapshot(uuid, uuid, text, text[], bigint) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The public leaderboard: rank, username, score parts and how many flags. No e-mail, no user id, no flag texts.
-- Runs with the view owner's rights on purpose (the entries table is private); it only ever exposes the columns below.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace view public.season_leaderboard
with (security_invoker = false)
as
select
  e.season,
  (pg_catalog.row_number() over (partition by e.season order by e.score desc, e.tiebreak_at asc, e.user_id))::integer as rank,
  p.username,
  (e.score / 1000000)::integer as level_total,
  greatest((e.score / 1000000)::integer - 100, 0) as paragon_level,
  least((e.score % 1000000)::integer, 100) as highest_floor,
  greatest((e.score % 1000000)::integer - 100, 0) as deepest_depth,
  pg_catalog.cardinality(e.flags) as flag_count
from public.season_entries as e
left join public.profiles as p on p.user_id = e.user_id
where e.disqualified = false and e.score > 0;

revoke all on table public.season_leaderboard from public, anon, authenticated;
grant select on table public.season_leaderboard to anon, authenticated;

-- The signed-in player's own place (the view has no user id on purpose). `p_season` null = the newest open or frozen season.
create or replace function public.season_my_entry(p_season integer default null)
returns table (season integer, rank integer, level_total integer, paragon_level integer, highest_floor integer, deepest_depth integer, flag_count integer, disqualified boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with ranked as (
    select e.id as entry_id, (pg_catalog.row_number() over (partition by e.season order by e.score desc, e.tiebreak_at asc, e.user_id))::integer as pos
    from public.season_entries as e
    where e.disqualified = false and e.score > 0
  ),
  target as (
    select coalesce(p_season, (select s.number from public.seasons as s where s.status in ('open', 'frozen') order by s.number desc limit 1)) as number
  )
  select e.season,
         r.pos,
         (e.score / 1000000)::integer,
         greatest((e.score / 1000000)::integer - 100, 0),
         least((e.score % 1000000)::integer, 100),
         greatest((e.score % 1000000)::integer - 100, 0),
         pg_catalog.cardinality(e.flags),
         e.disqualified
  from public.season_entries as e
  join target as t on t.number = e.season
  left join ranked as r on r.entry_id = e.id
  where e.user_id = (select auth.uid());
$$;

revoke all on function public.season_my_entry(integer) from public, anon;
grant execute on function public.season_my_entry(integer) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- SQL TEST PLAN (run after applying; nothing here is run automatically).
--
-- A. Clients cannot write: as `authenticated`, insert / update / delete on seasons, season_entries -> permission denied; execute public.season_apply_snapshot -> permission denied.
-- B. anon reads: `select * from public.seasons;` and `select * from public.season_leaderboard;` work; `select * from public.season_entries;` fails.
-- C. The view exposes only season, rank, username, level_total, paragon_level, highest_floor, deepest_depth, flag_count: check with `\d+ public.season_leaderboard`.
-- D. Eligibility (as the owner): set a test season to 'open' (and move freeze_at into the future), then call
--      select public.season_apply_snapshot('<user>', '<snapshot>', 'ok', '{}', 4200000);
--    -> 'no_pass' without an active entitlement, 'email_unconfirmed' until auth.users.email_confirmed_at is set, 'updated' when both hold,
--       'unchanged' for the same or a lower score, 'season_not_open' once status <> 'open' or now() >= freeze_at, 'disqualified' after `disqualified = true`.
-- E. Freeze: after freeze_at, `update public.season_entries set score = score + 1;` -> SEASON_NOT_OPEN.
-- F. Tie: two entries with the same score; the one with the earlier tiebreak_at has the smaller rank.
-- ---------------------------------------------------------------------------------------------------------------------------------------
