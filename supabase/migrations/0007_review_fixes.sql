-- Fixes from the independent review of the ranking and payments work (depends on 0001, 0003, 0004, 0005, 0006 being applied first).
--
-- WHAT THIS DOES (each block says which finding it closes; docs/SEASON_RANKING.md, docs/PASS_SALES.md and docs/WEB_LAUNCH.md describe it for the owner):
--   B1  The account age used by the ranking is auth.users.created_at (arena_private.account_created_at, service role only), never characters.created_at. That column also
--       becomes immutable (trigger) and the client roles lose the privilege to write it (column-level grants).
--   B2  Lifetime flags. A flagged or rejected snapshot is remembered for the whole life of the account (public.progress_flag_clears is the ONLY way to forgive one); the paid
--       season and its public leaderboards require an account with no open flag. The owner clears a false positive with public.progress_clear_flags (audit note required).
--   B3  characters.save_data gets a size ceiling. The per-user snapshot limit becomes ONE atomic statement (progress_claim_slot).
--   P1  create-checkout: one atomic claim (checkout_claim) that reuses the user's open Stripe session, refuses a parallel second one and applies the rate limit under a lock.
--   P2  Refund / chargeback / revoked Pass removes the player from the paid rankings (public views and my_entry join an ACTIVE, ranking-eligible Pass).
--   P4  livemode on entitlements and payment_events. Only livemode = true Stripe rows count toward the 15 000 goal, the meter and ranking eligibility. Test-mode purchases never count.
--
-- NOT APPLIED by the work that wrote this file. The owner applies it (SQL editor or `supabase db push`), AFTER 0006, in the DEVELOPMENT project first. It was never run against a
-- real database: only read by static tests (supabase/functions/_shared/__tests__/migration0007.test.ts). The SQL TEST PLAN at the end is what proves it for real.
--
-- BACKFILL OF livemode (read this before applying in a project that already sold Passes):
--   * payment_events.livemode is copied from the stored payload (the webhook always kept payload.livemode).
--   * entitlements.livemode is set to true for stripe rows whose payment (payload.ref = provider_ref) arrived in a livemode = true event. Every other existing row (grants, rows
--     without a matching event, test-mode events) stays livemode = false (the column default). So a project that only ever used Stripe test mode ends with ZERO counted Passes,
--     which is correct. A live purchase you recorded some other way must be set by hand: update public.entitlements set livemode = true where provider_ref = '<pi_...>';
--   * Manual grants (source 'grant') never count toward the goal (as before) but still make a player eligible to rank (testers, gifts).
--
-- ROLLBACK (by hand, in this order; the data columns can stay, they are harmless):
--   drop function if exists public.checkout_claim(uuid, integer, integer, integer, integer, integer);
--   drop function if exists public.progress_release_slot(uuid);
--   drop function if exists public.progress_claim_slot(uuid, integer);
--   drop table if exists arena_private.progress_rate;
--   drop function if exists public.progress_clear_flags(uuid, text, boolean);
--   drop function if exists arena_private.has_open_flags(uuid);
--   drop table if exists public.progress_flag_clears;
--   drop function if exists public.progress_account_created_at(uuid);
--   drop function if exists arena_private.account_created_at(uuid);
--   alter table public.characters drop constraint if exists characters_save_data_size_check;
--   drop trigger if exists characters_created_at_guard on public.characters;
--   drop function if exists arena_private.characters_created_at_guard();
--   grant update on public.characters to authenticated; grant insert on public.characters to authenticated;     -- restores the 0001 table-level privileges
--   -- The functions season_apply_snapshot / season_apply_professions / season_my_entry and the two leaderboard views, and paid_pass_count / entitlements_goal_trigger, were REPLACED
--   -- by this file: to go back, re-run the corresponding `create or replace` blocks of 0005 and 0006 (and drop arena_private.owns_ranking_pass afterwards).
--   alter table public.entitlements drop column if exists livemode;  alter table public.payment_events drop column if exists livemode;   -- only after restoring the 0006 functions
--   alter table public.checkout_attempts drop column if exists provider_session_id, drop column if exists session_url, drop column if exists session_expires_at, drop column if exists session_completed;

