-- Launch waitlist ("Avise-me no lançamento") of the public portal, plus (part B, further down) the referral links and their in-game rewards.
--
-- PART A: the waitlist.
--   * public.waitlist           one row per e-mail: the address (lower case), the language, a short "source" (utm/referrer), the HMAC-hashed IP of the sign-up (never the raw IP), the moment of consent,
--                                the moment of unsubscribing. NOBODY on the client side can read or write it: RLS is on, there is no policy, and anon / authenticated have no privilege at all.
--                                Only the Edge Functions waitlist-join / waitlist-unsubscribe (service role) and the owner (SQL editor) touch it.
--   * arena_private.waitlist_limits   atomic fixed-window counters for the rate limits (per hashed IP and per hashed e-mail). One statement = one atomic increment.
--   * arena_private.portal_flags      ONE row of owner switches. show_waitlist_count (default false) decides whether the public may learn how many people signed up.
--   * public.waitlist_join / waitlist_unsubscribe   service-role-only functions: ONE call = one transaction (rate limit + insert).
--   * public.waitlist_count()   the only thing the public can call: the number of ACTIVE sign-ups (not unsubscribed), or NULL while the owner flag is off.
--
-- E-MAIL SENDING IS NOT PART OF THIS. Nothing here sends any e-mail. Confirming addresses (double opt-in) and sending the launch notice need an e-mail provider the owner chooses later;
-- the column confirmed_at is reserved for that and stays NULL until then (docs/WAITLIST.md).
--
-- NOT APPLIED by the work that wrote this file, and NEVER RUN against a real database: only read by static tests (supabase/functions/_shared/__tests__/migration0016.test.ts).
-- The owner applies it AFTER 0015, in the DEVELOPMENT project first, and runs the SQL TEST PLAN at the end.
--
-- ROLLBACK (by hand; it deletes every sign-up, so EXPORT the list first, docs/WAITLIST.md):
--   drop function if exists public.waitlist_count();
--   drop function if exists public.waitlist_unsubscribe(uuid, text);
--   drop function if exists public.waitlist_join(text, text, text, text, text, text);
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
  -- Reserved for a future double opt-in (needs an e-mail provider). NULL until then.
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  constraint waitlist_email_unique unique (email),
  constraint waitlist_email_shape check (pg_catalog.char_length(email::text) between 3 and 254 and email::text = pg_catalog.lower(email::text) and email::text like '%_@_%.__%'),
  constraint waitlist_locale_check check (locale in ('pt', 'en')),
  constraint waitlist_source_check check (source is null or pg_catalog.char_length(source) between 1 and 64)
);

create index if not exists waitlist_created_at_idx on public.waitlist (created_at);
create index if not exists waitlist_source_idx on public.waitlist (source) where source is not null;
create index if not exists waitlist_ip_hash_idx on public.waitlist (ip_hash) where ip_hash is not null;
create index if not exists waitlist_subnet_hash_idx on public.waitlist (subnet_hash) where subnet_hash is not null;

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
-- waitlist_join: rate limits + insert in ONE call. Returns {"status": "joined" | "exists" | "rate_limited"}.
--   "exists" means the address was already on the list (or unsubscribed: an opt-out is never undone by a stranger typing the address). The Edge Function answers both the same way.
--   p_ip_key / p_email_key are HMACs computed by the Edge Function (WAITLIST_SECRET), so neither the raw IP nor a plain address ever lands in the limits table.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.waitlist_join(
  p_email text,
  p_locale text,
  p_source text,
  p_ip_hash text,
  p_subnet_hash text,
  p_email_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  -- Limits first, before anything is looked up, so an address that exists is not told apart by being refused.
  if not arena_private.waitlist_hit('global', 3600, 2000)
     or not arena_private.waitlist_hit('ip:' || coalesce(p_ip_hash, 'none'), 3600, 10)
     or not arena_private.waitlist_hit('subnet:' || coalesce(p_subnet_hash, 'none'), 3600, 40)
     or not arena_private.waitlist_hit('email:' || coalesce(p_email_key, 'none'), 3600, 5) then
    return pg_catalog.jsonb_build_object('status', 'rate_limited');
  end if;

  insert into public.waitlist (email, locale, source, ip_hash, subnet_hash, consent_at)
  values (pg_catalog.lower(p_email), p_locale, p_source, p_ip_hash, p_subnet_hash, pg_catalog.now())
  on conflict (email) do nothing
  returning id into v_id;

  if v_id is null then
    return pg_catalog.jsonb_build_object('status', 'exists');
  end if;
  return pg_catalog.jsonb_build_object('status', 'joined');
end;
$$;

revoke all on function public.waitlist_join(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.waitlist_join(text, text, text, text, text, text) to service_role;

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

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- SQL TEST PLAN (run after applying; nothing here is run automatically).
--
-- A. The client roles see and change nothing. As anon, then as authenticated (set local role anon; ...):
--      select * from public.waitlist;                                  -> permission denied
--      insert into public.waitlist (email, consent_at) values ('a@b.co', now());   -> permission denied
--      update public.waitlist set unsubscribed_at = now();             -> permission denied
--      select public.waitlist_join('a@b.co','pt',null,null,null,null);  -> permission denied for function
--      select * from arena_private.portal_flags;                       -> permission denied for schema arena_private
--    Through REST (anon key): GET /rest/v1/waitlist -> 401/403 (never an empty list); POST /rest/v1/rpc/waitlist_join -> 401/403.
-- B. The counter is gated. With the flag off: `select public.waitlist_count();` as anon -> NULL (not 0).
--      update arena_private.portal_flags set show_waitlist_count = true;   -> as anon: the number of rows with unsubscribed_at is null (an unsubscribed row is not counted).
--      update arena_private.portal_flags set show_waitlist_count = false;  -> NULL again.
-- C. Idempotency and case. As the service role: select public.waitlist_join('Ana@Example.com','pt','t',null,null,'k1');   -> {"status":"joined"}, stored as ana@example.com.
--      select public.waitlist_join('ana@example.COM','en',null,null,null,'k1'); -> {"status":"exists"}; the row is unchanged (still pt, still source 't').
--      insert into public.waitlist (email, consent_at) values ('ANA@example.com', now());   -> violates the unique constraint (and the lower-case check).
-- D. Rate limits (limits per hour: 2000 in total, 10 per IP, 40 per /24 network, 5 per e-mail). Call waitlist_join six times with the same p_email_key -> the sixth returns {"status":"rate_limited"}.
--      Eleven calls with the same p_ip_hash and different keys -> the eleventh is rate_limited. Two parallel sessions both calling at the limit: exactly the allowed number get through.
-- E. Unsubscribe is idempotent. select public.waitlist_unsubscribe('<id>','k'); twice -> both {"status":"ok"}; unsubscribed_at keeps the FIRST moment. waitlist_join of that address again
--    does NOT clear unsubscribed_at.
-- F. Shape checks: a row with source of 65 characters, locale 'fr', or email without a dot after the @ is refused.
-- ---------------------------------------------------------------------------------------------------------------------------------------
