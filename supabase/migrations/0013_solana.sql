-- The player market and the Adventurer Pass move from BNB Smart Chain / USDT to SOLANA (owner decision). Depends on 0011 (the market) and 0012 (the crypto Pass).
--
--   * Items and Gold Pouches are priced and paid in SOL (native). A price is stored in LAMPORTS (1 SOL = 1,000,000,000), a whole number of 0.001 SOL steps.
--   * The fee is 5% of the price, rounded UP to the lamport; the seller gets the rest (the same rule as supabase/functions/_shared/chain/solMoney.ts splitLamports).
--   * The buyer pays with ONE transaction that carries two SystemProgram transfers (the seller's share and the game's fee). The server verifies it (chain/solana.ts) and calls market_record_payment ONCE:
--     the payment is a single chain_payments row with leg 'sale' (the transaction SIGNATURE is the primary key, so it is consumed once ever). A second transaction for the same reservation is an 'extra'.
--   * The Adventurer Pass is paid in USDC (an SPL token, 6 decimals): pass_crypto_grant stores source 'crypto_sol'. Addresses are base58 public keys, signatures are base58.
--   * The BNB Smart Chain code stays in the repository, dormant (nothing calls it). 'crypto_bsc' stays an allowed source and the 'seller' / 'fee' legs stay allowed values, for history only.
--   * chain_id keeps its column but carries an INTERNAL tag of the cluster (501 mainnet-beta, 502 devnet): Solana has no chain id.
--
-- WHAT THIS FILE DOES
--   * REFUSES TO RUN over market data: the old rows hold 0x addresses and cent prices that the new constraints cannot represent. On a development project that tested the BNB version, empty the market
--     tables first (market_sales, chain_payments, market_reservations, market_listings, market_wallets). Nothing of this has ever held real money.
--   * market_wallets / market_listings / market_reservations / market_sales: price columns renamed *_cents -> *_lamports and widened to bigint; address checks become base58 (32 to 44 characters);
--     market_sales trades seller_tx_hash + fee_tx_hash for the one tx_signature.
--   * chain_payments: the primary key is now a base58 signature (64 to 90 characters); the leg 'sale' is added; one counted 'sale' per reservation.
--   * market_listings_public (price_lamports) and arena_private.market_sales_ledger (SOL columns) are recreated.
--   * market_list (lamports), market_reserve (lamports), market_record_payment (ONE payment sells), market_wallet_set (base58) are REPLACED; pass_crypto_grant (base58, 'crypto_sol'),
--     paid_pass_count and entitlements_goal_trigger (count 'crypto_sol' too) and entitlements_source_check ('crypto_sol') are REPLACED.
--
-- NOT APPLIED by the work that wrote this file, and NEVER RUN against a real database: only read by static tests (supabase/functions/_shared/__tests__/migration0013.test.ts). The owner applies it AFTER
-- 0012, in the DEVELOPMENT project first, and runs the SQL TEST PLAN at the end. Redeploy the functions market-wallet, market-list, market-buy, market-my and pass-crypto right after it (the old ones
-- call functions this file replaces).
--
-- ROLLBACK (by hand; only while the market tables hold no Solana row, because the 0011 constraints cannot hold base58 values):
--   drop function if exists public.market_record_payment(uuid, uuid, text, text, text, numeric, bigint, timestamptz);
--   drop function if exists public.market_list(uuid, uuid, bigint, integer, integer, integer, bigint, bigint);
--   drop view if exists arena_private.market_sales_ledger;
--   drop view if exists public.market_listings_public;
--   alter table public.market_sales drop constraint if exists market_sales_signature_check;   alter table public.market_sales drop constraint if exists market_sales_split_check;
--   alter table public.market_sales drop column if exists tx_signature;
--   alter table public.market_sales add column seller_tx_hash text not null default '', add column fee_tx_hash text not null default '';
--   alter table public.market_sales alter column price_lamports type integer;  alter table public.market_sales alter column fee_lamports type integer;  alter table public.market_sales alter column seller_lamports type integer;
--   alter table public.market_sales rename column price_lamports to price_cents;  alter table public.market_sales rename column fee_lamports to fee_cents;  alter table public.market_sales rename column seller_lamports to seller_cents;
--   alter table public.market_sales add constraint market_sales_split_check check (fee_cents + seller_cents = price_cents);
--   (the same three renames and the integer type for market_reservations, then its split check; for market_listings price_lamports -> price_cents with the 0011 check between 50 and 500000)
--   alter table public.chain_payments drop constraint chain_payments_hash_check;  alter table public.chain_payments add constraint chain_payments_hash_check check (tx_hash ~ '^0x[0-9a-f]{64}$');
--   alter table public.chain_payments drop constraint chain_payments_leg_check;  alter table public.chain_payments add constraint chain_payments_leg_check check (leg in ('seller', 'fee', 'extra', 'pass'));
--   drop index if exists public.chain_payments_one_leg_per_reservation;  create unique index chain_payments_one_leg_per_reservation on public.chain_payments (reservation_id, leg) where reservation_id is not null and leg in ('seller', 'fee');
--   alter table public.market_wallets drop constraint market_wallets_address_check;  alter table public.market_wallets add constraint market_wallets_address_check check (address ~ '^0x[0-9a-f]{40}$');
--   alter table public.market_listings drop constraint market_listings_address_check;  alter table public.market_listings add constraint market_listings_address_check check (seller_address ~ '^0x[0-9a-f]{40}$');
--   -- then re-run the 0011 create-or-replace blocks of market_list, market_reserve, market_record_payment, market_wallet_set, the two views (market_listings_public, market_sales_ledger) and the grants,
--   -- and the 0012 blocks of pass_crypto_grant, paid_pass_count, entitlements_goal_trigger and the entitlements_source_check (revoke or refund any 'crypto_sol' entitlement first).

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The market tables must be empty: this migration changes what a price and an address ARE.
-- ---------------------------------------------------------------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.market_wallets)
     or exists (select 1 from public.market_listings)
     or exists (select 1 from public.market_reservations)
     or exists (select 1 from public.chain_payments)
     or exists (select 1 from public.market_sales) then
    raise exception using errcode = 'P0001', message = 'MIGRATION_0013_NEEDS_EMPTY_MARKET_TABLES';
  end if;
