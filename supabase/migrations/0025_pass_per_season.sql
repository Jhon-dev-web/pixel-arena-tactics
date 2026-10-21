-- The Adventurer Pass belongs to a season (depends on 0003 entitlements, 0005-0007 seasons / ranking, 0012-0013 crypto Pass, 0016 / 0024 referral grant, 0020 admin_league, 0022 payment exceptions,
-- 0023 leaderboard functions). NOT APPLIED from this repo: the owner runs it (SQL editor or `supabase db push`), in the DEVELOPMENT project first. It is run for real by admin/tests/sql/passseason.integration.test.ts.
--
-- OWNER DECISION (2026-10-21). The Pass covers ONLY the pre-season and Season 1. When Season 2 opens, everything ends for a Season-1 Pass: the perks stop, the ranking / prize eligibility stops, and the player must
-- buy the Season 2 Pass. What the Pass already gave stays in the player's save (items, titles, cosmetics): this file only changes what the SERVER says about "owns the Pass right now".
--
--   * public.entitlements.valid_through_season   the last season the Pass covers. Every existing row is backfilled to 1 (the column default), which is what they were bought for.
--   * arena_private.current_pass_season()        the season a Pass bought now covers. The PRE-SEASON (public.seasons number 0, kind 'pre') is covered by Season 1: only kind 'ranked' seasons are looked at, and
--                                                the answer is never below 1. Order: the latest ranked season that is 'open' or 'frozen'; else the first 'upcoming' ranked one; else the last 'closed' / 'paid' one; else 1.
--   * arena_private.owns_adventurer_pass(uuid)   (perks) and owns_ranking_pass(uuid) (ranking) now ALSO require valid_through_season >= current_pass_season().
--   * arena_private.owns_ranking_pass(uuid, integer)   the ranking question about ONE season (a leaderboard row of season N asks "did he hold a Pass for N?"), so Season 1's final standings keep showing after
--                                                Season 2 opens. season_my_entry, the two leaderboard row functions and admin_league use it.
--   * a BEFORE INSERT trigger stamps every new adventurer_pass row with current_pass_season(), whoever inserts it (Stripe webhook, USDC, a referral reward, a payment-exception grant, a manual grant). To hand out a Pass
--     for another season by hand, UPDATE the column afterwards.
--   * ONE ACTIVE PASS PER USER PER SEASON: the unique index is now (user_id, kind, valid_through_season) where status = 'active'. The old Season-1 row stays 'active' as history; it simply no longer covers anything.
--     The "already owned" answers (create-checkout, pass_crypto_grant, payment_exception_grant_pass, and the Edge Functions through public.pass_owned_now) are true only for a Pass that covers the CURRENT season.
--   * paid_pass_count() (the Pass goal and the public meter) counts only Passes valid for the current season.
--   * public.my_pass_status() (signed-in player) -> { owned, valid_through, current_season } for the game; public.pass_owned_now(uuid) (service role) for the Edge Functions.
--   Not changed on purpose: the referral "paying" rule (it asks whether the friend EVER paid for a Pass), and the descriptive Pass columns of admin_overview / admin_players / admin_player_detail (they list any active row).
--
-- ROLLBACK (by hand; a player who bought a second Pass has two active rows afterwards, revoke one first):
--   drop function if exists public.my_pass_status();  drop function if exists public.pass_owned_now(uuid);  drop function if exists arena_private.owns_ranking_pass(uuid, integer);
--   drop trigger if exists entitlements_stamp_season on public.entitlements;  drop function if exists arena_private.entitlements_stamp_season();
--   drop index if exists public.entitlements_one_active_per_user_kind_season;  create unique index entitlements_one_active_per_user_kind on public.entitlements (user_id, kind) where status = 'active';
--   alter table public.entitlements drop column valid_through_season;  -- and re-run the create-or-replace blocks of owns_* (0003 / 0007), paid_pass_count (0013), pass_crypto_grant (0013),
--   -- payment_exception_grant_pass (0022), season_my_entry (0007), season_*_rows (0023), admin_league (0020); then drop function arena_private.current_pass_season(), arena_private.pass_season_of(integer).

create schema if not exists arena_private;
revoke all on schema arena_private from public, anon, authenticated;

alter table public.entitlements add column if not exists valid_through_season integer not null default 1;
alter table public.entitlements drop constraint if exists entitlements_valid_through_check;
alter table public.entitlements add constraint entitlements_valid_through_check check (valid_through_season >= 1);

