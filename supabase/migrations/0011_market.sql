-- The player market, paid in USDT (BEP-20, BNB Smart Chain). Depends on 0003 (entitlements), 0007, 0009 and 0010 (item certificates).
--
-- NON-CUSTODIAL. The game never holds anyone's money or keys. A buyer pays the SELLER's wallet and the game's FEE wallet directly, on chain, from his own wallet; the server only VERIFIES
-- those two transfers (supabase/functions/_shared/chain/bsc.ts) and then moves the item. The tables below record intentions, verified payments and the ledger of fees. docs/MARKET_USDT.md
-- explains it in Portuguese for the owner.
--
-- WHAT THIS FILE CREATES
--   * item_certificates.in_save / origin_certificate_id   in_save = the item lives in the owner's save (false while it is on the market, or after a sale/cancel until the game collects it);
--                                                         origin_certificate_id = the certificate a bought piece was copied from (a sale ends the old certificate and issues a new one).
--   * public.market_wallets / market_wallet_history / market_wallet_nonces   one linked BSC address per account (proved by a signature), its history, the one-time nonces.
--   * public.market_listings        a certificate for sale: price in whole cents, the seller's address as it was when listed. open / reserved / sold / cancelled / expired.
--   * public.market_reservations    a buyer's 30 minute lock on a listing, with the amounts and addresses he was shown. ONE pending reservation per buyer and per listing (partial unique indexes).
--   * public.chain_payments         every VERIFIED transfer, once. The primary key is the transaction hash: a hash can be consumed ONCE EVER (market legs and the USDT Pass share this table).
--   * public.market_sales           the ledger of sales (price, the game's fee, both hashes), for the owner and the accountant.
--   * public.market_events          append-only audit of everything the market did.
--   * public.market_listings_public the ONLY thing anon / signed-in clients may read: the listed item and its price. No seller, no wallet address.
--   * service-role-only functions   market_wallet_nonce / market_wallet_take_nonce / market_wallet_set / market_list / market_cancel_listing / market_reserve / market_cancel_reservation /
--                                   market_record_payment / market_deliver_ack / market_expire_due. Every change of state is ONE locked statement block.
--   * item_commit and item_certificates_guard and the League reset trigger are REPLACED (create or replace): the daily mint cap no longer counts a certificate that was only transferred to
--     a buyer, the guard also freezes origin_certificate_id, and the League reset also pulls down open listings.
--
-- NOT APPLIED by the work that wrote this file, and NEVER RUN against a real database: only read by static tests (supabase/functions/_shared/__tests__/migration0011.test.ts). The owner applies
-- it AFTER 0010, in the DEVELOPMENT project first, and runs the SQL TEST PLAN at the end. Apply it BEFORE redeploying mint-item (the mint now reads origin_certificate_id).
--
-- ROLLBACK (by hand, in this order; it deletes the market tables, so EXPORT market_sales and chain_payments first if the market ever ran with real money):
--   drop view if exists arena_private.market_sales_ledger;
--   drop view if exists public.market_listings_public;
--   drop function if exists public.market_expire_due(integer);
--   drop function if exists public.market_deliver_ack(uuid, uuid[]);
--   drop function if exists public.market_record_payment(uuid, uuid, text, text, text, text, numeric, bigint, timestamptz);
--   drop function if exists public.market_cancel_reservation(uuid, uuid);
--   drop function if exists public.market_reserve(uuid, uuid, text, integer, boolean, integer, integer, integer, integer, integer);
--   drop function if exists public.market_cancel_listing(uuid, uuid);
--   drop function if exists public.market_list(uuid, uuid, integer, integer, integer, integer, integer, integer);
--   drop function if exists public.market_wallet_set(uuid, text, integer);
--   drop function if exists public.market_wallet_take_nonce(uuid, text);
--   drop function if exists public.market_wallet_nonce(uuid, text, integer, integer, integer);
--   drop function if exists arena_private.market_release_stale(uuid);
--   drop function if exists arena_private.market_log(text, uuid, uuid, uuid, jsonb);
--   drop function if exists arena_private.market_events_no_change();
--   drop table if exists public.market_events;
--   drop table if exists public.market_sales;
--   drop table if exists public.chain_payments;
--   drop table if exists public.market_reservations;
--   drop table if exists public.market_listings;
--   drop table if exists public.market_wallet_nonces;
--   drop table if exists public.market_wallet_history;
--   drop table if exists public.market_wallets;
--   alter table public.item_certificates drop column if exists origin_certificate_id;  alter table public.item_certificates drop column if exists in_save;   -- only after no transfer happened
--   -- then restore item_commit / item_certificates_guard / item_certificates_league_reset from 0010 (re-run those three create-or-replace blocks of 0010).

create schema if not exists arena_private;
revoke all on schema arena_private from public, anon, authenticated;
grant usage on schema arena_private to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The certificate learns two things: whether the item is in the owner's save, and where a bought copy came from.
-- ---------------------------------------------------------------------------------------------------------------------------------------
alter table public.item_certificates add column if not exists in_save boolean not null default true;
alter table public.item_certificates add column if not exists origin_certificate_id uuid references public.item_certificates (id);
create index if not exists item_certificates_origin_idx on public.item_certificates (origin_certificate_id) where origin_certificate_id is not null;
create index if not exists item_certificates_pending_idx on public.item_certificates (user_id) where in_save = false and status = 'held';

alter table public.item_certificate_events drop constraint if exists item_certificate_events_event_check;
alter table public.item_certificate_events
  add constraint item_certificate_events_event_check check (event in ('mint', 'bind', 'list', 'unlist', 'transfer', 'burn', 'revoke', 'deliver'));

-- The guard of 0010 plus origin_certificate_id: the content, the owner and the origin of a certificate never change. (A sale does NOT change the owner: it ends the old certificate and
-- issues a new one for the buyer, so a certificate belongs to one account for its whole life.)
create or replace function arena_private.item_certificates_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.kind is distinct from old.kind
     or new.template_id is distinct from old.template_id
     or new.rarity is distinct from old.rarity
     or new.tier is distinct from old.tier
     or new.substats is distinct from old.substats
     or new.upgrade is distinct from old.upgrade
     or new.gold_amount is distinct from old.gold_amount
     or new.source is distinct from old.source
     or new.created_at is distinct from old.created_at
     or new.content_hash is distinct from old.content_hash
     or new.request_id is distinct from old.request_id
     or new.origin_certificate_id is distinct from old.origin_certificate_id then
    raise exception using errcode = '42501', message = 'ITEM_CERTIFICATE_CONTENT_IS_IMMUTABLE';
  end if;
  if old.bound and not new.bound then
    raise exception using errcode = '42501', message = 'ITEM_CERTIFICATE_BIND_IS_IRREVERSIBLE';
  end if;
  if old.status in ('transferred', 'burned', 'revoked') and new.status is distinct from old.status then
    raise exception using errcode = '42501', message = 'ITEM_CERTIFICATE_IS_FINISHED';
  end if;
  if new.status = 'listed' and new.bound then
    raise exception using errcode = '42501', message = 'ITEM_CERTIFICATE_BOUND_CANNOT_BE_LISTED';
  end if;
  return new;
end;
$$;

revoke all on function arena_private.item_certificates_guard() from public, anon, authenticated;

-- item_commit of 0010, with ONE change: the daily cap counts only certificates the server MINTED (origin_certificate_id is null). A piece a player bought is not an issue of his account.
create or replace function public.item_commit(
  p_user_id uuid,
  p_request_id text,
  p_kind text,
  p_template jsonb,
  p_certs jsonb,
  p_burn_ids uuid[],
  p_caps jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cap jsonb;
  v_existing integer;
  v_new integer;
  v_cert jsonb;
  v_index integer := 0;
  v_id uuid;
  v_created timestamptz;
  v_out jsonb := '[]'::jsonb;
  v_burn_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('item_commit:' || p_user_id::text, 0));

  if exists (select 1 from public.item_mint_requests as r where r.user_id = p_user_id and r.request_id = p_request_id) then
    return pg_catalog.jsonb_build_object('status', 'replay');
  end if;

  for v_cap in select e.value from pg_catalog.jsonb_array_elements(coalesce(p_caps, '[]'::jsonb)) as e loop
    select pg_catalog.count(*)::integer into v_existing
    from public.item_certificates as c
    where c.user_id = p_user_id
      and c.origin_certificate_id is null
      and c.kind = v_cap ->> 'kind'
      and (v_cap ->> 'tier' is null or c.tier = (v_cap ->> 'tier')::integer)
      and c.created_at >= pg_catalog.now() - interval '1 day';
    select pg_catalog.count(*)::integer into v_new
    from pg_catalog.jsonb_array_elements(p_certs) as e
    where e.value ->> 'kind' = v_cap ->> 'kind'
      and (v_cap ->> 'tier' is null or (e.value ->> 'tier')::integer = (v_cap ->> 'tier')::integer);
    if v_new > 0 and v_existing + v_new > (v_cap ->> 'max')::integer then
      return pg_catalog.jsonb_build_object('status', 'cap');
    end if;
  end loop;

  if p_burn_ids is not null and pg_catalog.cardinality(p_burn_ids) > 0 then
    select pg_catalog.count(*)::integer into v_burn_count
    from public.item_certificates as c
    where c.id = any (p_burn_ids) and c.user_id = p_user_id and c.status = 'held';
    if v_burn_count <> pg_catalog.cardinality(p_burn_ids) then
      return pg_catalog.jsonb_build_object('status', 'burn_failed');
    end if;
    update public.item_certificates as c set status = 'burned' where c.id = any (p_burn_ids) and c.user_id = p_user_id and c.status = 'held';
    insert into public.item_certificate_events (certificate_id, user_id, event, detail)
    select u.burn_id, p_user_id, 'burn', pg_catalog.jsonb_build_object('reason', 'forge_ingredient', 'request_id', p_request_id)
    from pg_catalog.unnest(p_burn_ids) as u (burn_id);
  end if;

  insert into public.item_mint_requests (user_id, request_id, kind, template) values (p_user_id, p_request_id, p_kind, p_template);

  for v_cert in select e.value from pg_catalog.jsonb_array_elements(p_certs) as e loop
    insert into public.item_certificates (user_id, kind, template_id, rarity, tier, substats, upgrade, gold_amount, source, content_hash, request_id, request_index)
    values (
      p_user_id,
      v_cert ->> 'kind',
      v_cert ->> 'template_id',
      v_cert ->> 'rarity',
      (v_cert ->> 'tier')::integer,
      coalesce(v_cert -> 'substats', '[]'::jsonb),
      0,
      (v_cert ->> 'gold_amount')::integer,
      v_cert ->> 'source',
      v_cert ->> 'content_hash',
      p_request_id,
      v_index
    )
    returning id, created_at into v_id, v_created;
    insert into public.item_certificate_events (certificate_id, user_id, event, detail)
    values (v_id, p_user_id, 'mint', pg_catalog.jsonb_build_object('source', v_cert ->> 'source', 'request_id', p_request_id));
    v_out := v_out || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id', v_id, 'created_at', v_created));
    v_index := v_index + 1;
  end loop;

  return pg_catalog.jsonb_build_object('status', 'created', 'certificates', v_out);
end;
$$;

revoke all on function public.item_commit(uuid, text, text, jsonb, jsonb, uuid[], jsonb) from public, anon, authenticated;
grant execute on function public.item_commit(uuid, text, text, jsonb, jsonb, uuid[], jsonb) to service_role;

-- The League reset of 0010, plus: whatever was minted before it and is still listed is pulled off the market (its open listing is cancelled and the certificate revoked).
create or replace function arena_private.item_certificates_league_reset()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reset_at is not null and old.reset_at is null then
    update public.market_listings as l set status = 'cancelled', closed_at = pg_catalog.now()
    from public.item_certificates as c
    where l.certificate_id = c.id and l.status = 'open' and c.created_at < new.reset_at;
    insert into public.item_certificate_events (certificate_id, user_id, event, detail)
    select c.id, c.user_id, 'revoke', pg_catalog.jsonb_build_object('reason', 'league_reset')
    from public.item_certificates as c
    where c.status in ('held', 'listed') and c.created_at < new.reset_at
      and not exists (select 1 from public.market_listings as l where l.certificate_id = c.id and l.status = 'reserved');
    update public.item_certificates as c set status = 'revoked'
    where c.status in ('held', 'listed') and c.created_at < new.reset_at
      and not exists (select 1 from public.market_listings as l where l.certificate_id = c.id and l.status = 'reserved');
  end if;
  return new;
end;
$$;

revoke all on function arena_private.item_certificates_league_reset() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Wallets: ONE linked BSC address per account, proved by a signature (EIP-191) over a one-time nonce the server wrote.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists public.market_wallets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  address text not null,
  chain_id integer not null,
  linked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint market_wallets_address_check check (address ~ '^0x[0-9a-f]{40}$'),
  -- one address, one account: the payer of a purchase is then unambiguous
  constraint market_wallets_address_unique unique (address)
);

