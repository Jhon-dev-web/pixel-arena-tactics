-- The community task "Entrar no Discord": the player links his Discord account, the server checks that he is a member of the game's Discord server, and a verified account gets a Gold reward FOR THE SEASON
-- (depends on 0028 server credit ledger, 0033 Pioneer kit, 0009 reset_at). NOT APPLIED from this repo: the owner runs it (SQL editor or `supabase db push`), in the DEVELOPMENT project first. It is run for
-- real by admin/tests/sql/discord.integration.test.ts (an in-memory Postgres).
--
-- OWNER DECISION (2026-10-22). Pre-season Gold is wiped at the League reset, so the reward is not handed out during the pre-season:
--   * League not open yet (arena_private.season_goal.reset_at is null): a verified account only has a LINK row. When reset_at is stamped, a NEW trigger (next to the Pioneer kit's trigger of 0033, which is NOT
--     touched) puts one Gold credit (source 'discord') in the server ledger of every verified account: it lands on the reset hero, exactly like the Pioneer chest.
--   * League open: the credit is inserted the moment the link is verified.
-- One reward per game account (the ledger's server_credits_once: source, source_ref, user_id) AND per Discord user id (a unique index on verified links: a Discord account cannot be reused on another game account).
--
-- THE AMOUNT (the ONE place on the server is arena_private.discord_reward(); src/game/discordTask.ts mirrors it and a test pins the two together): 500 Gold. To change it, see docs/DISCORD_TASK.md
-- (a new `create or replace function arena_private.discord_reward()` with the new number, and the constant in the game). Credits already inserted keep the amount they were created with.
--
-- NO DISCORD TOKEN IS EVER STORED. The Edge Function discord-link-callback exchanges the OAuth code, reads the user id and the guild membership with the access token, revokes it and calls
-- public.discord_link_complete(user, discord_user_id, is_member) with the RESULT only. What the database keeps is the Discord user id (a public snowflake) and the verdict.
--
-- WHAT THIS FILE DOES
--   1. server_credits.source also accepts 'discord' (0033 allowed 'promo' and 'pioneer'). The ledger row is ('discord', 'discord-gold') per user.
--   2. arena_private.discord_links (one row per game account) and arena_private.discord_oauth_states (random state of the OAuth round trip: 10 minutes, single use). Both are closed to the API roles.
--   3. arena_private.discord_reward() the amount; arena_private.grant_discord_credit(user) one account; arena_private.grant_discord_credits(reset_at) every verified account; the trigger on season_goal.
--   4. Service-role RPCs for the two Edge Functions: public.discord_state_create, public.discord_state_consume, public.discord_link_complete.
--   5. public.my_discord_task() for the game: {linked, verified, reward, reward_amount}.
--
-- ROLLBACK (by hand; export arena_private.discord_links and server_credits where source = 'discord' first, they are the record of who was owed what):
--   drop trigger if exists season_goal_discord_task on arena_private.season_goal;
--   drop function if exists arena_private.season_goal_discord_task();
--   drop function if exists public.my_discord_task();
--   drop function if exists public.discord_link_complete(uuid, text, boolean);
--   drop function if exists public.discord_state_consume(text);
--   drop function if exists public.discord_state_create(uuid, text);
--   drop function if exists arena_private.grant_discord_credits(timestamptz);
--   drop function if exists arena_private.grant_discord_credit(uuid);
--   drop function if exists arena_private.discord_reward();
--   drop table if exists arena_private.discord_oauth_states;
--   drop table if exists arena_private.discord_links;
--   delete from arena_private.server_credits where source = 'discord';
--   alter table arena_private.server_credits drop constraint if exists server_credits_source_check;
--   alter table arena_private.server_credits add constraint server_credits_source_check check (source in ('promo', 'pioneer'));

create schema if not exists arena_private;
revoke all on schema arena_private from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- 1. The ledger learns a new source.
-- ---------------------------------------------------------------------------------------------------------------------------------------
alter table arena_private.server_credits drop constraint if exists server_credits_source_check;
alter table arena_private.server_credits add constraint server_credits_source_check check (source in ('promo', 'pioneer', 'discord'));

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- 2. The tables.
-- ---------------------------------------------------------------------------------------------------------------------------------------
-- One row per game account that went through the check. guild_member is the server's verdict (Discord answered the guild member request with a member); verified_at is set exactly when guild_member is true.
create table if not exists arena_private.discord_links (
  user_id uuid primary key references auth.users (id) on delete cascade,
  discord_user_id text not null,
  guild_member boolean not null,
  checked_at timestamptz not null default pg_catalog.now(),
  verified_at timestamptz,
  constraint discord_links_id_shape check (discord_user_id ~ '^[0-9]{15,25}$'),
  constraint discord_links_verified_shape check ((guild_member and verified_at is not null) or (not guild_member and verified_at is null))
);

-- A Discord account verifies ONE game account. (A link that is not verified does not reserve the Discord id.)
create unique index if not exists discord_links_verified_discord_uniq on arena_private.discord_links (discord_user_id) where guild_member;

alter table arena_private.discord_links enable row level security;
revoke all on table arena_private.discord_links from public, anon, authenticated;

-- The random `state` of one OAuth round trip. Single use (deleted when consumed) and valid for 10 minutes.
create table if not exists arena_private.discord_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null default pg_catalog.now() + interval '10 minutes',
  constraint discord_oauth_states_shape check (state ~ '^[A-Za-z0-9_-]{32,128}$')
);

