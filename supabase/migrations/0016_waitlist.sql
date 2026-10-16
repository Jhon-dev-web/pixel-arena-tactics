-- Launch waitlist ("Avise-me no lançamento") of the public portal, plus (PART B, at the end of the file) the referral links and their in-game rewards.
--
-- PART A: the waitlist.
--   * public.waitlist           one row per e-mail: the address (lower case), the language, a short "source" (utm/referrer), the HMAC-hashed IP of the sign-up (never the raw IP), the moment of consent,
--                                the moment of unsubscribing. NOBODY on the client side can read or write it: RLS is on, there is no policy, and anon / authenticated have no privilege at all.
--                                Only the Edge Functions waitlist-join / waitlist-unsubscribe (service role) and the owner (SQL editor) touch it.
--   * arena_private.waitlist_limits   atomic fixed-window counters for the rate limits (per hashed IP and per hashed e-mail). One statement = one atomic increment.
--   * arena_private.portal_flags      ONE row of owner switches. show_waitlist_count (default false) decides whether the public may learn how many people signed up.
--   * public.waitlist_join / waitlist_unsubscribe   service-role-only functions: ONE call = one transaction (rate limit + insert).
--   * (part B) arena_private.referral_config / referral_rewards, public.referral_rewards_granted, the counters, the qualification / granting functions, two triggers and the
--     functions waitlist_referral_stats, my_referral_status (the game's Settings) and referral_sweep (periodic job).
--   * public.waitlist_count()   the only thing the public can call: the number of ACTIVE sign-ups (not unsubscribed), or NULL while the owner flag is off.
--
-- PART B (referrals): every sign-up gets a public share code and a private view key; a sign-up that arrives through someone's link records WHO invited it (never oneself, one inviter per e-mail).
--   Rewards are IN-GAME and granted by the server, by tiers the owner edits in arena_private.referral_rewards. Two counters per inviter, both computed live from the database:
--     qualified = invited people who made a game account with the same (confirmed) e-mail and reached hero level 10 AFTER the launch date the owner sets (arena_private.referral_config.launch_at);
--     paying    = invited people whose account holds an ACTIVE, PAID, livemode Adventurer's Pass (stripe, mercadopago, crypto_bsc, crypto_sol: the same list as the Pass goal). A refund or
--                 dispute later takes that person out of the count; a reward ALREADY GRANTED stays.
--   Tiers (default): 1 qualified -> title Recrutador; 3 qualified -> portrait frame; 10 PAYING -> a free Adventurer's Pass (entitlement source 'referral', livemode true; it does NOT count toward the
--   Pass goal or the public meter: paid_pass_count() lists the paid sources and 'referral' is not one of them); 25 qualified -> title Lenda do Recrutamento.
--
-- E-MAIL SENDING IS NOT PART OF THIS. Nothing here sends any e-mail. Confirming addresses (double opt-in) and sending the launch notice need an e-mail provider the owner chooses later;
-- the column confirmed_at is reserved for that and stays NULL until then (docs/WAITLIST.md).
--
-- NOT APPLIED by the work that wrote this file, and NEVER RUN against a real database: only read by static tests (supabase/functions/_shared/__tests__/migration0016.test.ts).
-- The owner applies it AFTER 0015, in the DEVELOPMENT project first, and runs the SQL TEST PLAN at the end.
--
-- ROLLBACK (by hand; it deletes every sign-up, so EXPORT the list first, docs/WAITLIST.md):
--   PART B first: drop trigger if exists referral_snapshot_check on public.progress_snapshots; drop trigger if exists entitlements_referral_check on public.entitlements;
--     drop function if exists public.my_referral_status(); drop function if exists public.referral_sweep(); drop function if exists public.waitlist_referral_stats(text, text, text);
--     drop function if exists arena_private.referral_on_snapshot(); drop function if exists arena_private.referral_on_entitlement(); drop function if exists arena_private.referral_process_user(uuid);
--     drop function if exists arena_private.referral_grant(uuid); drop function if exists arena_private.referral_qualify_user(uuid); drop function if exists arena_private.referral_counts(uuid);
--     drop table if exists public.referral_rewards_granted; drop table if exists arena_private.referral_rewards; drop table if exists arena_private.referral_config;
--     (a Pass already granted with source 'referral' is an ordinary entitlement: revoke it first to take it back: update public.entitlements set status = 'revoked' where source = 'referral';
--      then, only when no 'referral' row exists:  alter table public.entitlements drop constraint entitlements_source_check;
--      alter table public.entitlements add constraint entitlements_source_check check (source in ('stripe', 'mercadopago', 'crypto_bsc', 'crypto_sol', 'grant'));)
--   drop function if exists public.waitlist_count();
--   drop function if exists public.waitlist_unsubscribe(uuid, text);
--   drop function if exists public.waitlist_join(text, text, text, text, text, text, text, text, text);
--   drop function if exists arena_private.email_canonical(text);
--   drop function if exists arena_private.waitlist_hit(text, integer, integer);
--   drop table if exists arena_private.waitlist_limits;
--   drop table if exists public.waitlist;
--   drop table if exists arena_private.portal_flags;
--   (citext is left installed: other things may use it.)