create table if not exists public.market_wallet_history (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  address text not null,
  chain_id integer not null,
  linked_at timestamptz not null,
  replaced_at timestamptz not null default now()
);

create table if not exists public.market_wallet_nonces (
  user_id uuid not null references auth.users (id) on delete cascade,
  nonce text not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  primary key (user_id, nonce)
);

create index if not exists market_wallet_nonces_user_idx on public.market_wallet_nonces (user_id, issued_at desc);

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Listings
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists public.market_listings (
  id uuid primary key default gen_random_uuid(),
  certificate_id uuid not null references public.item_certificates (id),
  seller_id uuid not null references auth.users (id) on delete cascade,
  -- the seller's linked address AT THE MOMENT OF LISTING: the payout goes here even if he relinks later (he cannot relink while a listing is live)
  seller_address text not null,
  -- USDT in whole cents (1000 = 10.00 USDT). Bounds are the same as supabase/functions/_shared/chain/money.ts (MARKET_MIN_PRICE_CENTS / MARKET_MAX_PRICE_CENTS).
  price_cents integer not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  closed_at timestamptz,
  constraint market_listings_status_check check (status in ('open', 'reserved', 'sold', 'cancelled', 'expired')),
  constraint market_listings_price_check check (price_cents between 50 and 500000),
  constraint market_listings_address_check check (seller_address ~ '^0x[0-9a-f]{40}$')
);