create index if not exists discord_oauth_states_user_idx on arena_private.discord_oauth_states (user_id);

alter table arena_private.discord_oauth_states enable row level security;
revoke all on table arena_private.discord_oauth_states from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- 3. The amount (one place) and the grants.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function arena_private.discord_reward()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object('gold', 500, 'source_ref', 'discord-gold');
$$;

revoke all on function arena_private.discord_reward() from public, anon, authenticated;

-- Hands the Gold credit to ONE verified account. Does nothing (returns false) when the League has not opened, when the account is not verified, or when it already has the credit.
create or replace function arena_private.grant_discord_credit(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reward jsonb := arena_private.discord_reward();
  v_n integer;
begin
  if p_user is null or not exists (select 1 from arena_private.season_goal as g where g.id and g.reset_at is not null) then
    return false;
  end if;
  insert into arena_private.server_credits (user_id, kind, item_id, amount, source, source_ref)
  select l.user_id, 'gold', null, (v_reward ->> 'gold')::integer, 'discord', v_reward ->> 'source_ref'
  from arena_private.discord_links as l
  where l.user_id = p_user and l.guild_member
  on conflict on constraint server_credits_once do nothing;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

revoke all on function arena_private.grant_discord_credit(uuid) from public, anon, authenticated;

-- The League opened: one Gold credit for every verified account. Returns how many rows it inserted; running it again inserts nothing (server_credits_once).
create or replace function arena_private.grant_discord_credits(p_reset_at timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reward jsonb := arena_private.discord_reward();
  v_n integer;
begin
  if p_reset_at is null then
    return 0;
  end if;
  with ins as (
    insert into arena_private.server_credits (user_id, kind, item_id, amount, source, source_ref)
    select l.user_id, 'gold', null, (v_reward ->> 'gold')::integer, 'discord', v_reward ->> 'source_ref'
    from arena_private.discord_links as l
    where l.guild_member
    on conflict on constraint server_credits_once do nothing
    returning 1
  )
  select pg_catalog.count(*)::integer into v_n from ins;
  return v_n;
end;
$$;

revoke all on function arena_private.grant_discord_credits(timestamptz) from public, anon, authenticated;

create or replace function arena_private.season_goal_discord_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reset_at is not null and old.reset_at is null then
    perform arena_private.grant_discord_credits(new.reset_at);
  end if;
  return new;
end;
$$;

revoke all on function arena_private.season_goal_discord_task() from public, anon, authenticated;

drop trigger if exists season_goal_discord_task on arena_private.season_goal;
create trigger season_goal_discord_task
  after update of reset_at on arena_private.season_goal
  for each row
  execute function arena_private.season_goal_discord_task();

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- 4. The Edge Functions' side (service role only).
-- ---------------------------------------------------------------------------------------------------------------------------------------
-- discord-link-start: stores the state of a new round trip. -> {status: 'ok' | 'already_verified' | 'rate_limited'}. Expired states are swept first; an account may hold 10 live states at once.
create or replace function public.discord_state_create(p_user uuid, p_state text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_user is null or p_state is null or p_state !~ '^[A-Za-z0-9_-]{32,128}$' then
    raise exception using errcode = '22023', message = 'DISCORD_BAD_STATE';
  end if;
  if exists (select 1 from arena_private.discord_links as l where l.user_id = p_user and l.guild_member) then
    return pg_catalog.jsonb_build_object('status', 'already_verified');
  end if;
  delete from arena_private.discord_oauth_states as s where s.expires_at <= pg_catalog.now();
  if (select pg_catalog.count(*) from arena_private.discord_oauth_states as s where s.user_id = p_user) >= 10 then
    return pg_catalog.jsonb_build_object('status', 'rate_limited');
  end if;
  insert into arena_private.discord_oauth_states (state, user_id) values (p_state, p_user);
  return pg_catalog.jsonb_build_object('status', 'ok');
end;
$$;

revoke all on function public.discord_state_create(uuid, text) from public, anon, authenticated;
grant execute on function public.discord_state_create(uuid, text) to service_role;

-- discord-link-callback: uses up a state. Returns the account it was made for, or null (unknown, expired or already used). The row is deleted either way: a state works once.
create or replace function public.discord_state_consume(p_state text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_expires timestamptz;
begin
  if p_state is null or p_state !~ '^[A-Za-z0-9_-]{32,128}$' then
    return null;
  end if;
  delete from arena_private.discord_oauth_states as s where s.state = p_state returning s.user_id, s.expires_at into v_user, v_expires;
  if v_user is null or v_expires <= pg_catalog.now() then
    return null;
  end if;
  return v_user;
end;
$$;

revoke all on function public.discord_state_consume(text) from public, anon, authenticated;
grant execute on function public.discord_state_consume(text) to service_role;

-- discord-link-callback: records the verdict. -> {status: 'verified' | 'not_member' | 'already_used' | 'already_verified'}.
--   verified          the account is a member of the guild and the Discord account was free: the link is verified and, if the League is open, the Gold credit is inserted now.
--   not_member        the Discord account is not in the server (yet): the link is stored unverified (the player can try again after joining).
--   already_used      that Discord account already verified ANOTHER game account.
--   already_verified  this game account was verified before (the first link stays, whatever Discord account is sent now).
create or replace function public.discord_link_complete(p_user uuid, p_discord_user_id text, p_is_member boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_user is null or p_is_member is null or p_discord_user_id is null or p_discord_user_id !~ '^[0-9]{15,25}$' then
    raise exception using errcode = '22023', message = 'DISCORD_BAD_LINK';
  end if;
  if not exists (select 1 from auth.users as u where u.id = p_user) then
    raise exception using errcode = '22023', message = 'DISCORD_NO_USER';
  end if;
  -- serialise the answers for one account (a double click, two tabs)
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('discord_link:' || p_user::text, 0));
  if exists (select 1 from arena_private.discord_links as l where l.user_id = p_user and l.guild_member) then
    return pg_catalog.jsonb_build_object('status', 'already_verified');
  end if;
  if not p_is_member then
    insert into arena_private.discord_links (user_id, discord_user_id, guild_member, checked_at, verified_at)
    values (p_user, p_discord_user_id, false, pg_catalog.now(), null)
    on conflict (user_id) do update set discord_user_id = excluded.discord_user_id, guild_member = false, checked_at = excluded.checked_at, verified_at = null;
    return pg_catalog.jsonb_build_object('status', 'not_member');
  end if;
  if exists (select 1 from arena_private.discord_links as l where l.discord_user_id = p_discord_user_id and l.guild_member and l.user_id <> p_user) then
    return pg_catalog.jsonb_build_object('status', 'already_used');
  end if;
  begin
    insert into arena_private.discord_links (user_id, discord_user_id, guild_member, checked_at, verified_at)
    values (p_user, p_discord_user_id, true, pg_catalog.now(), pg_catalog.now())
    on conflict (user_id) do update set discord_user_id = excluded.discord_user_id, guild_member = true, checked_at = excluded.checked_at, verified_at = excluded.verified_at;
  exception
    when unique_violation then
      -- another account verified the same Discord id between the check above and the insert
      return pg_catalog.jsonb_build_object('status', 'already_used');
  end;
  perform arena_private.grant_discord_credit(p_user);
  return pg_catalog.jsonb_build_object('status', 'verified');
end;
$$;

revoke all on function public.discord_link_complete(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.discord_link_complete(uuid, text, boolean) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- 5. The game's question.
-- ---------------------------------------------------------------------------------------------------------------------------------------
-- public.my_discord_task() -> {linked, verified, reward, reward_amount}. linked = the account went through the check (a verdict exists); verified = it is a member; reward = 'none' (not verified),
-- 'pending' (verified, the League has not opened: the Gold arrives at the opening) or 'credited' (the Gold credit exists in the ledger). The Discord user id is never returned.
create or replace function public.my_discord_task()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_link arena_private.discord_links;
  v_reward jsonb := arena_private.discord_reward();
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  select * into v_link from arena_private.discord_links as l where l.user_id = v_user;
  return pg_catalog.jsonb_build_object(
    'linked', v_link.user_id is not null,
    'verified', coalesce(v_link.guild_member, false),
    'reward', case
      when not coalesce(v_link.guild_member, false) then 'none'
      when exists (select 1 from arena_private.server_credits as c where c.user_id = v_user and c.source = 'discord' and c.source_ref = v_reward ->> 'source_ref') then 'credited'
      else 'pending'
    end,
    'reward_amount', (v_reward ->> 'gold')::integer
  );
end;
$$;

revoke all on function public.my_discord_task() from public, anon, authenticated;
grant execute on function public.my_discord_task() to authenticated;

-- Applied AFTER the League already opened: nothing to hand out here (a verified account gets its credit when it is verified). A no-op while reset_at is null, and idempotent.
select arena_private.grant_discord_credits((select g.reset_at from arena_private.season_goal as g where g.id));