-- Keeps the old name as a prefix: db.ts tells "already holds a Pass" from "payment already recorded" by looking for this text in the 409 body.
drop index if exists public.entitlements_one_active_per_user_kind;
create unique index if not exists entitlements_one_active_per_user_kind_season
  on public.entitlements (user_id, kind, valid_through_season)
  where status = 'active';

-- The season a Pass bought NOW covers (see the header). Pre-season counts as Season 1.
create or replace function arena_private.current_pass_season()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(1, coalesce(
    (select s.number from public.seasons as s where s.kind = 'ranked' and s.status in ('open', 'frozen') order by s.number desc limit 1),
    (select s.number from public.seasons as s where s.kind = 'ranked' and s.status = 'upcoming' order by s.number asc limit 1),
    (select s.number from public.seasons as s where s.kind = 'ranked' and s.status in ('closed', 'paid') order by s.number desc limit 1),
    1
  ));
$$;

revoke all on function arena_private.current_pass_season() from public, anon, authenticated;

-- A season number as the Pass sees it: the pre-season (0) is covered by Season 1.
create or replace function arena_private.pass_season_of(p_season integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select greatest(1, p_season);
$$;

revoke all on function arena_private.pass_season_of(integer) from public, anon, authenticated;

create or replace function arena_private.entitlements_stamp_season()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'adventurer_pass' then
    new.valid_through_season := arena_private.current_pass_season();
  end if;
  return new;
end;
$$;

revoke all on function arena_private.entitlements_stamp_season() from public, anon, authenticated;

drop trigger if exists entitlements_stamp_season on public.entitlements;
create trigger entitlements_stamp_season
  before insert on public.entitlements
  for each row execute function arena_private.entitlements_stamp_season();

-- The perks.
create or replace function arena_private.owns_adventurer_pass(p_user_id uuid)
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
      and e.valid_through_season >= arena_private.current_pass_season()
  );
$$;

revoke all on function arena_private.owns_adventurer_pass(uuid) from public, anon, authenticated;

-- The ranking, now.
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
      and e.valid_through_season >= arena_private.current_pass_season()
  );
$$;

revoke all on function arena_private.owns_ranking_pass(uuid) from public, anon, authenticated;

-- The ranking, for ONE season (a row of that season's standings).
create or replace function arena_private.owns_ranking_pass(p_user_id uuid, p_season integer)
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
      and e.valid_through_season >= arena_private.pass_season_of(p_season)
  );
$$;

revoke all on function arena_private.owns_ranking_pass(uuid, integer) from public, anon, authenticated;

-- The Pass goal and the public meter: real, live, paid, active Passes that cover the current season.
create or replace function arena_private.paid_pass_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.count(*)::bigint
  from public.entitlements as e
  where e.kind = 'adventurer_pass' and e.status = 'active' and e.source in ('stripe', 'mercadopago', 'crypto_bsc', 'crypto_sol') and e.livemode
    and e.valid_through_season >= arena_private.current_pass_season();
$$;

revoke all on function arena_private.paid_pass_count() from public, anon, authenticated;

-- What the Edge Functions ask (create-checkout, submit-progress, items, market): "does he hold a Pass for the current season?". Service role only.
create or replace function public.pass_owned_now(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select arena_private.owns_adventurer_pass(p_user_id);
$$;

revoke all on function public.pass_owned_now(uuid) from public, anon, authenticated;
grant execute on function public.pass_owned_now(uuid) to service_role;

-- What the game asks about the signed-in player. valid_through = the last season of his best active Pass (null when he never had one); current_season = what a Pass bought now would cover.
create or replace function public.my_pass_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'owned', arena_private.owns_adventurer_pass((select auth.uid())),
    'valid_through', (select pg_catalog.max(e.valid_through_season) from public.entitlements as e where e.user_id = (select auth.uid()) and e.kind = 'adventurer_pass' and e.status = 'active'),
    'current_season', arena_private.current_pass_season()
  );
$$;

revoke all on function public.my_pass_status() from public, anon;
grant execute on function public.my_pass_status() to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The purchase paths: "already owned" means "already holds a Pass that covers the current season".
-- ---------------------------------------------------------------------------------------------------------------------------------------