create schema if not exists arena_private;
revoke all on schema arena_private from public, anon, authenticated;
grant usage on schema arena_private to service_role;

create extension if not exists citext with schema extensions;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- portal_flags: one row, owner switches for the public portal. Default: nothing is public.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists arena_private.portal_flags (
  id boolean primary key default true,
  show_waitlist_count boolean not null default false,
  constraint portal_flags_single_row check (id)
);

insert into arena_private.portal_flags (id) values (true) on conflict (id) do nothing;

alter table arena_private.portal_flags enable row level security;
revoke all on table arena_private.portal_flags from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- waitlist
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  -- citext: unique without regard to case. The Edge Function also lower-cases before storing, and the check below keeps it that way for rows the owner inserts by hand.
  email extensions.citext not null,
  locale text not null default 'pt',
  -- Where the visitor came from: a short utm_source / referrer host, set by the portal. Free text, 64 characters at most, never trusted for anything but statistics.
  source text,
  -- HMAC-SHA256 (key = the secret WAITLIST_SECRET) of the sign-up IP and of its /24 (IPv4) or /48 (IPv6) network. The raw IP is never stored. Used only for abuse checks.
  ip_hash text,
  subnet_hash text,
  consent_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  -- PART B. ref_code: the PUBLIC share code (10 characters, unguessable, in the link ?ref=CODE). view_key_hash: HMAC of the PRIVATE key shown only to the person at sign-up (the portal keeps it
  -- in that browser); it lets the portal show the counters. email_canon: the address without +tags (and without dots for gmail): the same person under several aliases counts once.
  -- referred_by: who invited this sign-up (decided once, at insert; never changes). referral_ignored: why a ?ref= was NOT counted (unknown_code, self_email, self_ip), for the owner's audit.
  -- qualified_at: when this invited person qualified (game account with this e-mail + hero level, see arena_private.referral_config).
  ref_code text not null,
  view_key_hash text not null,
  email_canon text not null,
  referred_by uuid references public.waitlist (id) on delete set null,
  referral_ignored text,
  qualified_at timestamptz,
  -- Reserved for a future double opt-in (needs an e-mail provider). NULL until then.
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  constraint waitlist_email_unique unique (email),
  constraint waitlist_email_shape check (pg_catalog.char_length(email::text) between 3 and 254 and email::text = pg_catalog.lower(email::text) and email::text like '%_@_%.__%'),
  constraint waitlist_locale_check check (locale in ('pt', 'en')),
  constraint waitlist_source_check check (source is null or pg_catalog.char_length(source) between 1 and 64),
  constraint waitlist_ref_code_key unique (ref_code),
  constraint waitlist_ref_code_shape check (ref_code ~ '^[A-HJ-NP-Z2-9]{10}$'),
  constraint waitlist_view_key_hash_shape check (view_key_hash ~ '^[0-9a-f]{64}$'),
  constraint waitlist_referral_ignored_check check (referral_ignored is null or referral_ignored in ('unknown_code', 'self_email', 'self_ip')),
  constraint waitlist_not_own_referrer check (referred_by is distinct from id)
);

create index if not exists waitlist_created_at_idx on public.waitlist (created_at);
create index if not exists waitlist_source_idx on public.waitlist (source) where source is not null;
create index if not exists waitlist_ip_hash_idx on public.waitlist (ip_hash) where ip_hash is not null;
create index if not exists waitlist_subnet_hash_idx on public.waitlist (subnet_hash) where subnet_hash is not null;
create index if not exists waitlist_referred_by_idx on public.waitlist (referred_by) where referred_by is not null;
create index if not exists waitlist_email_canon_idx on public.waitlist (email_canon);

alter table public.waitlist enable row level security;
-- No policy on purpose, and no privilege for the client roles: with RLS on and no policy, anon / authenticated see and change nothing (and the revoke makes it a hard permission error).
revoke all on table public.waitlist from public, anon, authenticated;
grant select, insert, update on table public.waitlist to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Rate limits: fixed windows, one atomic upsert per hit.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists arena_private.waitlist_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);

alter table arena_private.waitlist_limits enable row level security;
revoke all on table arena_private.waitlist_limits from public, anon, authenticated;

-- One statement counts the hit and tells whether it is still within the limit. Two requests at the same instant cannot both read the old number: the upsert takes the row lock.
create or replace function arena_private.waitlist_hit(p_bucket text, p_window_seconds integer, p_max integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits integer;
begin
  if p_bucket is null or pg_catalog.char_length(p_bucket) not between 1 and 200 or p_window_seconds < 1 or p_max < 1 then
    raise exception using errcode = '22023', message = 'WAITLIST_LIMIT_ARGS';
  end if;
  insert into arena_private.waitlist_limits as l (bucket, window_start, hits)
  values (p_bucket, pg_catalog.to_timestamp(pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.now()) / p_window_seconds) * p_window_seconds), 1)
  on conflict (bucket, window_start) do update set hits = l.hits + 1
  returning hits into v_hits;
  -- Housekeeping: now and then drop windows older than a day.
  if pg_catalog.random() < 0.01 then
    delete from arena_private.waitlist_limits where window_start < pg_catalog.now() - interval '1 day';
  end if;
  return v_hits <= p_max;
