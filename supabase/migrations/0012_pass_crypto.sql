-- The Adventurer Pass paid in USDT (BEP-20, BNB Smart Chain), in addition to Stripe. Depends on 0003, 0007 (livemode, the goal) and 0011 (chain_payments).
--
-- The entitlement design is provider agnostic (0003): a new way to pay is a new `source` and a function that inserts the row. Here the source is 'crypto_bsc', the provider_ref is the
-- transaction hash, and livemode is true only for BSC MAINNET (a testnet payment gives the perks in the game but never counts toward the goal or the ranking, exactly like a Stripe test purchase).
-- The existing rules are untouched: ONE active Pass per user (entitlements_one_active_per_user_kind), the goal counts livemode rows only.
--
-- WHAT THIS FILE DOES
--   * entitlements_source_check also allows 'crypto_bsc'.
--   * arena_private.paid_pass_count and arena_private.entitlements_goal_trigger (0007) also count 'crypto_bsc' (livemode + active, like stripe / mercadopago). The public meter (pass_meter, 0008) reads
--     paid_pass_count, so a real USDT Pass moves the progress bar and can open the paid season; a testnet one does not.
--   * public.pass_crypto_intents       when the player started a USDT purchase: a payment mined BEFORE this moment is never accepted for the Pass (an old transfer cannot be recycled).
--   * public.pass_crypto_start / pass_crypto_grant   service role only; grant is ONE locked transaction: consume the hash, then insert the entitlement.
--
-- NOT APPLIED by the work that wrote this file; never run, only read by static tests (migration0012.test.ts). Apply AFTER 0011.
--
-- ROLLBACK (by hand; it deletes the intents, and a crypto Pass would break the source check, so refund/revoke those entitlements first):
--   drop function if exists public.pass_crypto_grant(uuid, text, text, text, numeric, numeric, bigint, timestamptz, integer, boolean);
--   drop function if exists public.pass_crypto_start(uuid, integer);
--   drop table if exists public.pass_crypto_intents;
--   alter table public.entitlements drop constraint if exists entitlements_source_check;
--   alter table public.entitlements add constraint entitlements_source_check check (source in ('stripe', 'mercadopago', 'grant'));   -- only when no 'crypto_bsc' row exists
--   -- then restore paid_pass_count and entitlements_goal_trigger from 0007 (re-run those two create-or-replace blocks).

alter table public.entitlements drop constraint if exists entitlements_source_check;
alter table public.entitlements
  add constraint entitlements_source_check check (source in ('stripe', 'mercadopago', 'crypto_bsc', 'grant'));

-- The goal and the public meter count real, live, paid, active Passes only (now including USDT).
create or replace function arena_private.paid_pass_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.count(*)::bigint
  from public.entitlements as e
  where e.kind = 'adventurer_pass' and e.status = 'active' and e.source in ('stripe', 'mercadopago', 'crypto_bsc') and e.livemode;
$$;

revoke all on function arena_private.paid_pass_count() from public, anon, authenticated;