create or replace function public.pass_crypto_grant(
  p_user_id uuid,
  p_tx_hash text,
  p_from text,
  p_to text,
  p_amount_units numeric,
  p_required_units numeric,
  p_block_number bigint,
  p_block_time timestamptz,
  p_chain_id integer,
  p_livemode boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intent timestamptz;
  v_inserted integer;
  v_existing public.chain_payments%rowtype;
begin
  if p_tx_hash !~ '^[1-9A-HJ-NP-Za-km-z]{64,90}$' or p_from !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' or p_to !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' then
    raise exception using errcode = '22023', message = 'PASS_CRYPTO_BAD_ARGUMENT';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pass_crypto:' || p_user_id::text, 0));

  select i.created_at into v_intent from public.pass_crypto_intents as i where i.user_id = p_user_id;
  if v_intent is null then
    return pg_catalog.jsonb_build_object('status', 'no_intent');
  end if;
  if p_amount_units < p_required_units or p_block_time < v_intent then
    raise exception using errcode = '22023', message = 'PASS_CRYPTO_MISMATCH';
  end if;

  insert into public.chain_payments (tx_hash, chain_id, livemode, purpose, leg, user_id, reservation_id, from_address, to_address, amount_units, block_number, block_time)
  values (p_tx_hash, p_chain_id, p_livemode, 'pass', 'pass', p_user_id, null, p_from, p_to, p_amount_units, p_block_number, p_block_time)
  on conflict (tx_hash) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    select * into v_existing from public.chain_payments as p where p.tx_hash = p_tx_hash;
    if v_existing.user_id = p_user_id and v_existing.purpose = 'pass' then
      return pg_catalog.jsonb_build_object('status', 'replayed', 'applied', v_existing.status = 'applied');
    end if;
    return pg_catalog.jsonb_build_object('status', 'tx_reused');
  end if;

  if exists (select 1 from public.entitlements as e where e.user_id = p_user_id and e.kind = 'adventurer_pass' and e.status = 'active' and e.valid_through_season >= arena_private.current_pass_season()) then
    update public.chain_payments as p set status = 'refund_due', note = 'pass already owned' where p.tx_hash = p_tx_hash;
    perform arena_private.market_log('pass_duplicate_payment', p_user_id, null, null, pg_catalog.jsonb_build_object('tx_hash', p_tx_hash));
    return pg_catalog.jsonb_build_object('status', 'already_owned');
  end if;

  begin
    insert into public.entitlements (user_id, kind, source, provider_ref, status, livemode)
    values (p_user_id, 'adventurer_pass', 'crypto_sol', p_tx_hash, 'active', p_livemode);
  exception when unique_violation then
    update public.chain_payments as p set status = 'refund_due', note = 'pass already owned (race)' where p.tx_hash = p_tx_hash;
    return pg_catalog.jsonb_build_object('status', 'already_owned');
  end;
  perform arena_private.market_log('pass_granted', p_user_id, null, null, pg_catalog.jsonb_build_object('tx_hash', p_tx_hash, 'livemode', p_livemode));
  return pg_catalog.jsonb_build_object('status', 'granted');
end;
$$;

revoke all on function public.pass_crypto_grant(uuid, text, text, text, numeric, numeric, bigint, timestamptz, integer, boolean) from public, anon, authenticated;
grant execute on function public.pass_crypto_grant(uuid, text, text, text, numeric, numeric, bigint, timestamptz, integer, boolean) to service_role;

create or replace function arena_private.payment_exception_grant_pass(p_signature text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_x public.payment_exceptions%rowtype;
  v_entitlement uuid;
begin
  select * into v_x from public.payment_exceptions as x where x.signature = p_signature for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'PAYMENT_EXCEPTION_NOT_FOUND';
  end if;
  if v_x.status <> 'open' then
    raise exception using errcode = '22023', message = 'PAYMENT_EXCEPTION_NOT_OPEN';
  end if;
  if v_x.purpose <> 'pass' or v_x.user_id is null then
    raise exception using errcode = '22023', message = 'PAYMENT_EXCEPTION_NOT_A_PASS_PAYMENT';
  end if;
  if exists (select 1 from public.entitlements as e where e.user_id = v_x.user_id and e.kind = 'adventurer_pass' and e.status = 'active' and e.valid_through_season >= arena_private.current_pass_season()) then
    raise exception using errcode = '22023', message = 'PAYMENT_EXCEPTION_ALREADY_OWNED';
  end if;

  insert into public.entitlements (user_id, kind, source, provider_ref, status, livemode)
  values (v_x.user_id, 'adventurer_pass', 'grant', p_signature, 'active', v_x.livemode)
  returning id into v_entitlement;

  update public.payment_exceptions as x set status = 'granted', resolution_ref = v_entitlement::text, resolved_at = pg_catalog.now() where x.id = v_x.id;
  perform arena_private.market_log('payment_exception_granted', v_x.user_id, null, null, pg_catalog.jsonb_build_object('signature', p_signature, 'entitlement', v_entitlement));
  return pg_catalog.jsonb_build_object('status', 'granted', 'entitlement_id', v_entitlement);
end;
$$;

revoke all on function arena_private.payment_exception_grant_pass(text) from public, anon, authenticated;

-- The ranking reads: each row asks for the Pass of ITS season.
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
      and arena_private.owns_ranking_pass(e.user_id, e.season)
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
    and arena_private.owns_ranking_pass(e.user_id, e.season)
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
    and arena_private.owns_ranking_pass(e.user_id, e.season)
    and (s.kind = 'pre' or not arena_private.has_open_flags(e.user_id));
$$;

create or replace function public.admin_league(p_season integer default null, p_top integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_top integer;
  v_season integer;
  v_status jsonb;
  v_goal jsonb;
  v_counts jsonb;
  v_rows jsonb;
  v_seasons jsonb;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_ONLY';
  end if;

  v_top := least(greatest(coalesce(p_top, 50), 1), 500);
  v_season := coalesce(p_season, (select s.number from public.seasons as s where s.status in ('open', 'frozen') order by (s.kind = 'ranked') desc, s.number desc limit 1));

  select jsonb_build_object('number', s.number, 'kind', s.kind, 'status', s.status, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'freeze_at', s.freeze_at, 'prize_note', s.prize_note)
  into v_status
  from public.seasons as s
  where s.number = v_season;

  select jsonb_build_object(
    'target', g.target,
    'paid', arena_private.paid_pass_count(),
    'season_number', g.season_number,
    'opened_at', g.opened_at,
    'reset_at', g.reset_at
  ) into v_goal
  from arena_private.season_goal as g
  where g.id;

  select coalesce(jsonb_agg(jsonb_build_object('number', s.number, 'kind', s.kind, 'status', s.status) order by s.number), '[]'::jsonb) into v_seasons from public.seasons as s;

  select jsonb_build_object(
    'entries', count(*),
    'with_score', count(*) filter (where e.score > 0),
    'flagged', count(*) filter (where cardinality(e.flags) > 0),
    'disqualified', count(*) filter (where e.disqualified)
  ) into v_counts
  from public.season_entries as e
  where e.season = v_season;

  select coalesce(jsonb_agg(jsonb_build_object(
    'audit_rank', t.rn,
    'user_id', t.user_id,
    'username', t.username,
    'score', t.score,
    'level_total', (t.score / 1000000),
    'hero_level', least((t.score / 1000000), 100),
    'paragon_level', greatest((t.score / 1000000) - 100, 0),
    'highest_floor', least((t.score % 1000000), 100),
    'deepest_depth', greatest((t.score % 1000000) - 100, 0),
    'tiebreak_at', t.tiebreak_at,
    'entry_flags', coalesce(to_jsonb(t.flags), '[]'::jsonb),
    'open_flags', t.open_flags,
    'item_flags', t.item_flags,
    'disqualified', t.disqualified,
    'has_pass', t.pass_ok,
    'eligible', (not t.disqualified and t.pass_ok and (t.kind = 'pre' or (cardinality(t.flags) = 0 and not t.open_flags)))
  ) order by t.rn), '[]'::jsonb)
  into v_rows
  from (
    select row_number() over (order by e.score desc, e.tiebreak_at asc, e.user_id) as rn,
           e.user_id, pr.username, e.score, e.tiebreak_at, e.flags, e.disqualified, s.kind,
           arena_private.has_open_flags(e.user_id) as open_flags,
           arena_private.has_item_flags(e.user_id) as item_flags,
           arena_private.owns_ranking_pass(e.user_id, e.season) as pass_ok
    from public.season_entries as e
    join public.seasons as s on s.number = e.season
    left join public.profiles as pr on pr.user_id = e.user_id
    where e.season = v_season and e.score > 0
    order by e.score desc, e.tiebreak_at asc, e.user_id
    limit v_top
  ) as t;

  return jsonb_build_object('season', v_status, 'goal', v_goal, 'counts', v_counts, 'seasons', v_seasons, 'top', v_rows);
end;
$$;

revoke all on function public.admin_league(integer, integer) from public, anon, authenticated;
grant execute on function public.admin_league(integer, integer) to authenticated;