-- a certificate has at most one LIVE listing
create unique index if not exists market_listings_one_live_per_certificate on public.market_listings (certificate_id) where status in ('open', 'reserved');
create index if not exists market_listings_browse_idx on public.market_listings (status, created_at desc);
create index if not exists market_listings_seller_idx on public.market_listings (seller_id, created_at desc);

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Reservations: a buyer's lock, with the amounts and addresses he was shown (the verification of his payments uses THESE, never anything he sends).
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists public.market_reservations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.market_listings (id),
  -- plain uuids (no foreign key to auth.users): the financial trail outlives an account
  buyer_id uuid not null,
  buyer_address text not null,
  seller_address text not null,
  fee_address text not null,
  price_cents integer not null,
  fee_cents integer not null,
  seller_cents integer not null,
  chain_id integer not null,
  livemode boolean not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  -- the lock ends here (30 minutes)
  expires_at timestamptz not null,
  -- a valid payment that arrives after expires_at but before this still delivers the item, if the listing is still unsold
  grace_until timestamptz not null,
  closed_at timestamptz,
  constraint market_reservations_status_check check (status in ('pending', 'paid', 'expired', 'cancelled', 'refund_due', 'refunded')),
  constraint market_reservations_split_check check (fee_cents + seller_cents = price_cents and fee_cents > 0 and seller_cents > 0)
);

-- ONE pending reservation per buyer, and ONE per listing: two buyers can never both hold the same listing, a buyer can never hold two.
create unique index if not exists market_reservations_one_pending_per_buyer on public.market_reservations (buyer_id) where status = 'pending';
create unique index if not exists market_reservations_one_pending_per_listing on public.market_reservations (listing_id) where status = 'pending';
create index if not exists market_reservations_buyer_idx on public.market_reservations (buyer_id, created_at desc);
create index if not exists market_reservations_listing_idx on public.market_reservations (listing_id);

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Verified chain payments. The PRIMARY KEY IS THE TRANSACTION HASH: a hash is consumed once, ever (a market leg or a Pass, never both, never twice).
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists public.chain_payments (
  tx_hash text primary key,
  chain_id integer not null,
  livemode boolean not null,
  purpose text not null,
  -- 'seller' / 'fee' = the two legs of a sale; 'extra' = a second transfer for a leg already paid (owed back); 'pass' = the USDT Pass
  leg text not null,
  user_id uuid not null,
  reservation_id uuid references public.market_reservations (id),
  from_address text not null,
  to_address text not null,
  amount_units numeric(40, 0) not null,
  block_number bigint not null,
  block_time timestamptz not null,
  -- 'applied' = counted; 'refund_due' = valid on chain but the sale/Pass did not happen: the OWNER (or the seller, see docs) returns it by hand and then marks it 'refunded'
  status text not null default 'applied',
  note text,
  created_at timestamptz not null default now(),
  constraint chain_payments_hash_check check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  constraint chain_payments_purpose_check check (purpose in ('market', 'pass')),
  constraint chain_payments_leg_check check (leg in ('seller', 'fee', 'extra', 'pass')),
  constraint chain_payments_status_check check (status in ('applied', 'refund_due', 'refunded')),
  constraint chain_payments_amount_check check (amount_units > 0)
);

-- one counted payment per leg of a reservation
create unique index if not exists chain_payments_one_leg_per_reservation on public.chain_payments (reservation_id, leg) where reservation_id is not null and leg in ('seller', 'fee');
create index if not exists chain_payments_user_idx on public.chain_payments (user_id, created_at desc);
create index if not exists chain_payments_refund_idx on public.chain_payments (status) where status = 'refund_due';

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The ledger of sales (the owner's fee statement). Plain uuids and copied values: nothing here depends on a row that can be deleted.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists public.market_sales (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null,
  reservation_id uuid not null unique,
  certificate_id uuid not null,
  new_certificate_id uuid not null,
  seller_id uuid not null,
  buyer_id uuid not null,
  seller_address text not null,
  buyer_address text not null,
  fee_address text not null,
  item_kind text not null,
  item_template text not null,
  price_cents integer not null,
  fee_cents integer not null,
  seller_cents integer not null,
  seller_tx_hash text not null,
  fee_tx_hash text not null,
  chain_id integer not null,
  -- true only for BSC mainnet: a sale made on the testnet is stored but is not real money
  livemode boolean not null,
  sold_at timestamptz not null default now(),
  constraint market_sales_split_check check (fee_cents + seller_cents = price_cents)
);