end;
$$;

revoke all on function arena_private.waitlist_hit(text, integer, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- PART B config, defined here because waitlist_join reads it. One row; the owner edits it in the SQL editor.
--   launch_at       NULL until the owner sets the launch date: nothing qualifies and no qualified reward is granted before it. A hero-level snapshot older than launch_at never counts.
--   min_hero_level  the level an invited person must reach (default 10).
--   ip_window_hours a referral is IGNORED when it comes from the same (hashed) IP as the inviter within this many hours of the inviter's own sign-up or of another referral of his.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists arena_private.referral_config (
  id boolean primary key default true,
  launch_at timestamptz,
  min_hero_level integer not null default 10,
  ip_window_hours integer not null default 24,
  constraint referral_config_single_row check (id),
  constraint referral_config_level check (min_hero_level between 1 and 100),
  constraint referral_config_window check (ip_window_hours between 1 and 720)
);

insert into arena_private.referral_config (id) values (true) on conflict (id) do nothing;

alter table arena_private.referral_config enable row level security;
revoke all on table arena_private.referral_config from public, anon, authenticated;

-- The same person under several spellings: lower case, no +tag, and no dots / googlemail for gmail.
create or replace function arena_private.email_canonical(p_email text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_lower text := pg_catalog.lower(p_email);
  v_local text := pg_catalog.split_part(v_lower, '@', 1);
  v_domain text := pg_catalog.split_part(v_lower, '@', 2);
begin
  v_local := pg_catalog.split_part(v_local, '+', 1);
  if v_domain in ('gmail.com', 'googlemail.com') then
    v_local := pg_catalog.replace(v_local, '.', '');
    v_domain := 'gmail.com';
  end if;
  return v_local || '@' || v_domain;
end;
$$;

revoke all on function arena_private.email_canonical(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- waitlist_join: rate limits + insert (+ the referral) in ONE call. Returns {"status": "joined" | "exists" | "rate_limited" | "code_taken", "code": "<public share code>"}.
--   "exists" means the address was already on the list (or unsubscribed: an opt-out is never undone by a stranger typing the address); the answer carries that person's real PUBLIC share code
--   (it is in every link they post anyway). The PRIVATE view key is never returned by the database: the Edge Function made one up for this call, and only a "joined" row stores its hash,
--   so typing somebody else's address shows nothing of theirs. "code_taken" = the random p_new_code collided (the Edge Function retries with another).
--   p_ip_hash / p_subnet_hash / p_email_key are HMACs computed by the Edge Function (WAITLIST_SECRET), so neither the raw IP nor a plain address ever lands in the limits table.
--   p_ref_code: the code from ?ref= (already validated as 10 characters), or null. It is recorded on a NEW row only: never on an existing one, so there is one inviter per e-mail, forever.
--     A ref is ignored (recorded in referral_ignored; the sign-up itself is unaffected) when the code is unknown, when it is the same person (same canonical e-mail) or when the IP hash
--     equals the inviter's and the inviter signed up (or got another referral from that IP) less than referral_config.ip_window_hours ago.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.waitlist_join(
  p_email text,
  p_locale text,
  p_source text,
  p_ip_hash text,
  p_subnet_hash text,
  p_email_key text,
  p_ref_code text,
  p_new_code text,
  p_view_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_code text;
  v_canon text := arena_private.email_canonical(p_email);
  v_inviter record;
  v_inviter_id uuid;
  v_ignored text;
  v_window interval;
begin
  -- Limits first, before anything is looked up, so an address that exists is not told apart by being refused.
  if not arena_private.waitlist_hit('global', 3600, 2000)
     or not arena_private.waitlist_hit('ip:' || coalesce(p_ip_hash, 'none'), 3600, 10)
     or not arena_private.waitlist_hit('subnet:' || coalesce(p_subnet_hash, 'none'), 3600, 40)
     or not arena_private.waitlist_hit('email:' || coalesce(p_email_key, 'none'), 3600, 5) then
    return pg_catalog.jsonb_build_object('status', 'rate_limited');
  end if;

  if p_ref_code is not null then
    select w.id, w.email_canon, w.ip_hash, w.created_at into v_inviter from public.waitlist as w where w.ref_code = p_ref_code;
    if not found then
      v_ignored := 'unknown_code';
    elsif v_inviter.email_canon = v_canon then
      v_ignored := 'self_email';
    else
      v_window := pg_catalog.make_interval(hours => coalesce((select c.ip_window_hours from arena_private.referral_config as c where c.id), 24));
      if p_ip_hash is not null and (
           (v_inviter.ip_hash = p_ip_hash and v_inviter.created_at > pg_catalog.now() - v_window)
           or exists (select 1 from public.waitlist as s where s.referred_by = v_inviter.id and s.ip_hash = p_ip_hash and s.created_at > pg_catalog.now() - v_window)
         ) then
        v_ignored := 'self_ip';
      else
        v_inviter_id := v_inviter.id;
      end if;
    end if;
  end if;

  begin
    insert into public.waitlist (email, locale, source, ip_hash, subnet_hash, consent_at, ref_code, view_key_hash, email_canon, referred_by, referral_ignored)
    values (pg_catalog.lower(p_email), p_locale, p_source, p_ip_hash, p_subnet_hash, pg_catalog.now(), p_new_code, p_view_key_hash, v_canon, v_inviter_id, v_ignored)
    on conflict (email) do nothing
    returning id, ref_code into v_id, v_code;
  exception when unique_violation then
    -- only the random public code can collide here (a repeated address is handled by the conflict clause): the caller retries with a new one
    return pg_catalog.jsonb_build_object('status', 'code_taken');
  end;

  if v_id is null then
    select w.ref_code into v_code from public.waitlist as w where w.email = pg_catalog.lower(p_email);
    return pg_catalog.jsonb_build_object('status', 'exists', 'code', v_code);
  end if;
  return pg_catalog.jsonb_build_object('status', 'joined', 'code', v_code);
end;
$$;

revoke all on function public.waitlist_join(text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.waitlist_join(text, text, text, text, text, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- waitlist_unsubscribe: the Edge Function verified the signed token and passes the id it carried. Idempotent: the first moment is kept.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.waitlist_unsubscribe(p_id uuid, p_ip_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not arena_private.waitlist_hit('unsub:' || coalesce(p_ip_key, 'none'), 3600, 30) then
    return pg_catalog.jsonb_build_object('status', 'rate_limited');
  end if;
  update public.waitlist set unsubscribed_at = coalesce(unsubscribed_at, pg_catalog.now()) where id = p_id;
  return pg_catalog.jsonb_build_object('status', 'ok');
end;
$$;

revoke all on function public.waitlist_unsubscribe(uuid, text) from public, anon, authenticated;
grant execute on function public.waitlist_unsubscribe(uuid, text) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- waitlist_count: the number of ACTIVE sign-ups, only while the owner turned the flag on. The grant to anon is permanent (a privilege cannot depend on a value), the answer is what is gated:
-- with the flag off the function returns NULL, which the portal shows as no counter at all. Turn on:  update arena_private.portal_flags set show_waitlist_count = true;
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.waitlist_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when coalesce((select f.show_waitlist_count from arena_private.portal_flags as f where f.id), false)
      then (select pg_catalog.count(*) from public.waitlist as w where w.unsubscribed_at is null)
    else null
  end;
$$;

revoke all on function public.waitlist_count() from public, anon, authenticated;
grant execute on function public.waitlist_count() to anon, authenticated;

-- =======================================================================================================================================
-- PART B: referral links and in-game rewards
-- =======================================================================================================================================

-- The 'referral' source for the free Adventurer's Pass. The list of PAID sources (paid_pass_count, entitlements_goal_trigger, 0013) is NOT touched: a 'referral' Pass is not a sale.
-- (owns_adventurer_pass, the perks, and owns_ranking_pass (livemode = true) treat it like any active Pass.)
alter table public.entitlements drop constraint if exists entitlements_source_check;
alter table public.entitlements
  add constraint entitlements_source_check check (source in ('stripe', 'mercadopago', 'crypto_bsc', 'crypto_sol', 'grant', 'referral'));

-- Identity of a sign-up never changes after insert: nobody (not even a later update) can move a sign-up to another inviter or swap its codes.
create or replace function arena_private.waitlist_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email
    or new.ref_code is distinct from old.ref_code
    or new.view_key_hash is distinct from old.view_key_hash
    -- (the inviter can only become NULL: that is what deleting the inviter's row on request does, via on delete set null)
    or (new.referred_by is distinct from old.referred_by and new.referred_by is not null) then
    raise exception using errcode = '23514', message = 'WAITLIST_IDENTITY_IMMUTABLE';
  end if;
  return new;
end;
$$;

revoke all on function arena_private.waitlist_guard() from public, anon, authenticated;

drop trigger if exists waitlist_guard on public.waitlist;
create trigger waitlist_guard
  before update on public.waitlist
  for each row
  execute function arena_private.waitlist_guard();

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The reward tiers: THE ONE PLACE the owner edits. metric 'qualified' = invited people who qualified; 'paying' = invited people who BOUGHT the Pass (live count).
-- kind 'title' / 'cosmetic': a row in referral_rewards_granted that the game reads (reward_ref is the id the game maps to its own title / portrait frame).
-- kind 'pass': a free Adventurer's Pass (entitlement source 'referral', livemode true). Change a tier with an ordinary update; a reward already granted is never taken back.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists arena_private.referral_rewards (
  id smallint generated always as identity primary key,
  metric text not null,
  min_count integer not null,
  kind text not null,
  reward_ref text not null,
  label_pt text not null,
  label_en text not null,
  active boolean not null default true,
  constraint referral_rewards_metric_check check (metric in ('qualified', 'paying')),
  constraint referral_rewards_kind_check check (kind in ('title', 'cosmetic', 'pass')),
  constraint referral_rewards_min_check check (min_count between 1 and 100000),
  constraint referral_rewards_ref_check check (pg_catalog.char_length(reward_ref) between 1 and 80),
  constraint referral_rewards_tier_unique unique (metric, min_count)
);

insert into arena_private.referral_rewards (metric, min_count, kind, reward_ref, label_pt, label_en)
values
  ('qualified', 1, 'title', 'recruiter', 'Título: Recrutador', 'Title: Recruiter'),
  ('qualified', 3, 'cosmetic', 'portrait_frame_recruiter', 'Moldura de retrato: Recrutador', 'Portrait frame: Recruiter'),
  ('paying', 10, 'pass', 'adventurer_pass', 'Passe de Aventureiro grátis', 'Free Adventurer’s Pass'),
  ('qualified', 25, 'title', 'recruitment_legend', 'Título: Lenda do Recrutamento', 'Title: Recruitment Legend')
on conflict (metric, min_count) do nothing;

alter table arena_private.referral_rewards enable row level security;
revoke all on table arena_private.referral_rewards from public, anon, authenticated;

-- What each account was given. The game reads its own rows (select own) and shows them on login; only the server writes.
create table if not exists public.referral_rewards_granted (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  metric text not null,
  min_count integer not null,
  kind text not null,
  reward_ref text not null,
  granted_at timestamptz not null default pg_catalog.now(),
  constraint referral_rewards_granted_tier_unique unique (user_id, metric, min_count)
);

create index if not exists referral_rewards_granted_user_idx on public.referral_rewards_granted (user_id);

alter table public.referral_rewards_granted enable row level security;
revoke all on table public.referral_rewards_granted from public, anon, authenticated;
grant select on table public.referral_rewards_granted to authenticated;
grant select, insert on table public.referral_rewards_granted to service_role;

drop policy if exists referral_rewards_granted_select_own on public.referral_rewards_granted;
create policy referral_rewards_granted_select_own
  on public.referral_rewards_granted
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The two counters of an inviter, computed live (so a refunded Pass drops out at once). Aliases of the same person count once; the inviter's own alias never counts.
--   referred  = counted invitations; qualified = invited people with qualified_at; paying = invited people whose account holds an active, paid, livemode Pass.
-- The paid sources are the SAME list as arena_private.paid_pass_count() (0013) and 'referral' / 'grant' are not in it.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function arena_private.referral_counts(p_waitlist_id uuid)
returns table (referred integer, qualified integer, paying integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (pg_catalog.count(distinct r.email_canon))::integer,
    (pg_catalog.count(distinct r.email_canon) filter (where r.qualified_at is not null))::integer,
    (pg_catalog.count(distinct r.email_canon) filter (where exists (
      select 1
      from auth.users as u
      join public.entitlements as e on e.user_id = u.id
      where pg_catalog.lower(u.email) = r.email::text
        and e.kind = 'adventurer_pass' and e.status = 'active' and e.livemode
        and e.source in ('stripe', 'mercadopago', 'crypto_bsc', 'crypto_sol')
    )))::integer
  from public.waitlist as r
  where r.referred_by = p_waitlist_id
    and r.email_canon <> coalesce((select s.email_canon from public.waitlist as s where s.id = p_waitlist_id), '');
$$;

revoke all on function arena_private.referral_counts(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- QUALIFICATION. An invited sign-up qualifies when a game account with the SAME e-mail, confirmed, has an accepted ('ok') progress snapshot taken after the launch date with a hero at
-- min_hero_level or more. progress_snapshots is written only by the submit-progress Edge Function (server clock, plausibility audit), so the level is not the client's word.
-- Nothing qualifies while referral_config.launch_at is NULL or in the future.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function arena_private.referral_qualify_user(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  update public.waitlist as w
  set qualified_at = pg_catalog.now()
  from auth.users as u, arena_private.referral_config as c
  where u.id = p_user_id
    and u.email_confirmed_at is not null
    and pg_catalog.lower(u.email) = w.email::text
    and c.id and c.launch_at is not null and c.launch_at <= pg_catalog.now()
    and w.referred_by is not null
    and w.qualified_at is null
    and exists (
      select 1
      from public.progress_snapshots as s
      where s.user_id = u.id
        and s.verdict = 'ok'
        and s.created_at >= c.launch_at
        and (s.metrics ->> 'heroLevel')::numeric >= c.min_hero_level
    );
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function arena_private.referral_qualify_user(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- GRANTING. For one inviter (a waitlist row): find his game account (same e-mail, confirmed), read the two counters and grant every active tier he reached and does not have yet. Idempotent:
-- a tier is granted once per account (unique user_id, metric, min_count), a second call changes nothing; the free Pass is inserted with a fixed provider_ref, so it can exist only once.
-- If the account already holds an active Pass the free one is NOT created and the tier stays ungranted (a later sweep tries again if that Pass is ever refunded or revoked).
-- A reward already granted is never withdrawn, even if a counted purchase is refunded afterwards.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function arena_private.referral_grant(p_waitlist_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_counts record;
  v_tier record;
  v_entitlement uuid;
  v_granted integer := 0;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_waitlist_id::text, 16));
  select u.id into v_user
  from public.waitlist as w
  join auth.users as u on pg_catalog.lower(u.email) = w.email::text and u.email_confirmed_at is not null
  where w.id = p_waitlist_id
  limit 1;
  if v_user is null then
    return 0;
  end if;
  select * into v_counts from arena_private.referral_counts(p_waitlist_id);
  for v_tier in select * from arena_private.referral_rewards as r where r.active order by r.min_count loop
    if (case v_tier.metric when 'paying' then v_counts.paying else v_counts.qualified end) < v_tier.min_count then
      continue;
    end if;
    if exists (select 1 from public.referral_rewards_granted as g where g.user_id = v_user and g.metric = v_tier.metric and g.min_count = v_tier.min_count) then
      continue;
    end if;
    if v_tier.kind = 'pass' then
      v_entitlement := null;
      insert into public.entitlements (user_id, kind, source, provider_ref, status, livemode)
      values (v_user, 'adventurer_pass', 'referral', 'referral-' || v_user::text, 'active', true)
      on conflict do nothing
      returning id into v_entitlement;
      if v_entitlement is null then
        continue;
      end if;
    end if;
    insert into public.referral_rewards_granted (user_id, metric, min_count, kind, reward_ref)
    values (v_user, v_tier.metric, v_tier.min_count, v_tier.kind, v_tier.reward_ref)
    on conflict do nothing;
    v_granted := v_granted + 1;
  end loop;
  return v_granted;
end;
$$;

revoke all on function arena_private.referral_grant(uuid) from public, anon, authenticated;

-- One account just did something that can matter (a progress snapshot, a Pass purchase): qualify his own sign-up, then grant to his inviter and to himself (he may be an inviter too).
create or replace function arena_private.referral_process_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_self record;
begin
  select w.id, w.referred_by into v_self
  from public.waitlist as w
  join auth.users as u on pg_catalog.lower(u.email) = w.email::text
  where u.id = p_user_id
  limit 1;
  if not found then
    return;
  end if;
  perform arena_private.referral_qualify_user(p_user_id);
  if v_self.referred_by is not null then
    perform arena_private.referral_grant(v_self.referred_by);
  end if;
  perform arena_private.referral_grant(v_self.id);
end;
$$;

revoke all on function arena_private.referral_process_user(uuid) from public, anon, authenticated;

-- The triggers: real time, and they can NEVER block or undo a snapshot or a payment (any error becomes a warning; the periodic sweep catches up).
create or replace function arena_private.referral_on_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform arena_private.referral_process_user(new.user_id);
  exception when others then
    raise warning 'referral_process_user failed: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function arena_private.referral_on_snapshot() from public, anon, authenticated;

drop trigger if exists referral_snapshot_check on public.progress_snapshots;
create trigger referral_snapshot_check
  after insert on public.progress_snapshots
  for each row
  when (new.verdict = 'ok')
  execute function arena_private.referral_on_snapshot();

create or replace function arena_private.referral_on_entitlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform arena_private.referral_process_user(new.user_id);
  exception when others then
    raise warning 'referral_process_user failed: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function arena_private.referral_on_entitlement() from public, anon, authenticated;

drop trigger if exists entitlements_referral_check on public.entitlements;
create trigger entitlements_referral_check
  after insert or update of status, livemode on public.entitlements
  for each row
  when (new.kind = 'adventurer_pass' and new.status = 'active' and new.livemode and new.source in ('stripe', 'mercadopago', 'crypto_bsc', 'crypto_sol'))
  execute function arena_private.referral_on_entitlement();

-- The periodic job (the triggers do the same in real time; this one catches up after an outage, a changed tier, or an account that appeared later). Service role only. Returns how many
-- sign-ups it qualified plus how many rewards it granted. Schedule it with pg_cron (docs/WAITLIST.md) or call it by hand.
create or replace function public.referral_sweep()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_inviter uuid;
  v_total integer := 0;
begin
  for v_user in
    select u.id
    from public.waitlist as w
    join auth.users as u on pg_catalog.lower(u.email) = w.email::text
    where w.referred_by is not null and w.qualified_at is null
  loop
    v_total := v_total + arena_private.referral_qualify_user(v_user);
  end loop;
  for v_inviter in select distinct w.referred_by from public.waitlist as w where w.referred_by is not null loop
    v_total := v_total + arena_private.referral_grant(v_inviter);
  end loop;
  return v_total;
end;
$$;

revoke all on function public.referral_sweep() from public, anon, authenticated;
grant execute on function public.referral_sweep() to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- COUNTERS FOR THE PORTAL, WITHOUT AN E-MAIL LOOKUP. waitlist-referrals sends the public code AND the private view key that only the person's own browser holds; the database compares the key's hash.
-- A wrong key (or a made-up one, which is what waitlist-join hands out for an address that was already on the list) gets zeros, exactly like a right key on a brand-new sign-up: the
-- answer never tells whether an address or a code exists. pass_goal is the number of the 'pass' tier (so the portal can say "M of 10").
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.waitlist_referral_stats(p_code text, p_view_key_hash text, p_ip_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_counts record;
  v_goal integer;
begin
  if not arena_private.waitlist_hit('refstats:' || coalesce(p_ip_key, 'none'), 3600, 120) then
    return pg_catalog.jsonb_build_object('status', 'rate_limited');
  end if;
  select r.min_count into v_goal from arena_private.referral_rewards as r where r.kind = 'pass' and r.metric = 'paying' and r.active order by r.min_count limit 1;
  select w.id into v_id from public.waitlist as w where w.ref_code = p_code and w.view_key_hash = p_view_key_hash;
  if v_id is null then
    return pg_catalog.jsonb_build_object('status', 'ok', 'qualified', 0, 'paying', 0, 'pass_goal', v_goal);
  end if;
  select * into v_counts from arena_private.referral_counts(v_id);
  return pg_catalog.jsonb_build_object('status', 'ok', 'qualified', v_counts.qualified, 'paying', v_counts.paying, 'pass_goal', v_goal);
end;
$$;

revoke all on function public.waitlist_referral_stats(text, text, text) from public, anon, authenticated;
grant execute on function public.waitlist_referral_stats(text, text, text) to service_role;

-- For the game's Settings screen (and the login summary): the signed-in player's own invite code, counters and rewards. Only his own data: the account comes from auth.uid(), nothing is passed in.
create or replace function public.my_referral_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_code text;
  v_qualified integer := 0;
  v_paying integer := 0;
  v_goal integer;
begin
  if v_uid is null then
    return null;
  end if;
  select w.id, w.ref_code into v_id, v_code
  from public.waitlist as w
  join auth.users as u on pg_catalog.lower(u.email) = w.email::text and u.email_confirmed_at is not null
  where u.id = v_uid
  limit 1;
  select r.min_count into v_goal from arena_private.referral_rewards as r where r.kind = 'pass' and r.metric = 'paying' and r.active order by r.min_count limit 1;
  if v_id is not null then
    select r.qualified, r.paying into v_qualified, v_paying from arena_private.referral_counts(v_id) as r;
  end if;
  return pg_catalog.jsonb_build_object(
    'code', v_code,
    'qualified', v_qualified,
    'paying', v_paying,
    'pass_goal', v_goal,
    'rewards', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('kind', g.kind, 'ref', g.reward_ref, 'metric', g.metric, 'min_count', g.min_count, 'granted_at', g.granted_at,
        'label_pt', coalesce(t.label_pt, g.reward_ref), 'label_en', coalesce(t.label_en, g.reward_ref)) order by g.granted_at)
      from public.referral_rewards_granted as g
      left join arena_private.referral_rewards as t on t.metric = g.metric and t.min_count = g.min_count
      where g.user_id = v_uid
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.my_referral_status() from public, anon, authenticated;
grant execute on function public.my_referral_status() to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- SQL TEST PLAN (run after applying; nothing here is run automatically).
--
-- A. The client roles see and change nothing. As anon, then as authenticated (set local role anon; ...):
--      select * from public.waitlist;                                  -> permission denied
--      insert into public.waitlist (email, consent_at, ref_code, view_key_hash, email_canon) values ('a@b.co', now(), 'AAAAAAAAAA', repeat('a',64), 'a@b.co');   -> permission denied
--      update public.waitlist set unsubscribed_at = now();             -> permission denied
--      select public.waitlist_join('a@b.co','pt',null,null,null,null,null,'AAAAAAAAAA',repeat('a',64));  -> permission denied for function
--      select * from arena_private.portal_flags;                       -> permission denied for schema arena_private
--    Through REST (anon key): GET /rest/v1/waitlist -> 401/403 (never an empty list); POST /rest/v1/rpc/waitlist_join -> 401/403.
-- B. The counter is gated. With the flag off: `select public.waitlist_count();` as anon -> NULL (not 0).
--      update arena_private.portal_flags set show_waitlist_count = true;   -> as anon: the number of rows with unsubscribed_at is null (an unsubscribed row is not counted).
--      update arena_private.portal_flags set show_waitlist_count = false;  -> NULL again.
-- C. Idempotency and case. As the service role: select public.waitlist_join('Ana@Example.com','pt','t',null,null,'k1',null,'AAAAAAAAAA',repeat('a',64));   -> {"status":"joined","code":"AAAAAAAAAA"}, stored as ana@example.com.
--      select public.waitlist_join('ana@example.COM','en',null,null,null,'k1',null,'BBBBBBBBBB',repeat('b',64)); -> {"status":"exists","code":"AAAAAAAAAA"}; the row is unchanged (still pt, still source 't', still the first code).
--      insert into public.waitlist (email, consent_at, ref_code, view_key_hash, email_canon) values ('ANA@example.com', now(), 'CCCCCCCCCC', repeat('c',64), 'x') -> violates the lower-case check / unique constraint.
-- D. Rate limits (limits per hour: 2000 in total, 10 per IP, 40 per /24 network, 5 per e-mail). Call waitlist_join six times with the same p_email_key -> the sixth returns {"status":"rate_limited"}.
--      Eleven calls with the same p_ip_hash and different keys -> the eleventh is rate_limited. Two parallel sessions both calling at the limit: exactly the allowed number get through.
-- E. Unsubscribe is idempotent. select public.waitlist_unsubscribe('<id>','k'); twice -> both {"status":"ok"}; unsubscribed_at keeps the FIRST moment. waitlist_join of that address again
--    does NOT clear unsubscribed_at.
-- F. Shape checks: a row with source of 65 characters, locale 'fr', or email without a dot after the @ is refused.
--
-- PART B TESTS (referrals). Use throwaway users; clean up afterwards. J(email, ip, ref, code) below means
--   select public.waitlist_join(email, 'pt', null, ip, ip, 'k-' || email, ref, code, repeat('a', 64));      (codes: any 10 characters from A-H J-N P-Z 2-9, all different; ip: any text)
-- G. Codes and the inviter. J('ana@x.co','ip1',null,'AAAAAAAAAA') -> {"status":"joined","code":"AAAAAAAAAA"}. J('bia@x.co','ip2','AAAAAAAAAA','BBBBBBBBBB') -> joined, and bia's row has
--    referred_by = ana's id and referral_ignored null. The same call again with another code -> {"status":"exists","code":"BBBBBBBBBB"} and referred_by is unchanged. A third address sent with
--    the code of a row that does not exist -> joined, referred_by null, referral_ignored 'unknown_code'. A reused random code -> {"status":"code_taken"} and nothing is stored.
-- H. Never oneself. J('ana2@x.co','ip1','AAAAAAAAAA','CCCCCCCCCC') right after ana (a different person as far as the e-mail goes, but the same IP) -> referred_by null, referral_ignored 'self_ip' (same IP within 24 h).
--    J('a.na+t@gmail.com','ipX',null,...) then J('ana@gmail.com','ipY','<its code>',...) -> referral_ignored 'self_email' (gmail dots and +tags are the same person).
--    update arena_private.referral_config set ip_window_hours = 1; and an inviter older than one hour no longer triggers self_ip from the same IP.
-- I. Identity is frozen. update public.waitlist set referred_by = null; / set ref_code = 'ZZZZZZZZZZ'; / set email = 'z@x.co'; -> WAITLIST_IDENTITY_IMMUTABLE. update ... set unsubscribed_at = now(); works.
-- J. The client can read nothing new. As anon / authenticated: select * from arena_private.referral_rewards; select * from arena_private.referral_config; select public.referral_sweep();
--    select public.waitlist_referral_stats('AAAAAAAAAA', 'x', 'k'); -> all permission denied. `select * from public.referral_rewards_granted` as authenticated returns only the caller's rows;
--    as anon -> permission denied; insert/update/delete as authenticated -> permission denied. `select public.my_referral_status();` as anon -> permission denied; as authenticated -> only his own data.
-- K. Qualification. With launch_at NULL: create a confirmed auth user with bia's e-mail and insert an 'ok' progress snapshot whose metrics = {"heroLevel": 12} -> bia.qualified_at stays NULL and no
--    reward row appears. update arena_private.referral_config set launch_at = now() - interval '1 hour'; insert another 'ok' snapshot (heroLevel 9) -> still NULL; one with heroLevel 10 -> bia.qualified_at is
--    set (the trigger) and ana (the inviter's e-mail needs her own confirmed account) gets the 'qualified' 1 reward 'recruiter' in referral_rewards_granted. Snapshots with verdict 'flagged' / 'rejected',
--    an UNCONFIRMED e-mail, a snapshot older than launch_at, and a different e-mail never qualify. select public.referral_sweep(); (service role) catches up anything the trigger missed.
-- L. Tiers are idempotent and live-edited. Qualify 3 invited people -> 'portrait_frame_recruiter' appears once; run public.referral_sweep() twice -> no second row, no error. Raise a tier:
--    update arena_private.referral_rewards set min_count = 2 where kind = 'cosmetic'; -> the next sweep grants it to inviters with 2 qualified; a reward already granted is never removed.
-- M. PAYING and the free Pass. Insert, as the service role, an entitlement for an invited person's account: (user, 'adventurer_pass', 'stripe', 'pi_t1', 'active', livemode true) ->
--    arena_private.referral_counts(ana's id).paying = 1. Do the same for 10 different invited accounts -> ana's account receives ONE entitlement (source 'referral', provider_ref 'referral-<uid>',
--    status active, livemode true) and a referral_rewards_granted row (paying, 10, pass). Run the sweep again -> nothing changes. Source 'grant', 'referral', livemode false (Stripe test mode)
--    and status 'refunded' / 'revoked' rows do NOT count as paying. Refund one of the ten AFTER the grant: paying drops to 9, the free Pass stays. If ana already holds an active Pass when she reaches
--    10, no entitlement is created and no granted row is written (the tier is still open).
-- N. The Pass goal does not move. select arena_private.paid_pass_count() and `select progress from public.pass_meter();` before and after the free Pass is granted -> identical.
--    The free Pass is eligible to rank (owns_ranking_pass: livemode) and gives the perks (owns_adventurer_pass).
-- O. Counters for the portal. select public.waitlist_referral_stats('AAAAAAAAAA', encode(sha256(...)) ... ) with the right key hash returns ana's qualified / paying / pass_goal; with a wrong key, a
--    wrong code or a made-up key it returns zeros and pass_goal, never an error. The 121st call from one key within an hour -> {"status":"rate_limited"}.
-- P. Abuse reads (docs/WAITLIST.md) run on the data above and return the rows you created.
-- ---------------------------------------------------------------------------------------------------------------------------------------