create or replace function arena_private.entitlements_goal_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'adventurer_pass' and new.status = 'active' and new.livemode and new.source in ('stripe', 'mercadopago', 'crypto_bsc') then
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

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Intent: "this player is about to pay for the Pass in USDT". Created once, kept for p_ttl_hours, then renewed.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists public.pass_crypto_intents (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.pass_crypto_intents enable row level security;
revoke all on table public.pass_crypto_intents from public, anon, authenticated;
grant select, insert, update on table public.pass_crypto_intents to service_role;

-- Returns the moment payments are counted from: the existing intent while it is younger than p_ttl_hours, else a new one (now).
create or replace function public.pass_crypto_start(p_user_id uuid, p_ttl_hours integer)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pass_crypto:' || p_user_id::text, 0));
  select i.created_at into v_at from public.pass_crypto_intents as i where i.user_id = p_user_id;
  if v_at is null then
    insert into public.pass_crypto_intents (user_id) values (p_user_id) returning created_at into v_at;
  elsif v_at < pg_catalog.now() - pg_catalog.make_interval(hours => p_ttl_hours) then
    update public.pass_crypto_intents as i set created_at = pg_catalog.now() where i.user_id = p_user_id returning i.created_at into v_at;
  end if;
  return v_at;
end;
$$;

revoke all on function public.pass_crypto_start(uuid, integer) from public, anon, authenticated;
grant execute on function public.pass_crypto_start(uuid, integer) to service_role;

-- Grants the Pass for ONE verified transfer (the Edge Function checked the chain). One locked transaction:
--   * the amount must cover p_required_units and the block must not be older than the intent (defensive; the function verified both on chain);
--   * the transaction hash is inserted first (primary key of chain_payments): the same hash by the same user again is an idempotent replay, by anyone else it is tx_reused;
--   * a user who ALREADY has an active Pass cannot get a second one: the payment is stored as refund_due (the owner returns it, docs/MARKET_SOLANA.md (0013_solana.sql moved the market to SOL / USDC on Solana)) and the answer is already_owned;
--   * otherwise the entitlement (source crypto_bsc, provider_ref = the hash, livemode as given) is inserted; the 0007 goal trigger fires for a live one.
--   Returns { "status": "granted" | "already_owned" | "tx_reused" | "replayed" | "no_intent" }.
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
  if p_tx_hash !~ '^0x[0-9a-f]{64}$' or p_from !~ '^0x[0-9a-f]{40}$' or p_to !~ '^0x[0-9a-f]{40}$' then
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

  if exists (select 1 from public.entitlements as e where e.user_id = p_user_id and e.kind = 'adventurer_pass' and e.status = 'active') then
    update public.chain_payments as p set status = 'refund_due', note = 'pass already owned' where p.tx_hash = p_tx_hash;
    perform arena_private.market_log('pass_duplicate_payment', p_user_id, null, null, pg_catalog.jsonb_build_object('tx_hash', p_tx_hash));
    return pg_catalog.jsonb_build_object('status', 'already_owned');
  end if;

  begin
    insert into public.entitlements (user_id, kind, source, provider_ref, status, livemode)
    values (p_user_id, 'adventurer_pass', 'crypto_bsc', p_tx_hash, 'active', p_livemode);
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

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- SQL TEST PLAN (run after applying; nothing here is run automatically).
--
-- A. Clients cannot touch it. As `authenticated`: `select * from public.pass_crypto_intents;` -> permission denied; `select public.pass_crypto_grant(...)` / `pass_crypto_start(...)` -> permission denied for function.
-- B. The source check: as the service role `insert into public.entitlements (user_id, kind, source, provider_ref) values ('<uuid>', 'adventurer_pass', 'crypto_bsc', '0x...')` works; 'bitcoin' is refused by the check.
-- C. Intent: select public.pass_crypto_start('<U>', 24); twice -> the same timestamp. After `update public.pass_crypto_intents set created_at = now() - interval '25 hours'` a new call renews it.
-- D. Grant: without an intent -> { status: no_intent }. With one: select public.pass_crypto_grant('<U>', '0x'||repeat('c',64), '<W>', '<receive>', 10e18, 10e18, 1, now(), 97, false);
--      -> granted: one entitlements row (source crypto_bsc, provider_ref = the hash, status active, livemode false), one chain_payments row (purpose pass). The same call again -> replayed (no second row).
--    The same hash by another user -> tx_reused. A block_time older than the intent, or an amount under p_required_units -> exception PASS_CRYPTO_MISMATCH (nothing written).
--    A user that already has an active Pass pays again with a NEW hash -> already_owned, and that chain_payments row is status refund_due.
-- E. The goal: with livemode true, the paid count rises: `select arena_private.paid_pass_count();` +1 (+0 for livemode false), and pass_meter().progress moves. A testnet (livemode false) Pass gives the perks
--    (arena_private.owns_adventurer_pass -> true) but arena_private.owns_ranking_pass -> false. A refund by hand: `update public.entitlements set status = 'refunded' where provider_ref = '<hash>';` removes it from the count.
-- ---------------------------------------------------------------------------------------------------------------------------------------