end;
$$;

drop view if exists public.market_listings_public;
drop view if exists arena_private.market_sales_ledger;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Wallets: a Solana address is a base58 public key of 32 bytes (32 to 44 characters). Case sensitive: never lowercased.
-- ---------------------------------------------------------------------------------------------------------------------------------------
alter table public.market_wallets drop constraint if exists market_wallets_address_check;
alter table public.market_wallets add constraint market_wallets_address_check check (address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$');

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Listings: the price is in lamports, whole 0.001 SOL steps. The bounds here are the ABSOLUTE ones (0.001 to 1,000 SOL); the tunable cap (MARKET_RULES.maxPriceLamports, now 50 SOL) is an
-- argument of market_list.
-- ---------------------------------------------------------------------------------------------------------------------------------------
alter table public.market_listings drop constraint if exists market_listings_price_check;
alter table public.market_listings drop constraint if exists market_listings_address_check;
alter table public.market_listings rename column price_cents to price_lamports;
alter table public.market_listings alter column price_lamports type bigint;
alter table public.market_listings add constraint market_listings_price_check check (price_lamports between 1000000 and 1000000000000 and price_lamports % 1000000 = 0);
alter table public.market_listings add constraint market_listings_address_check check (seller_address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$');

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Reservations
-- ---------------------------------------------------------------------------------------------------------------------------------------
alter table public.market_reservations drop constraint if exists market_reservations_split_check;
alter table public.market_reservations rename column price_cents to price_lamports;
alter table public.market_reservations rename column fee_cents to fee_lamports;
alter table public.market_reservations rename column seller_cents to seller_lamports;
alter table public.market_reservations alter column price_lamports type bigint;
alter table public.market_reservations alter column fee_lamports type bigint;
alter table public.market_reservations alter column seller_lamports type bigint;
alter table public.market_reservations add constraint market_reservations_split_check check (fee_lamports + seller_lamports = price_lamports and fee_lamports > 0 and seller_lamports > 0);

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Verified chain payments. The PRIMARY KEY (tx_hash) now holds the Solana transaction SIGNATURE (base58, 64 to 90 characters; 88 is the usual length). One signature, consumed once, ever.
-- ---------------------------------------------------------------------------------------------------------------------------------------
alter table public.chain_payments drop constraint if exists chain_payments_hash_check;
alter table public.chain_payments add constraint chain_payments_hash_check check (tx_hash ~ '^[1-9A-HJ-NP-Za-km-z]{64,90}$');
alter table public.chain_payments drop constraint if exists chain_payments_leg_check;
alter table public.chain_payments add constraint chain_payments_leg_check check (leg in ('seller', 'fee', 'sale', 'extra', 'pass'));
drop index if exists public.chain_payments_one_leg_per_reservation;
-- one counted payment per reservation: 'sale' is the ONE transaction that carries both transfers ('seller' / 'fee' are the dormant BNB legs)
create unique index if not exists chain_payments_one_leg_per_reservation on public.chain_payments (reservation_id, leg) where reservation_id is not null and leg in ('seller', 'fee', 'sale');

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The ledger of sales: one signature per sale
-- ---------------------------------------------------------------------------------------------------------------------------------------
alter table public.market_sales drop constraint if exists market_sales_split_check;
alter table public.market_sales rename column price_cents to price_lamports;
alter table public.market_sales rename column fee_cents to fee_lamports;
alter table public.market_sales rename column seller_cents to seller_lamports;
alter table public.market_sales alter column price_lamports type bigint;
alter table public.market_sales alter column fee_lamports type bigint;
alter table public.market_sales alter column seller_lamports type bigint;
alter table public.market_sales drop column if exists seller_tx_hash;
alter table public.market_sales drop column if exists fee_tx_hash;
alter table public.market_sales add column if not exists tx_signature text not null;
alter table public.market_sales add constraint market_sales_split_check check (fee_lamports + seller_lamports = price_lamports);
alter table public.market_sales add constraint market_sales_signature_check check (tx_signature ~ '^[1-9A-HJ-NP-Za-km-z]{64,90}$');

-- The public face of the market: the listed item (read from its certificate) and its price in lamports. NOT the seller, NOT any wallet address, NOT the certificate id.
create or replace view public.market_listings_public as
select
  l.id,
  c.kind,
  c.template_id,
  c.rarity,
  c.tier,
  c.substats,
  c.gold_amount,
  c.content_hash,
  l.price_lamports,
  l.status,
  l.created_at,
  l.expires_at
from public.market_listings as l
join public.item_certificates as c on c.id = l.certificate_id
where l.status in ('open', 'reserved') and l.expires_at > pg_catalog.now();

revoke all on table public.market_listings_public from public, anon, authenticated;
grant select on table public.market_listings_public to anon, authenticated, service_role;

-- The owner's fee statement (SQL editor, "download CSV"): private schema, never exposed by the API. Amounts in SOL (9 decimals) and in raw lamports.
create or replace view arena_private.market_sales_ledger as
select
  s.sold_at,
  s.id as sale_id,
  s.livemode,
  s.chain_id,
  s.item_kind,
  s.item_template,
  (s.price_lamports / 1000000000.0)::numeric(20, 9) as price_sol,
  (s.fee_lamports / 1000000000.0)::numeric(20, 9) as fee_sol,
  (s.seller_lamports / 1000000000.0)::numeric(20, 9) as seller_sol,
  s.price_lamports,
  s.fee_lamports,
  s.seller_lamports,
  s.seller_address,
  s.buyer_address,
  s.fee_address,
  s.tx_signature,
  s.seller_id,
  s.buyer_id
from public.market_sales as s;

revoke all on table arena_private.market_sales_ledger from public, anon, authenticated;
grant select on table arena_private.market_sales_ledger to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Wallet link (base58 address)
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.market_wallet_set(p_user_id uuid, p_address text, p_chain_id integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.market_wallets%rowtype;
  v_had boolean;
  v_other uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('market_wallet:' || p_user_id::text, 0));
  if p_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' then
    raise exception using errcode = '22023', message = 'MARKET_WALLET_BAD_ADDRESS';
  end if;

  select * into v_old from public.market_wallets as w where w.user_id = p_user_id;
  v_had := found;
  if v_had and v_old.address = p_address then
    return pg_catalog.jsonb_build_object('status', 'unchanged');
  end if;

  select w.user_id into v_other from public.market_wallets as w where w.address = p_address;
  if v_other is not null and v_other <> p_user_id then
    return pg_catalog.jsonb_build_object('status', 'address_taken');
  end if;

  if exists (select 1 from public.market_listings as l where l.seller_id = p_user_id and l.status in ('open', 'reserved'))
     or exists (select 1 from public.market_reservations as r where r.buyer_id = p_user_id and r.status = 'pending') then
    return pg_catalog.jsonb_build_object('status', 'busy');
  end if;

  if v_had then
    insert into public.market_wallet_history (user_id, address, chain_id, linked_at) values (p_user_id, v_old.address, v_old.chain_id, v_old.linked_at);
    update public.market_wallets as w set address = p_address, chain_id = p_chain_id, linked_at = pg_catalog.now(), updated_at = pg_catalog.now() where w.user_id = p_user_id;
  else
    insert into public.market_wallets (user_id, address, chain_id) values (p_user_id, p_address, p_chain_id);
  end if;
  perform arena_private.market_log('wallet_linked', p_user_id, null, null, pg_catalog.jsonb_build_object('address', p_address));
  return pg_catalog.jsonb_build_object('status', 'linked');
end;
$$;

revoke all on function public.market_wallet_set(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.market_wallet_set(uuid, text, integer) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Listing (lamports). The old integer-cents function is DROPPED: two overloads with the same argument names would make the API call ambiguous.
-- ---------------------------------------------------------------------------------------------------------------------------------------
drop function if exists public.market_list(uuid, uuid, integer, integer, integer, integer, integer, integer);

-- Lists a certificate. Under the SAME per-user lock as item_commit / item_certificate_transition (so a bind or a burn cannot slip in between the check and the change), and the certificate row lock.
--   Refusals: no_wallet, flagged, not_found, already_listed, not_held, bound, not_in_save, price, limit_active, limit_day.
--   Success: the certificate becomes 'listed' and OUT OF THE SAVE (in_save = false); returns { "status": "listed", "listing_id", "expires_at" }.
create or replace function public.market_list(
  p_user_id uuid,
  p_certificate_id uuid,
  p_price_lamports bigint,
  p_ttl_days integer,
  p_max_active integer,
  p_max_per_day integer,
  p_min_lamports bigint,
  p_max_lamports bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_address text;
  v_cert public.item_certificates%rowtype;
  v_active integer;
  v_today integer;
  v_listing_id uuid;
  v_expires timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('item_commit:' || p_user_id::text, 0));

  select w.address into v_address from public.market_wallets as w where w.user_id = p_user_id;
  if v_address is null then
    return pg_catalog.jsonb_build_object('status', 'refused', 'reason', 'no_wallet');
  end if;
  if arena_private.has_item_flags(p_user_id) then
    return pg_catalog.jsonb_build_object('status', 'refused', 'reason', 'flagged');
  end if;
  if p_price_lamports is null or p_price_lamports < p_min_lamports or p_price_lamports > p_max_lamports or p_price_lamports % 1000000 <> 0 then
    return pg_catalog.jsonb_build_object('status', 'refused', 'reason', 'price');
  end if;

  select * into v_cert from public.item_certificates as c where c.id = p_certificate_id and c.user_id = p_user_id for update;
  if not found then
    return pg_catalog.jsonb_build_object('status', 'refused', 'reason', 'not_found');
  end if;
  if v_cert.status = 'listed' then
    return pg_catalog.jsonb_build_object('status', 'refused', 'reason', 'already_listed');
  end if;
  if v_cert.status <> 'held' then
    return pg_catalog.jsonb_build_object('status', 'refused', 'reason', 'not_held');
  end if;
  if v_cert.bound then
    return pg_catalog.jsonb_build_object('status', 'refused', 'reason', 'bound');
  end if;
  if not v_cert.in_save then
    return pg_catalog.jsonb_build_object('status', 'refused', 'reason', 'not_in_save');
  end if;

  select pg_catalog.count(*)::integer into v_active from public.market_listings as l where l.seller_id = p_user_id and l.status in ('open', 'reserved');
  if v_active >= p_max_active then
    return pg_catalog.jsonb_build_object('status', 'refused', 'reason', 'limit_active');
  end if;
  select pg_catalog.count(*)::integer into v_today from public.market_listings as l where l.seller_id = p_user_id and l.created_at > pg_catalog.now() - interval '1 day';
  if v_today >= p_max_per_day then
    return pg_catalog.jsonb_build_object('status', 'refused', 'reason', 'limit_day');
  end if;

  v_expires := pg_catalog.now() + pg_catalog.make_interval(days => p_ttl_days);
  update public.item_certificates as c set status = 'listed', in_save = false where c.id = p_certificate_id;
  insert into public.market_listings (certificate_id, seller_id, seller_address, price_lamports, expires_at)
  values (p_certificate_id, p_user_id, v_address, p_price_lamports, v_expires)
  returning id into v_listing_id;
  insert into public.item_certificate_events (certificate_id, user_id, event, detail)
  values (p_certificate_id, p_user_id, 'list', pg_catalog.jsonb_build_object('listing_id', v_listing_id, 'price_lamports', p_price_lamports));
  perform arena_private.market_log('listed', p_user_id, v_listing_id, null, pg_catalog.jsonb_build_object('price_lamports', p_price_lamports, 'certificate_id', p_certificate_id));
  return pg_catalog.jsonb_build_object('status', 'listed', 'listing_id', v_listing_id, 'expires_at', v_expires);
end;
$$;

revoke all on function public.market_list(uuid, uuid, bigint, integer, integer, integer, bigint, bigint) from public, anon, authenticated;
grant execute on function public.market_list(uuid, uuid, bigint, integer, integer, integer, bigint, bigint) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Reserve (lamports). Same signature as 0011, so this REPLACES it. The fee is price x p_fee_percent / 100 ROUNDED UP to the lamport; the seller's share is the rest.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.market_reserve(
  p_buyer_id uuid,
  p_listing_id uuid,
  p_fee_address text,
  p_chain_id integer,
  p_livemode boolean,
  p_fee_percent integer,
  p_ttl_minutes integer,
  p_grace_minutes integer,
  p_rate_max integer,
  p_rate_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old record;
  v_pending public.market_reservations%rowtype;
  v_buyer_address text;
  v_recent integer;
  v_listing public.market_listings%rowtype;
  v_fee bigint;
  v_res_id uuid;
  v_expires timestamptz;
  v_grace timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('market_buyer:' || p_buyer_id::text, 0));

  -- free this buyer's own stale reservations first (a lock he abandoned must not block him)
  for v_old in
    select r.listing_id from public.market_reservations as r where r.buyer_id = p_buyer_id and r.status = 'pending' and r.expires_at <= pg_catalog.now()
  loop
    perform 1 from public.market_listings as l where l.id = v_old.listing_id for update;
    perform arena_private.market_release_stale(v_old.listing_id);
  end loop;

  select * into v_pending from public.market_reservations as r where r.buyer_id = p_buyer_id and r.status = 'pending';
  if found then
    return pg_catalog.jsonb_build_object('status', 'refused', 'reason', 'reservation_exists', 'reservation_id', v_pending.id, 'listing_id', v_pending.listing_id);
  end if;

  select w.address into v_buyer_address from public.market_wallets as w where w.user_id = p_buyer_id;
  if v_buyer_address is null then
    return pg_catalog.jsonb_build_object('status', 'refused', 'reason', 'no_wallet');
  end if;

  select pg_catalog.count(*)::integer into v_recent
  from public.market_reservations as r
  where r.buyer_id = p_buyer_id and r.created_at > pg_catalog.now() - pg_catalog.make_interval(secs => p_rate_window_seconds);
  if v_recent >= p_rate_max then
    return pg_catalog.jsonb_build_object('status', 'refused', 'reason', 'rate_limited');
  end if;

  select * into v_listing from public.market_listings as l where l.id = p_listing_id for update;
  if not found then
    return pg_catalog.jsonb_build_object('status', 'refused', 'reason', 'not_found');
  end if;
  perform arena_private.market_release_stale(p_listing_id);
  select * into v_listing from public.market_listings as l where l.id = p_listing_id;
  if v_listing.status = 'reserved' then
    return pg_catalog.jsonb_build_object('status', 'refused', 'reason', 'reserved');
  end if;
  if v_listing.status <> 'open' then
    return pg_catalog.jsonb_build_object('status', 'refused', 'reason', 'not_open');
  end if;
  if v_listing.seller_id = p_buyer_id or v_listing.seller_address = v_buyer_address then
    return pg_catalog.jsonb_build_object('status', 'refused', 'reason', 'own_listing');
  end if;

  v_fee := (v_listing.price_lamports * p_fee_percent + 99) / 100;
  v_expires := pg_catalog.now() + pg_catalog.make_interval(mins => p_ttl_minutes);
  v_grace := v_expires + pg_catalog.make_interval(mins => p_grace_minutes);
  insert into public.market_reservations (listing_id, buyer_id, buyer_address, seller_address, fee_address, price_lamports, fee_lamports, seller_lamports, chain_id, livemode, expires_at, grace_until)
  values (p_listing_id, p_buyer_id, v_buyer_address, v_listing.seller_address, p_fee_address, v_listing.price_lamports, v_fee, v_listing.price_lamports - v_fee, p_chain_id, p_livemode, v_expires, v_grace)
  returning id into v_res_id;
  update public.market_listings as l set status = 'reserved' where l.id = p_listing_id;
  perform arena_private.market_log('reserved', p_buyer_id, p_listing_id, v_res_id, pg_catalog.jsonb_build_object('price_lamports', v_listing.price_lamports));
  return pg_catalog.jsonb_build_object(
    'status', 'reserved',
    'reservation_id', v_res_id,
    'listing_id', p_listing_id,
    'seller_address', v_listing.seller_address,
    'fee_address', p_fee_address,
    'price_lamports', v_listing.price_lamports,
    'fee_lamports', v_fee,
    'seller_lamports', v_listing.price_lamports - v_fee,
    'expires_at', v_expires,
    'grace_until', v_grace
  );
end;
$$;

revoke all on function public.market_reserve(uuid, uuid, text, integer, boolean, integer, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.market_reserve(uuid, uuid, text, integer, boolean, integer, integer, integer, integer, integer) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Record a VERIFIED payment (the Edge Function already checked the chain: ONE finalized transaction with the seller's transfer and the game's fee transfer, from the buyer's linked address) and SELL.
--
--   Everything runs under the listing row lock then the reservation row lock (the same order as reserve / cancel), so a double submit and two buyers serialise here.
--   1. defensive re-check of the numbers against the reservation (a mismatch is a bug in the caller: an exception, nothing written): the payer, the seller, and at least the whole price in total;
--   2. the transaction SIGNATURE is inserted FIRST (primary key): an existing one is { "status": "replayed" } for the same reservation (idempotent) or { "status": "tx_reused" };
--   3. a second transaction for a reservation that already has a counted 'sale' is stored as leg 'extra', refund_due;
--   4. late payments: after expires_at (or on an expired / cancelled reservation) the payment still counts if it is inside grace_until AND the listing is still unsold and free for him
--      (open, or reserved by this very reservation) AND he holds no other pending reservation; otherwise the reservation and its payments become refund_due (the owner returns them by hand);
--   5. the payment is in -> the sale: the old certificate 'transferred', a NEW certificate for the buyer (held, out of the save until the game collects it), the sale row, listing sold,
--      reservation paid, events. All in this one transaction.
--   Returns { "status": "sold" | "recorded" | "refund_due" | "already_sold" | "replayed" | "tx_reused" | "not_found", ... }.
-- ---------------------------------------------------------------------------------------------------------------------------------------
drop function if exists public.market_record_payment(uuid, uuid, text, text, text, text, numeric, bigint, timestamptz);

create or replace function public.market_record_payment(
  p_buyer_id uuid,
  p_reservation_id uuid,
  p_tx_hash text,
  p_from text,
  p_to text,
  p_amount_units numeric,
  p_block_number bigint,
  p_block_time timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res public.market_reservations%rowtype;
  v_listing public.market_listings%rowtype;
  v_existing public.chain_payments%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_leg text := 'sale';
  v_status text := 'applied';
  v_inserted integer;
  v_cert public.item_certificates%rowtype;
  v_sale_id uuid;
  v_new_cert_id uuid;
begin
  if p_tx_hash !~ '^[1-9A-HJ-NP-Za-km-z]{64,90}$' then
    raise exception using errcode = '22023', message = 'MARKET_PAYMENT_BAD_ARGUMENT';
  end if;

  select * into v_res from public.market_reservations as r where r.id = p_reservation_id and r.buyer_id = p_buyer_id;
  if not found then
    return pg_catalog.jsonb_build_object('status', 'not_found');
  end if;
  select * into v_listing from public.market_listings as l where l.id = v_res.listing_id for update;
  select * into v_res from public.market_reservations as r where r.id = p_reservation_id for update;
  perform arena_private.market_release_stale(v_res.listing_id);
  select * into v_res from public.market_reservations as r where r.id = p_reservation_id;
  select * into v_listing from public.market_listings as l where l.id = v_res.listing_id;

  -- 1. the numbers must be the reservation's own (p_amount_units = lamports paid to the seller and to the fee address together)
  if p_from <> v_res.buyer_address or p_to <> v_res.seller_address or p_amount_units < v_res.price_lamports::numeric then
    raise exception using errcode = '22023', message = 'MARKET_PAYMENT_MISMATCH';
  end if;

  -- 3. a payment already counted for this reservation: this transaction is an extra, owed back
  if exists (select 1 from public.chain_payments as p where p.reservation_id = v_res.id and p.leg = 'sale') then
    v_leg := 'extra';
    v_status := 'refund_due';
  end if;

  -- 2. the signature is consumed first: one transaction, one use, ever
  insert into public.chain_payments (tx_hash, chain_id, livemode, purpose, leg, user_id, reservation_id, from_address, to_address, amount_units, block_number, block_time, status)
  values (p_tx_hash, v_res.chain_id, v_res.livemode, 'market', v_leg, p_buyer_id, v_res.id, p_from, p_to, p_amount_units, p_block_number, p_block_time, v_status)
  on conflict (tx_hash) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    select * into v_existing from public.chain_payments as p where p.tx_hash = p_tx_hash;
    if v_existing.reservation_id = v_res.id and v_existing.user_id = p_buyer_id then
      return pg_catalog.jsonb_build_object('status', 'replayed', 'reservation_status', v_res.status);
    end if;
    return pg_catalog.jsonb_build_object('status', 'tx_reused');
  end if;

  if v_leg = 'extra' then
    perform arena_private.market_log('extra_payment', p_buyer_id, v_res.listing_id, v_res.id, pg_catalog.jsonb_build_object('tx_hash', p_tx_hash));
    return pg_catalog.jsonb_build_object('status', case when v_res.status = 'paid' then 'already_sold' else 'recorded' end, 'extra', true);
  end if;

  -- 4. what state is the reservation in
  if v_res.status = 'paid' then
    update public.chain_payments as p set status = 'refund_due' where p.tx_hash = p_tx_hash;
    return pg_catalog.jsonb_build_object('status', 'already_sold');
  elsif v_res.status in ('refund_due', 'refunded') then
    update public.chain_payments as p set status = 'refund_due' where p.tx_hash = p_tx_hash;
    perform arena_private.market_log('refund_due', p_buyer_id, v_res.listing_id, v_res.id, pg_catalog.jsonb_build_object('tx_hash', p_tx_hash, 'why', 'reservation_already_refund_due'));
    return pg_catalog.jsonb_build_object('status', 'refund_due');
  elsif v_res.status <> 'pending' or v_now > v_res.expires_at then
    -- a late payment
    if v_now <= v_res.grace_until
       and (v_listing.status = 'open' or (v_listing.status = 'reserved' and v_res.status = 'pending'))
       and not exists (select 1 from public.market_reservations as r where r.buyer_id = p_buyer_id and r.status = 'pending' and r.id <> v_res.id) then
      update public.market_reservations as r set status = 'pending', closed_at = null where r.id = v_res.id;
      update public.market_listings as l set status = 'reserved' where l.id = v_res.listing_id and l.status = 'open';
      perform arena_private.market_log('late_payment_accepted', p_buyer_id, v_res.listing_id, v_res.id, pg_catalog.jsonb_build_object('tx_hash', p_tx_hash));
    else
      -- the listing goes back to 'open' ONLY if this very reservation was the one holding it (another buyer may hold it by now)
      if v_res.status = 'pending' then
        update public.market_listings as l set status = 'open' where l.id = v_res.listing_id and l.status = 'reserved';
      end if;
      update public.market_reservations as r set status = 'refund_due', closed_at = pg_catalog.now() where r.id = v_res.id;
      update public.chain_payments as p set status = 'refund_due' where p.reservation_id = v_res.id and p.status = 'applied';
      perform arena_private.market_log('refund_due', p_buyer_id, v_res.listing_id, v_res.id, pg_catalog.jsonb_build_object('tx_hash', p_tx_hash, 'why', 'late_payment_not_deliverable'));
      return pg_catalog.jsonb_build_object('status', 'refund_due');
    end if;
  end if;

  perform arena_private.market_log('payment_recorded', p_buyer_id, v_res.listing_id, v_res.id, pg_catalog.jsonb_build_object('tx_hash', p_tx_hash));

  -- 5. the payment is in: the sale
  select * into v_cert from public.item_certificates as c where c.id = v_listing.certificate_id for update;
  if not found or v_cert.status <> 'listed' then
    raise exception using errcode = 'P0001', message = 'MARKET_CERTIFICATE_NOT_LISTED';
  end if;

  v_sale_id := gen_random_uuid();
  update public.item_certificates as c set status = 'transferred' where c.id = v_cert.id;
  insert into public.item_certificates (user_id, kind, template_id, rarity, tier, substats, upgrade, gold_amount, source, status, bound, content_hash, request_id, request_index, in_save, origin_certificate_id)
  values (p_buyer_id, v_cert.kind, v_cert.template_id, v_cert.rarity, v_cert.tier, v_cert.substats, 0, v_cert.gold_amount, v_cert.source, 'held', false, v_cert.content_hash, 'market:' || v_sale_id::text, 0, false, v_cert.id)
  returning id into v_new_cert_id;
  insert into public.item_certificate_events (certificate_id, user_id, event, detail)
  values
    (v_cert.id, v_cert.user_id, 'transfer', pg_catalog.jsonb_build_object('sale_id', v_sale_id, 'to_certificate', v_new_cert_id)),
    (v_new_cert_id, p_buyer_id, 'transfer', pg_catalog.jsonb_build_object('sale_id', v_sale_id, 'from_certificate', v_cert.id));

  insert into public.market_sales (id, listing_id, reservation_id, certificate_id, new_certificate_id, seller_id, buyer_id, seller_address, buyer_address, fee_address, item_kind, item_template,
                                   price_lamports, fee_lamports, seller_lamports, tx_signature, chain_id, livemode)
  values (v_sale_id, v_listing.id, v_res.id, v_cert.id, v_new_cert_id, v_listing.seller_id, p_buyer_id, v_res.seller_address, v_res.buyer_address, v_res.fee_address, v_cert.kind, v_cert.template_id,
          v_res.price_lamports, v_res.fee_lamports, v_res.seller_lamports, p_tx_hash, v_res.chain_id, v_res.livemode);

  update public.market_listings as l set status = 'sold', closed_at = pg_catalog.now() where l.id = v_listing.id;
  update public.market_reservations as r set status = 'paid', closed_at = pg_catalog.now() where r.id = v_res.id;
  perform arena_private.market_log('sold', p_buyer_id, v_listing.id, v_res.id, pg_catalog.jsonb_build_object('sale_id', v_sale_id, 'price_lamports', v_res.price_lamports, 'fee_lamports', v_res.fee_lamports));
  return pg_catalog.jsonb_build_object('status', 'sold', 'sale_id', v_sale_id, 'certificate_id', v_new_cert_id);
end;
$$;

revoke all on function public.market_record_payment(uuid, uuid, text, text, text, numeric, bigint, timestamptz) from public, anon, authenticated;
grant execute on function public.market_record_payment(uuid, uuid, text, text, text, numeric, bigint, timestamptz) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The crypto Pass on Solana (USDC)
-- ---------------------------------------------------------------------------------------------------------------------------------------
alter table public.entitlements drop constraint if exists entitlements_source_check;
alter table public.entitlements
  add constraint entitlements_source_check check (source in ('stripe', 'mercadopago', 'crypto_bsc', 'crypto_sol', 'grant'));

-- The goal and the public meter count real, live, paid, active Passes only (now including the USDC ones on Solana).
create or replace function arena_private.paid_pass_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.count(*)::bigint
  from public.entitlements as e
  where e.kind = 'adventurer_pass' and e.status = 'active' and e.source in ('stripe', 'mercadopago', 'crypto_bsc', 'crypto_sol') and e.livemode;
$$;

revoke all on function arena_private.paid_pass_count() from public, anon, authenticated;

create or replace function arena_private.entitlements_goal_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'adventurer_pass' and new.status = 'active' and new.livemode and new.source in ('stripe', 'mercadopago', 'crypto_bsc', 'crypto_sol') then
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

-- Grants the Pass for ONE verified USDC transfer (the Edge Function checked the chain). Same signature as 0012, so this REPLACES it. One locked transaction:
--   * the amount (USDC base units, 6 decimals) must cover p_required_units and the block must not be older than the intent (defensive; the function verified both on chain);
--   * the transaction signature is inserted first (primary key of chain_payments): the same signature by the same user again is an idempotent replay, by anyone else it is tx_reused;
--   * a user who ALREADY has an active Pass cannot get a second one: the payment is stored as refund_due (the owner returns it, docs/MARKET_SOLANA.md) and the answer is already_owned;
--   * otherwise the entitlement (source crypto_sol, provider_ref = the signature, livemode as given) is inserted; the 0007 goal trigger fires for a live one.
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

  if exists (select 1 from public.entitlements as e where e.user_id = p_user_id and e.kind = 'adventurer_pass' and e.status = 'active') then
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

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- SQL TEST PLAN (run after applying 0013 to the DEVELOPMENT project; nothing here is run automatically). Use any valid base58 strings for addresses (32 to 44 characters) and signatures
-- (64 to 90 characters), e.g. W1 = '11111111111111111111111111111112', SIG1 = repeat('2', 88).
--
-- A. The guard. Before applying: insert one row into market_wallets (an old '0x...' address) and run the file -> exception MIGRATION_0013_NEEDS_EMPTY_MARKET_TABLES, nothing changed. Empty the tables, apply.
--    Re-running the file on an already migrated database must fail cleanly at the first rename (column "price_cents" does not exist): it is not idempotent by design.
-- B. Clients still cannot touch the market. As `authenticated` (set local role authenticated; select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);):
--      select * from public.market_listings; select * from public.chain_payments; select * from public.market_sales;   -> permission denied
--      select public.market_list('<U>', '<C>', 1000000, 30, 20, 20, 1000000, 50000000000);  -> permission denied for function
--    `select * from public.market_listings_public;` works for anon and authenticated and shows ONLY: id, kind, template_id, rarity, tier, substats, gold_amount, content_hash, price_lamports, status,
--    created_at, expires_at. `select * from arena_private.market_sales_ledger;` -> permission denied (and works for the service role).
--    The old overload is gone: select count(*) from pg_proc where proname = 'market_list'; -> 1.  Same for market_record_payment -> 1.
-- C. Wallet. market_wallet_set('<U1>', W1, 502) -> linked; a '0x...' address -> exception MARKET_WALLET_BAD_ADDRESS; the table check also refuses a 31 character string. The same address for U2 -> address_taken.
-- D. Listing. As the service role, U1 with a linked wallet and a held, unbound certificate C1:
--      select public.market_list('<U1>', '<C1>', 1000000000, 30, 20, 20, 1000000, 50000000000);   -> listed (1 SOL).
--      price 999999 -> reason price; 1000001 (not a multiple of 1,000,000) -> reason price; 50000001000000 -> reason price (over the argument cap); 0 -> reason price.
--      A direct insert into market_listings with price_lamports 1000000000001 or 1500000 + 1 is refused by market_listings_price_check.
-- E. Reserve. U2 (linked wallet W2): select public.market_reserve('<U2>', '<L1>', '<fee address>', 502, false, 5, 30, 120, 10, 3600);
--      -> reserved: price 1000000000 = fee 50000000 + seller 950000000. Rounding: a 1000000 listing reserves fee 50000, seller 950000; a 1234000000 listing fee 61700000, seller 1172300000.
--    The other refusals of 0011 (reservation_exists, own_listing, reserved, rate_limited, no_wallet, not_found, not_open) are unchanged.
-- F. ONE payment sells. For a reservation R (buyer U2, seller W1, price 1000000000):
--      select public.market_record_payment('<U2>', '<R>', repeat('3', 88), '<W2>', '<W1>', 1000000000, 300000000, now());
--        -> { status: sold, sale_id, certificate_id }: C1 'transferred' with a 'transfer' event; a NEW certificate for U2 (held, in_save false, origin_certificate_id = C1, same content_hash);
--           ONE market_sales row (fee_lamports 50000000, seller_lamports 950000000, tx_signature = the signature, livemode as reserved); listing 'sold'; reservation 'paid'; ONE chain_payments row, leg 'sale'.
--      The same call again -> replayed. The same signature for another reservation or user -> tx_reused. A different signature again for the paid reservation -> already_sold, stored as leg 'extra', refund_due.
--      A wrong buyer address, a wrong seller address or an amount under the price (999999999) raises MARKET_PAYMENT_MISMATCH and writes nothing. A 0x hash raises MARKET_PAYMENT_BAD_ARGUMENT.
--      Two sessions submitting the SAME signature at once: exactly one sale, one new certificate, one market_sales row (reservation_id is unique in market_sales).
-- G. Late payments (as in 0011 F): expires_at in the past with grace_until in the future and the listing free -> the payment is accepted (late_payment_accepted) and the sale completes. If another buyer
--      reserved the listing in between -> { status: refund_due } and the reservation and its payment are refund_due. Past grace_until -> refund_due. Queue:
--      select * from public.chain_payments where status = 'refund_due';
-- H. Ledger. select * from arena_private.market_sales_ledger; has one row per sale with price_sol / fee_sol / seller_sol (9 decimals), the raw lamports and the one tx_signature; sum(fee_sol) where livemode is the owner's income.
-- I. The Pass. select public.pass_crypto_start('<U>', 24); then select public.pass_crypto_grant('<U>', repeat('4', 88), '<W>', '<receive>', 10000000, 10000000, 300000001, now(), 502, false);
--      -> granted: one entitlements row (source crypto_sol, provider_ref = the signature, status active, livemode false), one chain_payments row (purpose pass). The same call again -> replayed.
--      9999999 units -> exception PASS_CRYPTO_MISMATCH. A 0x address or hash -> PASS_CRYPTO_BAD_ARGUMENT. A user with an active Pass paying again with a NEW signature -> already_owned and that row is refund_due.
--      The source check accepts 'crypto_sol' and still refuses 'bitcoin'.
-- J. The goal. With livemode true, `select arena_private.paid_pass_count();` rises by 1 per 'crypto_sol' entitlement (livemode false: +0), and pass_meter().progress moves. A devnet (livemode false) Pass gives
--      the perks (arena_private.owns_adventurer_pass -> true) but arena_private.owns_ranking_pass -> false.
-- ---------------------------------------------------------------------------------------------------------------------------------------