create schema if not exists arena_private;
revoke all on schema arena_private from public, anon, authenticated;
grant usage on schema arena_private to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- B1. The account age is auth.users.created_at; characters.created_at cannot be edited any more
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function arena_private.account_created_at(p_user_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select u.created_at from auth.users as u where u.id = p_user_id;
$$;

revoke all on function arena_private.account_created_at(uuid) from public, anon, authenticated;

-- PostgREST only exposes the public schema, so the Edge Function (service role) calls this thin wrapper. Clients cannot execute it.
create or replace function public.progress_account_created_at(p_user_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select arena_private.account_created_at(p_user_id);
$$;

revoke all on function public.progress_account_created_at(uuid) from public, anon, authenticated;
grant execute on function public.progress_account_created_at(uuid) to service_role;

-- characters.created_at: stamped by the database clock on insert and immutable on update, whoever writes (a client through RLS, the owner by accident).
-- To change it on purpose (a data fix), disable the trigger in the SQL editor first and enable it again afterwards.
create or replace function arena_private.characters_created_at_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := pg_catalog.now();
  else
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

revoke all on function arena_private.characters_created_at_guard() from public, anon, authenticated;

drop trigger if exists characters_created_at_guard on public.characters;
create trigger characters_created_at_guard
  before insert or update on public.characters
  for each row
  execute function arena_private.characters_created_at_guard();

-- Column-level privileges for the client roles: exactly the columns src/game/saveRepository.ts writes (create: user_id, hero_name, save_data, save_schema_version, revision,
-- imported_from_legacy; save: hero_name, save_data, save_schema_version, revision). created_at, updated_at and id are not writable by a client. updated_at is still set by the
-- 0001 trigger (a trigger needs no column privilege). Revoking the table-level privilege first is what makes the column grants the whole truth.
revoke insert, update on public.characters from anon, authenticated;
grant insert (user_id, hero_name, save_data, save_schema_version, revision, imported_from_legacy) on public.characters to authenticated;
grant update (hero_name, save_data, save_schema_version, revision) on public.characters to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- B3. A ceiling on characters.save_data. 294912 = 288 * 1024 = MAX_SAVE_UPLOAD_BYTES in src/game/saveUpload.ts (a test pins the two together).
-- pg_column_size is the size of the stored jsonb value (binary, possibly compressed): a coarse backstop for a client that bypasses the game's own check, never a rule a real
-- save (about 5 to 70 KB) comes near. NOT VALID = existing rows are not scanned; new inserts and updates are checked. After applying, run the VALIDATE line below if the
-- biggest existing save is under the ceiling (see the test plan).
-- ---------------------------------------------------------------------------------------------------------------------------------------
alter table public.characters drop constraint if exists characters_save_data_size_check;
alter table public.characters add constraint characters_save_data_size_check check (pg_catalog.pg_column_size(save_data) <= 294912) not valid;
-- alter table public.characters validate constraint characters_save_data_size_check;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- B3. The per-user snapshot limit as ONE statement. insert ... on conflict do update ... where is atomic: of two parallel callers exactly one changes a row.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists arena_private.progress_rate (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_at timestamptz not null
);

revoke all on table arena_private.progress_rate from public, anon, authenticated;

create or replace function public.progress_claim_slot(p_user_id uuid, p_interval_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  insert into arena_private.progress_rate as r (user_id, last_at)
  values (p_user_id, pg_catalog.now())
  on conflict (user_id) do update
    set last_at = pg_catalog.now()
    where r.last_at <= pg_catalog.now() - pg_catalog.make_interval(secs => p_interval_seconds)
  returning r.user_id into v_user;
  return v_user is not null;
end;
$$;

-- Gives a claimed slot back when the function failed before storing anything.
create or replace function public.progress_release_slot(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from arena_private.progress_rate where user_id = p_user_id;
$$;

revoke all on function public.progress_claim_slot(uuid, integer) from public, anon, authenticated;
revoke all on function public.progress_release_slot(uuid) from public, anon, authenticated;
grant execute on function public.progress_claim_slot(uuid, integer) to service_role;
grant execute on function public.progress_release_slot(uuid) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- B2. Lifetime flags and the owner's way to forgive one.
--   * progress_snapshots rows are written for EVERY player (with or without the Pass, in any season state), so every flagged / rejected snapshot is on record.
--   * has_open_flags(user) = the account has a flagged or rejected snapshot that nobody cleared. The paid season and its public leaderboards require NOT has_open_flags.
--   * An 'ok' snapshot may now carry advisory reasons (FAST_*); only the verdict decides, so an ok snapshot never counts as a flag.
--   * progress_flag_clears is append-only evidence of the owner's decision (who/when/why in `note`).
-- ---------------------------------------------------------------------------------------------------------------------------------------
create index if not exists progress_snapshots_user_ok_idx on public.progress_snapshots (user_id, created_at) where verdict = 'ok';
create index if not exists progress_snapshots_user_flagged_idx on public.progress_snapshots (user_id) where verdict <> 'ok';

create table if not exists public.progress_flag_clears (
  snapshot_id uuid primary key references public.progress_snapshots (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  cleared_at timestamptz not null default now(),
  -- The owner's reason (required): shown in the audit. Never shown to players.
  note text not null,
  constraint progress_flag_clears_note_check check (pg_catalog.char_length(note) between 5 and 500)
);

create index if not exists progress_flag_clears_user_idx on public.progress_flag_clears (user_id);

alter table public.progress_flag_clears enable row level security;
revoke all on table public.progress_flag_clears from public, anon, authenticated;
grant select, insert on table public.progress_flag_clears to service_role;
-- No policy: with RLS on and no policy, clients see and change nothing.

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
      and not exists (select 1 from public.progress_flag_clears as c where c.snapshot_id = s.id)
  );
$$;

revoke all on function arena_private.has_open_flags(uuid) from public, anon, authenticated;

-- OWNER ONLY (SQL editor, or the service role): forgive every open flag of one account after you checked it by hand. The note is mandatory.
--   select public.progress_clear_flags('<user uuid>', 'checked history 2026-11-03: legitimate import of a local save', false);
-- p_adopt_baseline = true also copies the account's newest FLAGGED snapshot as a new 'ok' snapshot (reasons {MANUAL_BASELINE}, stamped now), so the next snapshots are judged
-- against it instead of against the old clean history (use it for a false BASELINE_AHEAD_OF_ACCOUNT_AGE or a legitimate restore, never for a rejected one).
-- It also empties season_entries.flags of that player. Returns how many snapshots were cleared. Nothing is deleted: the snapshots stay, and progress_flag_clears keeps the note.
create or replace function public.progress_clear_flags(p_user_id uuid, p_note text, p_adopt_baseline boolean default false)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_latest public.progress_snapshots%rowtype;
begin
  if p_note is null or pg_catalog.char_length(pg_catalog.btrim(p_note)) < 5 then
    raise exception using errcode = '22023', message = 'AUDIT_NOTE_REQUIRED';
  end if;

  insert into public.progress_flag_clears (snapshot_id, user_id, note)
  select s.id, s.user_id, pg_catalog.btrim(p_note)
  from public.progress_snapshots as s
  where s.user_id = p_user_id
    and s.verdict <> 'ok'
    and not exists (select 1 from public.progress_flag_clears as c where c.snapshot_id = s.id);
  get diagnostics v_count = row_count;

  if p_adopt_baseline then
    select * into v_latest
    from public.progress_snapshots as s
    where s.user_id = p_user_id and s.verdict = 'flagged'
    order by s.created_at desc
    limit 1;
    if found then
      insert into public.progress_snapshots (user_id, save_revision, schema_version, app_version, metrics, metrics_hash, verdict, reasons)
      values (v_latest.user_id, v_latest.save_revision, v_latest.schema_version, v_latest.app_version, v_latest.metrics, v_latest.metrics_hash, 'ok', array['MANUAL_BASELINE']);
    end if;
  end if;

  update public.season_entries set flags = '{}'::text[] where user_id = p_user_id and pg_catalog.cardinality(flags) > 0;
  return v_count;
end;
$$;

revoke all on function public.progress_clear_flags(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.progress_clear_flags(uuid, text, boolean) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- P4. livemode
-- ---------------------------------------------------------------------------------------------------------------------------------------
alter table public.entitlements add column if not exists livemode boolean not null default false;
alter table public.payment_events add column if not exists livemode boolean not null default false;

update public.payment_events set livemode = true where provider = 'stripe' and livemode = false and (payload ->> 'livemode') = 'true';
update public.entitlements as e
set livemode = true
from public.payment_events as pe
where e.source = 'stripe' and e.livemode = false
  and pe.provider = 'stripe' and pe.livemode = true and (pe.payload ->> 'ref') = e.provider_ref;

-- Who may rank: an ACTIVE Pass that is real money (livemode) or a manual grant. A refunded or revoked row, a test-mode Stripe purchase, never. The gameplay perks of a test purchase
-- (arena_private.owns_adventurer_pass, 0003) are unchanged: this function is only for the ranking.
create or replace function arena_private.owns_ranking_pass(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.entitlements as e
    where e.user_id = p_user_id
      and e.kind = 'adventurer_pass'
      and e.status = 'active'
      and (e.livemode or e.source = 'grant')
  );
$$;

revoke all on function arena_private.owns_ranking_pass(uuid) from public, anon, authenticated;

-- The goal and the public meter count real, live, paid, active Passes only.
create or replace function arena_private.paid_pass_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.count(*)::bigint
  from public.entitlements as e
  where e.kind = 'adventurer_pass' and e.status = 'active' and e.source in ('stripe', 'mercadopago') and e.livemode;
$$;

revoke all on function arena_private.paid_pass_count() from public, anon, authenticated;

create or replace function arena_private.entitlements_goal_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'adventurer_pass' and new.status = 'active' and new.livemode and new.source in ('stripe', 'mercadopago') then
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
  after insert or update of status, livemode on public.entitlements
  for each row
  execute function arena_private.entitlements_goal_trigger();

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The ranking functions, replaced: ranking Pass (active + livemode or grant) and, in a ranked (paid) season, no open lifetime flag.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.season_apply_snapshot(p_user_id uuid, p_snapshot_id uuid, p_verdict text, p_reasons text[], p_score bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season integer;
  v_kind text;
  v_entry public.season_entries%rowtype;
  v_exists boolean;
  v_confirmed boolean;
  v_flags text[];
  v_new text[];
begin
  select s.number, s.kind into v_season, v_kind
  from public.seasons as s
  where s.status = 'open' and pg_catalog.now() >= s.starts_at and pg_catalog.now() < s.freeze_at
  order by s.number desc
  limit 1;
  if v_season is null then
    return 'season_not_open';
  end if;

  -- A real, active Pass (a refunded / revoked row or a test-mode purchase does not rank). The snapshots themselves, flagged ones included, are stored for everybody before this runs.
  if not arena_private.owns_ranking_pass(p_user_id) then
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
    -- Flagged or rejected: never moves the score; the reasons are remembered here too (the owner's audit reads the lifetime record in progress_snapshots).
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

  -- The PAID season requires a clean WHOLE history: any flagged or rejected snapshot the owner did not clear keeps the account out, however good this one is.
  if v_kind = 'ranked' and arena_private.has_open_flags(p_user_id) then
    return 'flagged_history';
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

create or replace function public.season_apply_professions(p_user_id uuid, p_snapshot_id uuid, p_verdict text, p_professions jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season integer;
  v_kind text;
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

  select s.number, s.kind into v_season, v_kind
  from public.seasons as s
  where s.status = 'open' and pg_catalog.now() >= s.starts_at and pg_catalog.now() < s.freeze_at
  order by s.number desc
  limit 1;
  if v_season is null then
    return 'season_not_open';
  end if;

  if not arena_private.owns_ranking_pass(p_user_id) then
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

  if v_kind = 'ranked' and arena_private.has_open_flags(p_user_id) then
    return 'flagged_history';
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

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The public views and my_entry, replaced. Visible only: not disqualified, an ACTIVE ranking Pass (a refund or chargeback removes the player at once), and in a ranked (paid)
-- season no stored flag and no open lifetime flag. The pre-season keeps showing the flag count as before. Same columns as before.
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
join public.seasons as s on s.number = e.season
left join public.profiles as p on p.user_id = e.user_id
where e.disqualified = false and e.score > 0
  and arena_private.owns_ranking_pass(e.user_id)
  and (s.kind = 'pre' or (pg_catalog.cardinality(e.flags) = 0 and not arena_private.has_open_flags(e.user_id)));

revoke all on table public.season_leaderboard from public, anon, authenticated;
grant select on table public.season_leaderboard to anon, authenticated;

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
join public.seasons as s on s.number = e.season
left join public.profiles as p on p.user_id = e.user_id
where se.disqualified = false and pg_catalog.cardinality(se.flags) = 0 and e.score > 0
  and arena_private.owns_ranking_pass(e.user_id)
  and (s.kind = 'pre' or not arena_private.has_open_flags(e.user_id));

revoke all on table public.season_profession_leaderboard from public, anon, authenticated;
grant select on table public.season_profession_leaderboard to anon, authenticated;

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
    join public.seasons as s on s.number = e.season
    where e.disqualified = false and e.score > 0
      and arena_private.owns_ranking_pass(e.user_id)
      and (s.kind = 'pre' or (pg_catalog.cardinality(e.flags) = 0 and not arena_private.has_open_flags(e.user_id)))
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
-- P1. checkout_attempts remembers the Stripe session; checkout_claim is the one atomic step of create-checkout.
-- The rules (and their order) are decideCheckoutClaim in supabase/functions/_shared/checkout.ts; the numbers come from the function as parameters.
--   1. an OPEN session of this user (url stored, not paid, expires in more than p_reuse_min_remaining_seconds, created within p_reuse_max_age_seconds): outcome 'reuse'
--   2. an attempt with no session yet, younger than p_pending_seconds (another request is creating one right now): 'in_progress'
--   3. p_max or more attempts inside p_window_seconds: 'rate_limited'
--   4. otherwise a new attempt row is inserted and the caller creates the Stripe session: 'create' (+ attempt_id)
-- The advisory lock is per user and transaction-scoped: two parallel requests of one user serialize here, the second sees the first one's attempt.
-- ---------------------------------------------------------------------------------------------------------------------------------------
alter table public.checkout_attempts add column if not exists provider_session_id text;
alter table public.checkout_attempts add column if not exists session_url text;
alter table public.checkout_attempts add column if not exists session_expires_at timestamptz;
alter table public.checkout_attempts add column if not exists session_completed boolean not null default false;

create unique index if not exists checkout_attempts_session_unique on public.checkout_attempts (provider_session_id) where provider_session_id is not null;
grant select, insert, update, delete on table public.checkout_attempts to service_role;

create or replace function public.checkout_claim(
  p_user_id uuid,
  p_max integer,
  p_window_seconds integer,
  p_pending_seconds integer,
  p_reuse_min_remaining_seconds integer,
  p_reuse_max_age_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_count integer;
  v_id bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('checkout:' || p_user_id::text, 0));

  select a.session_url into v_url
  from public.checkout_attempts as a
  where a.user_id = p_user_id
    and a.session_url is not null
    and not a.session_completed
    and a.session_expires_at is not null
    and a.session_expires_at - pg_catalog.now() >= pg_catalog.make_interval(secs => p_reuse_min_remaining_seconds)
    and pg_catalog.now() - a.created_at <= pg_catalog.make_interval(secs => p_reuse_max_age_seconds)
  order by a.created_at desc
  limit 1;
  if v_url is not null then
    return pg_catalog.jsonb_build_object('outcome', 'reuse', 'session_url', v_url);
  end if;

  if exists (
    select 1 from public.checkout_attempts as a
    where a.user_id = p_user_id and a.session_url is null and pg_catalog.now() - a.created_at < pg_catalog.make_interval(secs => p_pending_seconds)
  ) then
    return pg_catalog.jsonb_build_object('outcome', 'in_progress');
  end if;

  select pg_catalog.count(*) into v_count
  from public.checkout_attempts as a
  where a.user_id = p_user_id and pg_catalog.now() - a.created_at < pg_catalog.make_interval(secs => p_window_seconds);
  if v_count >= p_max then
    return pg_catalog.jsonb_build_object('outcome', 'rate_limited');
  end if;

  insert into public.checkout_attempts (user_id) values (p_user_id) returning id into v_id;
  return pg_catalog.jsonb_build_object('outcome', 'create', 'attempt_id', v_id);
end;
$$;

revoke all on function public.checkout_claim(uuid, integer, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.checkout_claim(uuid, integer, integer, integer, integer, integer) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- OWNER CONTROLS (SQL editor; none of this is run automatically)
--   Forgive a false positive:   select public.progress_clear_flags('<user uuid>', 'why you are sure', false);          -- add true to adopt the newest flagged snapshot as the baseline
--   Who has open flags:         select user_id, count(*) from public.progress_snapshots s where verdict <> 'ok' and not exists (select 1 from public.progress_flag_clears c where c.snapshot_id = s.id) group by 1;
--   What was forgiven and why:  select * from public.progress_flag_clears order by cleared_at desc;
--   Mark a live purchase:       update public.entitlements set livemode = true where provider_ref = '<pi_...>';       (only if the automatic backfill missed it)
--
-- SQL TEST PLAN (run after applying, in the DEV project; nothing here is run automatically)
--
-- A. B1 account age. As the owner: `select public.progress_account_created_at('<user uuid>');` equals `select created_at from auth.users where id = '<user uuid>'`.
--    As `authenticated` (set local role authenticated; select set_config('request.jwt.claims', '{"sub":"<user uuid>","role":"authenticated"}', true);):
--      select public.progress_account_created_at('<uuid>');                       -> permission denied for function
--      update public.characters set created_at = now() - interval '400 days' where user_id = '<user uuid>';   -> permission denied for table characters (column created_at)
--      update public.characters set hero_name = 'Hero', revision = revision where user_id = '<user uuid>';     -> works (the game's save flow)
--      update public.characters set updated_at = now() ...                        -> permission denied
--    As the owner: `update public.characters set created_at = '2020-01-01' where user_id = '<user uuid>'; select created_at ...` -> unchanged (trigger). A fresh insert gets created_at = now().
--    In the game (a signed-in test account): create a hero, then play and let it autosave: both must still succeed.
-- B. B3 size. As `authenticated`: update public.characters set save_data = (select jsonb_build_object('pad', repeat('x', 400000))) where user_id = '<uuid>';  -> violates characters_save_data_size_check
--    (note: a 400 KB string compresses well; if it is accepted, use a value of random text, `select string_agg(md5(random()::text), '') from generate_series(1, 20000)`).
--    A normal save (5 to 70 KB) still saves. Then `select max(pg_column_size(save_data)) from public.characters;` and, if it is well under 294912, run the VALIDATE line above.
-- C. Atomic slot. In two SQL sessions at the same moment run `select public.progress_claim_slot('<uuid>', 600);` -> exactly one returns true. Run it again -> false.
--    `select public.progress_release_slot('<uuid>');` then claim -> true. `update arena_private.progress_rate set last_at = now() - interval '11 minutes' where user_id = '<uuid>';` then claim -> true.
-- D. Lifetime flags. Insert (as the owner) a 'flagged' snapshot for a user, then `select arena_private.has_open_flags('<uuid>');` -> true. With a ranked season open and an ok snapshot:
--      select public.season_apply_snapshot('<uuid>', '<snap>', 'ok', '{}', 4200000);          -> 'flagged_history' (and the user is absent from season_leaderboard of a ranked season)
--      select public.progress_clear_flags('<uuid>', 'ok', false);                             -> AUDIT_NOTE_REQUIRED (note too short)
--      select public.progress_clear_flags('<uuid>', 'checked by hand, legitimate', false);    -> 1; has_open_flags -> false; the same apply call now answers 'updated'
--      A clients' `select public.progress_clear_flags(...)` as authenticated / anon -> permission denied. progress_flag_clears is unreadable for clients.
--    An ok snapshot with reasons {FAST_LEVEL_PACE} does NOT count as a flag. Pre-season (season 0): the same user with an open flag still ranks (and shows flag_count).
-- E. Refund removes from the board. A player with a score on the open ranked season and a livemode Pass: visible in season_leaderboard and season_profession_leaderboard. Then
--      update public.entitlements set status = 'refunded' where user_id = '<uuid>';   -> gone from both views and season_my_entry's rank is null; set it back to 'active' -> visible again.
--      'revoked' (a chargeback) behaves like 'refunded'.
-- F. livemode. Insert a stripe row with livemode = false and status 'active': pass_meter().sold does not change and the goal does not fire; the player does NOT rank (season_apply_snapshot ->
--    'no_pass') but owns the Pass perks (arena_private.owns_adventurer_pass -> true). Set livemode = true: sold + 1, the player ranks. A 'grant' row (livemode false) ranks but is not counted.
--    The backfill: `select count(*) from public.entitlements where source = 'stripe' and livemode;` equals the number of live-mode webhook events recorded in payment_events.
-- G. checkout_claim. As the owner, with an empty attempts table for a user:
--      select public.checkout_claim('<uuid>', 5, 600, 60, 300, 7200);   -> {"outcome":"create","attempt_id":N}
--      the same call at once                                              -> {"outcome":"in_progress"}
--      update public.checkout_attempts set session_url = 'https://checkout.stripe.com/c/pay/x', session_expires_at = now() + interval '1 day' where id = N;
--      the same call                                                       -> {"outcome":"reuse","session_url":"https://checkout.stripe.com/c/pay/x"}
--      update ... set session_completed = true;  the same call             -> a new 'create'
--      with 5 attempts inside 10 minutes and no open session              -> {"outcome":"rate_limited"}
--    Two sessions calling at the same instant for one user produce exactly one 'create'. A client role cannot execute the function.
-- ---------------------------------------------------------------------------------------------------------------------------------------