create index if not exists market_sales_seller_idx on public.market_sales (seller_id, sold_at desc);
create index if not exists market_sales_buyer_idx on public.market_sales (buyer_id, sold_at desc);
create index if not exists market_sales_sold_idx on public.market_sales (sold_at);

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Audit (append-only)
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists public.market_events (
  id bigint generated always as identity primary key,
  kind text not null,
  user_id uuid,
  listing_id uuid,
  reservation_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists market_events_listing_idx on public.market_events (listing_id, id);
create index if not exists market_events_user_idx on public.market_events (user_id, id);

create or replace function arena_private.market_events_no_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'MARKET_EVENTS_APPEND_ONLY';
end;
$$;

revoke all on function arena_private.market_events_no_change() from public, anon, authenticated;

drop trigger if exists market_events_no_update on public.market_events;
create trigger market_events_no_update
  before update or delete on public.market_events
  for each row
  execute function arena_private.market_events_no_change();

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Privileges: NO client role touches any of these tables. Row level security is on with no policy, and every grant is service_role only.
-- ---------------------------------------------------------------------------------------------------------------------------------------
alter table public.market_wallets enable row level security;
alter table public.market_wallet_history enable row level security;
alter table public.market_wallet_nonces enable row level security;
alter table public.market_listings enable row level security;
alter table public.market_reservations enable row level security;
alter table public.chain_payments enable row level security;
alter table public.market_sales enable row level security;
alter table public.market_events enable row level security;

revoke all on table public.market_wallets from public, anon, authenticated;
revoke all on table public.market_wallet_history from public, anon, authenticated;
revoke all on table public.market_wallet_nonces from public, anon, authenticated;
revoke all on table public.market_listings from public, anon, authenticated;
revoke all on table public.market_reservations from public, anon, authenticated;
revoke all on table public.chain_payments from public, anon, authenticated;
revoke all on table public.market_sales from public, anon, authenticated;
revoke all on table public.market_events from public, anon, authenticated;

grant select, insert, update on table public.market_wallets to service_role;
grant select, insert on table public.market_wallet_history to service_role;
grant select, insert, update on table public.market_wallet_nonces to service_role;
grant select, insert, update on table public.market_listings to service_role;
grant select, insert, update on table public.market_reservations to service_role;
grant select, insert, update on table public.chain_payments to service_role;
grant select, insert on table public.market_sales to service_role;
grant select, insert on table public.market_events to service_role;

-- The public face of the market: the listed item (read from its certificate) and its price. NOT the seller, NOT any wallet address, NOT the certificate id.
-- A view owned by the migration role reads the locked tables for the caller (the view is the only door), and it shows live listings only.
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
  l.price_cents,
  l.status,
  l.created_at,
  l.expires_at
from public.market_listings as l
join public.item_certificates as c on c.id = l.certificate_id
where l.status in ('open', 'reserved') and l.expires_at > pg_catalog.now();

revoke all on table public.market_listings_public from public, anon, authenticated;
grant select on table public.market_listings_public to anon, authenticated, service_role;

-- The owner's fee statement (SQL editor, "download CSV"): private schema, never exposed by the API.
create or replace view arena_private.market_sales_ledger as
select
  s.sold_at,
  s.id as sale_id,
  s.livemode,
  s.chain_id,
  s.item_kind,
  s.item_template,
  (s.price_cents / 100.0)::numeric(12, 2) as price_usdt,
  (s.fee_cents / 100.0)::numeric(12, 2) as fee_usdt,
  (s.seller_cents / 100.0)::numeric(12, 2) as seller_usdt,
  s.seller_address,
  s.buyer_address,
  s.fee_address,
  s.fee_tx_hash,
  s.seller_tx_hash,
  s.seller_id,
  s.buyer_id
from public.market_sales as s;

revoke all on table arena_private.market_sales_ledger from public, anon, authenticated;
grant select on table arena_private.market_sales_ledger to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Internal helpers (not callable by any client role)
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function arena_private.market_log(p_kind text, p_user_id uuid, p_listing_id uuid, p_reservation_id uuid, p_detail jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.market_events (kind, user_id, listing_id, reservation_id, detail)
  values (pg_catalog.left(p_kind, 64), p_user_id, p_listing_id, p_reservation_id, coalesce(p_detail, '{}'::jsonb));
$$;

revoke all on function arena_private.market_log(text, uuid, uuid, uuid, jsonb) from public, anon, authenticated;

-- Releases what time has made stale on ONE listing. The CALLER HOLDS THE LISTING ROW LOCK.
--   * a reserved listing whose pending reservation ran out with NO payment on it -> the reservation 'expired', the listing 'open' again;
--   * ... that ran out past its grace with a payment already recorded -> the reservation 'refund_due' (and its payments), the listing 'open' again;
--   * an open listing past its expiry -> 'expired', and the certificate goes back to its owner ('held', still out of the save until the game collects it).
create or replace function arena_private.market_release_stale(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.market_listings%rowtype;
  v_res public.market_reservations%rowtype;
  v_paid integer;
begin
  select * into v_listing from public.market_listings as l where l.id = p_listing_id;
  if not found then
    return;
  end if;

  if v_listing.status = 'reserved' then
    select * into v_res from public.market_reservations as r where r.listing_id = p_listing_id and r.status = 'pending' for update;
    if found then
      select pg_catalog.count(*)::integer into v_paid from public.chain_payments as p where p.reservation_id = v_res.id;
      if v_paid = 0 and v_res.expires_at <= pg_catalog.now() then
        update public.market_reservations as r set status = 'expired', closed_at = pg_catalog.now() where r.id = v_res.id;
        update public.market_listings as l set status = 'open' where l.id = p_listing_id;
        perform arena_private.market_log('reservation_expired', v_res.buyer_id, p_listing_id, v_res.id, '{}'::jsonb);
      elsif v_paid > 0 and v_res.grace_until <= pg_catalog.now() then
        update public.market_reservations as r set status = 'refund_due', closed_at = pg_catalog.now() where r.id = v_res.id;
        update public.chain_payments as p set status = 'refund_due' where p.reservation_id = v_res.id and p.status = 'applied';
        update public.market_listings as l set status = 'open' where l.id = p_listing_id;
        perform arena_private.market_log('refund_due', v_res.buyer_id, p_listing_id, v_res.id, pg_catalog.jsonb_build_object('why', 'incomplete_payment_after_grace'));
      end if;
    else
      -- reserved but nobody holds it: heal
      update public.market_listings as l set status = 'open' where l.id = p_listing_id;
    end if;
    select * into v_listing from public.market_listings as l where l.id = p_listing_id;
  end if;

  if v_listing.status = 'open' and v_listing.expires_at <= pg_catalog.now() then
    update public.market_listings as l set status = 'expired', closed_at = pg_catalog.now() where l.id = p_listing_id;
    insert into public.item_certificate_events (certificate_id, user_id, event, detail)
    select c.id, c.user_id, 'unlist', pg_catalog.jsonb_build_object('reason', 'expired', 'listing_id', p_listing_id)
    from public.item_certificates as c where c.id = v_listing.certificate_id and c.status = 'listed';
    update public.item_certificates as c set status = 'held' where c.id = v_listing.certificate_id and c.status = 'listed';
    perform arena_private.market_log('listing_expired', v_listing.seller_id, p_listing_id, null, '{}'::jsonb);
  end if;
end;
$$;

revoke all on function arena_private.market_release_stale(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Wallet link
-- ---------------------------------------------------------------------------------------------------------------------------------------
-- A one-time nonce, rate limited (p_max per p_window_seconds) under the user's lock. Returns { "status": "ok", "issued_at", "expires_at" } or { "status": "rate_limited" }.
create or replace function public.market_wallet_nonce(p_user_id uuid, p_nonce text, p_ttl_seconds integer, p_max integer, p_window_seconds integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recent integer;
  v_issued timestamptz := pg_catalog.now();
  v_expires timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('market_wallet:' || p_user_id::text, 0));
  select pg_catalog.count(*)::integer into v_recent
  from public.market_wallet_nonces as n
  where n.user_id = p_user_id and n.issued_at > v_issued - pg_catalog.make_interval(secs => p_window_seconds);
  if v_recent >= p_max then
    return pg_catalog.jsonb_build_object('status', 'rate_limited');
  end if;
  v_expires := v_issued + pg_catalog.make_interval(secs => p_ttl_seconds);
  insert into public.market_wallet_nonces (user_id, nonce, issued_at, expires_at) values (p_user_id, p_nonce, v_issued, v_expires);
  return pg_catalog.jsonb_build_object('status', 'ok', 'issued_at', v_issued, 'expires_at', v_expires);
end;
$$;

revoke all on function public.market_wallet_nonce(uuid, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.market_wallet_nonce(uuid, text, integer, integer, integer) to service_role;

-- Consumes a nonce: ONE statement marks it used, so a replay finds nothing. Returns { "status": "ok", "issued_at" } or { "status": "invalid" } (unknown, used, expired or another user's).
create or replace function public.market_wallet_take_nonce(p_user_id uuid, p_nonce text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_issued timestamptz;
begin
  update public.market_wallet_nonces as n
  set used_at = pg_catalog.now()
  where n.user_id = p_user_id and n.nonce = p_nonce and n.used_at is null and n.expires_at > pg_catalog.now()
  returning n.issued_at into v_issued;
  if v_issued is null then
    return pg_catalog.jsonb_build_object('status', 'invalid');
  end if;
  return pg_catalog.jsonb_build_object('status', 'ok', 'issued_at', v_issued);
end;
$$;

revoke all on function public.market_wallet_take_nonce(uuid, text) from public, anon, authenticated;
grant execute on function public.market_wallet_take_nonce(uuid, text) to service_role;

-- Links (or changes) the address AFTER the server verified the signature. Refused while the account has a live listing or a pending reservation (money or an item is in flight),
-- and when another account already linked that address. Returns { "status": "linked" | "unchanged" | "busy" | "address_taken" }.
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
  if p_address !~ '^0x[0-9a-f]{40}$' then
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
-- Listing
-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Lists a certificate. Under the SAME per-user lock as item_commit / item_certificate_transition (so a bind or a burn cannot slip in between the check and the change), and the certificate row lock.
--   Refusals: no_wallet, flagged (the account ever hit a plausibility limit), not_found, already_listed, not_held, bound, not_in_save (the item is still waiting to be collected into the save),
--   price, limit_active (too many live listings), limit_day (too many listings in 24 hours).
--   Success: the certificate becomes 'listed' and OUT OF THE SAVE (in_save = false); returns { "status": "listed", "listing_id", "expires_at" }.
create or replace function public.market_list(
  p_user_id uuid,
  p_certificate_id uuid,
  p_price_cents integer,
  p_ttl_days integer,
  p_max_active integer,
  p_max_per_day integer,
  p_min_cents integer,
  p_max_cents integer
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
  if p_price_cents is null or p_price_cents < p_min_cents or p_price_cents > p_max_cents then
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
  insert into public.market_listings (certificate_id, seller_id, seller_address, price_cents, expires_at)
  values (p_certificate_id, p_user_id, v_address, p_price_cents, v_expires)
  returning id into v_listing_id;
  insert into public.item_certificate_events (certificate_id, user_id, event, detail)
  values (p_certificate_id, p_user_id, 'list', pg_catalog.jsonb_build_object('listing_id', v_listing_id, 'price_cents', p_price_cents));
  perform arena_private.market_log('listed', p_user_id, v_listing_id, null, pg_catalog.jsonb_build_object('price_cents', p_price_cents, 'certificate_id', p_certificate_id));
  return pg_catalog.jsonb_build_object('status', 'listed', 'listing_id', v_listing_id, 'expires_at', v_expires);
end;
$$;

revoke all on function public.market_list(uuid, uuid, integer, integer, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.market_list(uuid, uuid, integer, integer, integer, integer, integer, integer) to service_role;

-- Cancels a listing of the caller. NOT while it is reserved (a buyer is paying). The certificate goes back to 'held', still out of the save until the game collects it.
--   Returns { "status": "cancelled" | "not_found" | "reserved" | "not_open" }.
create or replace function public.market_cancel_listing(p_user_id uuid, p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.market_listings%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('item_commit:' || p_user_id::text, 0));
  select * into v_listing from public.market_listings as l where l.id = p_listing_id and l.seller_id = p_user_id for update;
  if not found then
    return pg_catalog.jsonb_build_object('status', 'not_found');
  end if;
  perform arena_private.market_release_stale(p_listing_id);
  select * into v_listing from public.market_listings as l where l.id = p_listing_id;
  if v_listing.status = 'reserved' then
    return pg_catalog.jsonb_build_object('status', 'reserved');
  end if;
  if v_listing.status <> 'open' then
    return pg_catalog.jsonb_build_object('status', 'not_open');
  end if;
  update public.market_listings as l set status = 'cancelled', closed_at = pg_catalog.now() where l.id = p_listing_id;
  insert into public.item_certificate_events (certificate_id, user_id, event, detail)
  values (v_listing.certificate_id, p_user_id, 'unlist', pg_catalog.jsonb_build_object('reason', 'cancelled', 'listing_id', p_listing_id));
  update public.item_certificates as c set status = 'held' where c.id = v_listing.certificate_id and c.status = 'listed';
  perform arena_private.market_log('listing_cancelled', p_user_id, p_listing_id, null, '{}'::jsonb);
  return pg_catalog.jsonb_build_object('status', 'cancelled', 'certificate_id', v_listing.certificate_id);
end;
$$;

revoke all on function public.market_cancel_listing(uuid, uuid) from public, anon, authenticated;
grant execute on function public.market_cancel_listing(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Reserve
-- ---------------------------------------------------------------------------------------------------------------------------------------
-- A buyer locks a listing for p_ttl_minutes. Under the buyer's lock and the listing row lock. The fee is price x p_fee_percent / 100 ROUNDED UP to the cent; the seller's share is the rest
-- (the same rule as money.ts splitPrice). Refusals: no_wallet, reservation_exists (returns it), rate_limited, not_found, reserved (someone else holds it), not_open, own_listing.
--   Returns { "status": "reserved", "reservation_id", "seller_address", "fee_address", "price_cents", "fee_cents", "seller_cents", "expires_at", "grace_until" }.
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
  v_fee integer;
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

  v_fee := (v_listing.price_cents * p_fee_percent + 99) / 100;
  v_expires := pg_catalog.now() + pg_catalog.make_interval(mins => p_ttl_minutes);
  v_grace := v_expires + pg_catalog.make_interval(mins => p_grace_minutes);
  insert into public.market_reservations (listing_id, buyer_id, buyer_address, seller_address, fee_address, price_cents, fee_cents, seller_cents, chain_id, livemode, expires_at, grace_until)
  values (p_listing_id, p_buyer_id, v_buyer_address, v_listing.seller_address, p_fee_address, v_listing.price_cents, v_fee, v_listing.price_cents - v_fee, p_chain_id, p_livemode, v_expires, v_grace)
  returning id into v_res_id;
  update public.market_listings as l set status = 'reserved' where l.id = p_listing_id;
  perform arena_private.market_log('reserved', p_buyer_id, p_listing_id, v_res_id, pg_catalog.jsonb_build_object('price_cents', v_listing.price_cents));
  return pg_catalog.jsonb_build_object(
    'status', 'reserved',
    'reservation_id', v_res_id,
    'listing_id', p_listing_id,
    'seller_address', v_listing.seller_address,
    'fee_address', p_fee_address,
    'price_cents', v_listing.price_cents,
    'fee_cents', v_fee,
    'seller_cents', v_listing.price_cents - v_fee,
    'expires_at', v_expires,
    'grace_until', v_grace
  );
end;
$$;

revoke all on function public.market_reserve(uuid, uuid, text, integer, boolean, integer, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.market_reserve(uuid, uuid, text, integer, boolean, integer, integer, integer, integer, integer) to service_role;

-- The buyer lets go of his reservation BEFORE any payment is recorded on it. With a payment recorded he cannot (he finishes it, or it ends in refund_due after the grace).
--   Returns { "status": "cancelled" | "not_found" | "not_pending" | "has_payment" }.
create or replace function public.market_cancel_reservation(p_buyer_id uuid, p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res public.market_reservations%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('market_buyer:' || p_buyer_id::text, 0));
  select * into v_res from public.market_reservations as r where r.id = p_reservation_id and r.buyer_id = p_buyer_id;
  if not found then
    return pg_catalog.jsonb_build_object('status', 'not_found');
  end if;
  perform 1 from public.market_listings as l where l.id = v_res.listing_id for update;
  select * into v_res from public.market_reservations as r where r.id = p_reservation_id for update;
  if v_res.status <> 'pending' then
    return pg_catalog.jsonb_build_object('status', 'not_pending');
  end if;
  if exists (select 1 from public.chain_payments as p where p.reservation_id = v_res.id) then
    return pg_catalog.jsonb_build_object('status', 'has_payment');
  end if;
  update public.market_reservations as r set status = 'cancelled', closed_at = pg_catalog.now() where r.id = v_res.id;
  update public.market_listings as l set status = 'open' where l.id = v_res.listing_id and l.status = 'reserved';
  perform arena_private.market_log('reservation_cancelled', p_buyer_id, v_res.listing_id, v_res.id, '{}'::jsonb);
  return pg_catalog.jsonb_build_object('status', 'cancelled');
end;
$$;

revoke all on function public.market_cancel_reservation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.market_cancel_reservation(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Record a VERIFIED payment (the Edge Function already checked the chain) and, when both legs are in, SELL.
--
--   Everything runs under the listing row lock then the reservation row lock (the same order as reserve / cancel), so a double submit and two buyers serialise here.
--   1. defensive re-check of the numbers against the reservation (a mismatch is a bug in the caller: an exception, nothing written);
--   2. the transaction hash is inserted FIRST (primary key): an existing hash is { "status": "replayed" } for the same reservation (idempotent) or { "status": "tx_reused" };
--   3. a second transfer for a leg already paid is stored as leg 'extra', refund_due;
--   4. late payments: after expires_at (or on an expired / cancelled reservation) the payment still counts if it is inside grace_until AND the listing is still unsold and free for him
--      (open, or reserved by this very reservation) AND he holds no other pending reservation; otherwise the reservation and its payments become refund_due (the owner returns them by hand);
--   5. both legs applied -> the sale: the old certificate 'transferred', a NEW certificate for the buyer (held, out of the save until the game collects it), the sale row, listing sold,
--      reservation paid, events. All in this one transaction.
--   Returns { "status": "recorded" | "sold" | "refund_due" | "already_sold" | "replayed" | "tx_reused" | "not_found", ... }.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.market_record_payment(
  p_buyer_id uuid,
  p_reservation_id uuid,
  p_leg text,
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
  v_expected_to text;
  v_expected_units numeric;
  v_leg text := p_leg;
  v_status text := 'applied';
  v_inserted integer;
  v_outcome text := 'recorded';
  v_seller_paid boolean;
  v_fee_paid boolean;
  v_cert public.item_certificates%rowtype;
  v_sale_id uuid;
  v_new_cert_id uuid;
begin
  if p_leg not in ('seller', 'fee') or p_tx_hash !~ '^0x[0-9a-f]{64}$' then
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

  -- 1. the numbers must be the reservation's own
  v_expected_to := case when p_leg = 'seller' then v_res.seller_address else v_res.fee_address end;
  v_expected_units := (case when p_leg = 'seller' then v_res.seller_cents else v_res.fee_cents end)::numeric * 10000000000000000;
  if p_from <> v_res.buyer_address or p_to <> v_expected_to or p_amount_units < v_expected_units then
    raise exception using errcode = '22023', message = 'MARKET_PAYMENT_MISMATCH';
  end if;

  -- 3. a leg already paid: this transfer is an extra, owed back
  if exists (select 1 from public.chain_payments as p where p.reservation_id = v_res.id and p.leg = p_leg) then
    v_leg := 'extra';
    v_status := 'refund_due';
  end if;

  -- 2. the hash is consumed first: one transaction, one use, ever
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
    perform arena_private.market_log('extra_payment', p_buyer_id, v_res.listing_id, v_res.id, pg_catalog.jsonb_build_object('tx_hash', p_tx_hash, 'leg', p_leg));
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

  perform arena_private.market_log('payment_recorded', p_buyer_id, v_res.listing_id, v_res.id, pg_catalog.jsonb_build_object('tx_hash', p_tx_hash, 'leg', p_leg));

  -- 5. both legs in: the sale
  select exists (select 1 from public.chain_payments as p where p.reservation_id = v_res.id and p.leg = 'seller' and p.status = 'applied') into v_seller_paid;
  select exists (select 1 from public.chain_payments as p where p.reservation_id = v_res.id and p.leg = 'fee' and p.status = 'applied') into v_fee_paid;
  if not (v_seller_paid and v_fee_paid) then
    return pg_catalog.jsonb_build_object('status', 'recorded', 'missing', case when v_seller_paid then 'fee' else 'seller' end);
  end if;

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
                                   price_cents, fee_cents, seller_cents, seller_tx_hash, fee_tx_hash, chain_id, livemode)
  select v_sale_id, v_listing.id, v_res.id, v_cert.id, v_new_cert_id, v_listing.seller_id, p_buyer_id, v_res.seller_address, v_res.buyer_address, v_res.fee_address, v_cert.kind, v_cert.template_id,
         v_res.price_cents, v_res.fee_cents, v_res.seller_cents,
         (select p.tx_hash from public.chain_payments as p where p.reservation_id = v_res.id and p.leg = 'seller' and p.status = 'applied'),
         (select p.tx_hash from public.chain_payments as p where p.reservation_id = v_res.id and p.leg = 'fee' and p.status = 'applied'),
         v_res.chain_id, v_res.livemode;

  update public.market_listings as l set status = 'sold', closed_at = pg_catalog.now() where l.id = v_listing.id;
  update public.market_reservations as r set status = 'paid', closed_at = pg_catalog.now() where r.id = v_res.id;
  perform arena_private.market_log('sold', p_buyer_id, v_listing.id, v_res.id, pg_catalog.jsonb_build_object('sale_id', v_sale_id, 'price_cents', v_res.price_cents, 'fee_cents', v_res.fee_cents));
  v_outcome := 'sold';
  return pg_catalog.jsonb_build_object('status', v_outcome, 'sale_id', v_sale_id, 'certificate_id', v_new_cert_id);
end;
$$;

revoke all on function public.market_record_payment(uuid, uuid, text, text, text, text, numeric, bigint, timestamptz) from public, anon, authenticated;
grant execute on function public.market_record_payment(uuid, uuid, text, text, text, text, numeric, bigint, timestamptz) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Delivery: the game says "these certificates are now in the save". Only the owner's held, out-of-save certificates change.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.market_deliver_ack(p_user_id uuid, p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_ids is null or pg_catalog.cardinality(p_ids) = 0 or pg_catalog.cardinality(p_ids) > 50 then
    raise exception using errcode = '22023', message = 'MARKET_ACK_BAD_IDS';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('item_commit:' || p_user_id::text, 0));
  insert into public.item_certificate_events (certificate_id, user_id, event, detail)
  select c.id, p_user_id, 'deliver', '{}'::jsonb
  from public.item_certificates as c where c.id = any (p_ids) and c.user_id = p_user_id and c.status = 'held' and not c.in_save;
  update public.item_certificates as c set in_save = true where c.id = any (p_ids) and c.user_id = p_user_id and c.status = 'held' and not c.in_save;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.market_deliver_ack(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.market_deliver_ack(uuid, uuid[]) to service_role;

-- Sweeps stale reservations and expired listings (at most p_limit per call). The functions call it before they read, so the market tidies itself without a scheduler.
create or replace function public.market_expire_due(p_limit integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select l.id from public.market_listings as l
    where (l.status = 'open' and l.expires_at <= pg_catalog.now())
       or (l.status = 'reserved' and exists (select 1 from public.market_reservations as r where r.listing_id = l.id and r.status = 'pending' and r.expires_at <= pg_catalog.now()))
    order by l.created_at
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  loop
    perform 1 from public.market_listings as l where l.id = v_row.id for update skip locked;
    if found then
      perform arena_private.market_release_stale(v_row.id);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.market_expire_due(integer) from public, anon, authenticated;
grant execute on function public.market_expire_due(integer) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- SQL TEST PLAN (run after applying; nothing here is run automatically).
--
-- A. Clients cannot touch the market. As a signed-in user (set local role authenticated; select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);):
--      select * from public.market_wallets;  select * from public.market_listings;  select * from public.market_reservations;  select * from public.chain_payments;
--      select * from public.market_sales;  select * from public.market_events;                                                  -> permission denied for every one of them
--      insert into public.market_listings (...) values (...);  update public.market_listings set price_cents = 50;  delete from ...  -> permission denied
--      select public.market_list(...); select public.market_reserve(...); select public.market_record_payment(...); select public.market_wallet_set(...);   -> permission denied for function
--    `select * from public.market_listings_public;` works for anon and authenticated and shows ONLY: id, kind, template_id, rarity, tier, substats, gold_amount, content_hash, price_cents, status,
--    created_at, expires_at. `select seller_address from public.market_listings_public;` -> column does not exist. `select * from arena_private.market_sales_ledger;` -> permission denied.
-- B. A listing. As the service role, with a user U1 that has a linked wallet (market_wallet_set), a held, unbound certificate C1 (item_commit) and no item flags:
--      select public.market_list('<U1>', '<C1>', 1000, 30, 20, 20, 50, 500000);  -> { status: listed }; C1 is now status 'listed', in_save false; one 'list' event; one live listing.
--    Again with the same certificate -> reason already_listed. With price 49 or 500001 -> reason price. After arena_private flag (select public.item_flag_account('<U1>','T','{}')) -> reason flagged.
--    A bound certificate -> reason bound (and `update public.item_certificates set status = 'listed' where bound` is refused by the 0010 guard). Another user's certificate -> not_found.
--    A certificate with in_save = false -> not_in_save. The 21st live listing -> limit_active; the 21st in 24 hours -> limit_day. A user without a wallet -> no_wallet.
-- C. Cancel. select public.market_cancel_listing('<U1>', '<L1>'); -> cancelled, C1 'held' with in_save false, an 'unlist' event. While the listing is reserved -> reserved (nothing changes).
--    Another user's listing -> not_found.
-- D. Reserve. U2 (linked wallet W2, different from W1): select public.market_reserve('<U2>', '<L1>', '<fee address>', 97, false, 5, 30, 120, 10, 3600);
--      -> reserved: price 1000 = fee 50 + seller 950; listing reserved; seller_address = W1. Check fee rounding: a 50 cent listing reserves fee 3, seller 47; a 199 cent listing fee 10, seller 189.
--    A second reserve of the same listing by U3 -> reserved. A second reserve by U2 on another listing -> reservation_exists. The seller reserving his own listing -> own_listing.
--    In two sessions at once, U2 and U3 reserve the same open listing: exactly one gets 'reserved'. A user with no wallet -> no_wallet. The 11th reservation within an hour -> rate_limited.
--    Set expires_at to the past (update public.market_reservations set expires_at = now() - interval '1 minute'): the next reserve by anyone frees it (the old one 'expired', the listing 'open').
-- E. Payments. For a reservation R (buyer U2) with fee 50 / seller 950 cents:
--      select public.market_record_payment('<U2>', '<R>', 'fee', '0x'||repeat('a',64), '<W2>', '<fee address>', 500000000000000000, 1, now());
--        -> { status: recorded, missing: seller }. The same call again -> replayed. The same hash for a different reservation or user -> tx_reused.
--      select public.market_record_payment('<U2>', '<R>', 'seller', '0x'||repeat('b',64), '<W2>', '<W1>', 9500000000000000000, 2, now());
--        -> { status: sold, sale_id, certificate_id }: C1 'transferred' with a 'transfer' event; a NEW certificate for U2 (held, in_save false, origin_certificate_id = C1, same content_hash);
--           one market_sales row (fee_cents 50, seller_cents 950, both hashes, livemode as reserved); listing 'sold'; reservation 'paid'; the seller can no longer see C1... (RLS: it is still his row).
--      A wrong sender / recipient / short amount raises MARKET_PAYMENT_MISMATCH and writes nothing. A 'seller' leg paid twice with two hashes: the second is stored with leg 'extra', status refund_due.
--      Two sessions submitting the SAME two legs at once: exactly one sale, one new certificate, one market_sales row (reservation_id is unique in market_sales).
-- F. Late payments. Reserve, then `update public.market_reservations set expires_at = now() - interval '1 minute'` (grace_until still in the future) with the listing still reserved/open:
--      a valid leg is accepted (late_payment_accepted event) and the sale completes when both are in. If another buyer reserved the listing in between -> { status: refund_due } and the
--      reservation and its payments are refund_due. Past grace_until -> refund_due. Query the queue: select * from public.chain_payments where status = 'refund_due';
-- G. A half-paid reservation that runs past its grace: market_expire_due(50) (or the next reserve of that listing) moves it to refund_due with its payment, and the listing is open again.
-- H. Change of wallet. market_wallet_set for a user with a live listing or a pending reservation -> busy. An address already linked to another user -> address_taken. The same address again -> unchanged.
--    A change writes market_wallet_history. Nonces: market_wallet_take_nonce twice -> the second answers invalid; after expiry -> invalid; another user's nonce -> invalid.
-- I. Delivery. select public.market_deliver_ack('<U2>', array['<new cert>']); -> 1, and again -> 0; an 'deliver' event; another user's id -> 0.
-- J. Mint caps: a certificate that came from a sale (origin_certificate_id not null) is not counted by item_commit's daily cap (bind it with ten transfers and mint: no 'cap').
-- K. The ledger: select * from arena_private.market_sales_ledger; has one row per sale with price/fee/seller in USDT with 2 decimals; sum(fee_usdt) where livemode is the owner's income.
-- L. League reset (needs the trigger of 0010): with an open listing of a certificate created before reset_at, `update arena_private.season_goal set reset_at = now()` cancels the listing and
--    revokes the certificate. A RESERVED listing is left alone.
-- ---------------------------------------------------------------------------------------------------------------------------------------
