-- Tradeable materials: every material a Hunting, Mining, Woodcutting or Garden claim produces can ALSO exist as a "tradeable" variant, identical in use, that can be sold on the player market
-- (docs/MARKET_FOUNDATION.md, "Materiais negociaveis"). Depends on 0010 (item_take_tokens, the buckets, the flags) and 0011 / 0013 (the market) for part B.
--
-- WHY A BALANCE AND NOT A CERTIFICATE. A certificate is one row per unique item. A material is fungible: 30 000 units of iron are not 30 000 rows. So the server keeps ONE BALANCE per account and
-- material (public.material_balances) plus an append-only ledger of every change (public.material_ledger), like the certificates: the client can read its own rows and can write NOTHING.
-- Only the server creates tradeable units (public.material_credit, called by material-claim after it validated the claim and rolled the dice), and only the server moves them.
--
-- WHAT THIS FILE CREATES
--   * public.material_balances      qty = every tradeable unit the account owns (in the save, or waiting to be collected; NOT the ones in an escrowed listing); pending = the part the save does
--                                    not hold yet (a purchase, a cancelled or expired listing); seq counts the deliveries (so the game's acknowledgement of one is replay-safe).
--   * public.material_ledger        append-only: claim, burn, list, unlist, sale, deliver, reset.
--   * public.material_requests      idempotency: one row per (user, request id), with the answer. A lost response is never a second roll, a second burn or a second acknowledgement.
--   * public.item_take_tokens       REPLACED (same signature as 0010): a take can ask for WHOLE units (`whole`), so the daily cap on tradeable units never keeps a fraction of a unit.
--   * public.material_credit / material_burn / material_ack   service-role-only functions: every change is ONE locked statement.
--   * arena_private.item_certificates_league_reset   REPLACED again: the League reset also zeroes the material balances of the heroes it replaces and cancels their open lots.
--   PART B (lots of materials on the market): market_listings / market_sales learn to hold a lot (material_id, material_qty, unit_price_micro, request_id); market_listings_public shows lots;
--   market_list_material (new), market_cancel_listing, market_record_payment and arena_private.market_release_stale REPLACED so a lot's units go from the seller's balance into escrow, to the buyer
--   (or back to the seller) as a delivery; arena_private.material_deliver (new).
--
-- NOT APPLIED by the work that wrote this file, and NEVER RUN against a real database: only read by static tests (supabase/functions/_shared/__tests__/migration0015.test.ts). The owner applies it
-- AFTER 0014, in the DEVELOPMENT project first, and runs the SQL TEST PLAN at the end.
--
-- ROLLBACK (by hand, in this order; it deletes every balance, so EXPORT material_balances and material_ledger first if tradeable materials ever had value):
--   drop function if exists public.market_list_material(uuid, text, text, integer, bigint, integer, integer, integer, bigint, bigint, integer);
--   drop function if exists arena_private.material_deliver(uuid, text, integer, text, text);
--   (market_cancel_listing, market_record_payment, market_release_stale and market_listings_public / market_sales_ledger: re-run their blocks from 0011 / 0013 after cancelling or returning every open lot;
--    then: drop index if exists public.market_listings_request_unique; alter table public.market_listings drop constraint market_listings_item_check; drop columns material_id, material_qty, unit_price_micro, request_id;
--    alter table public.market_sales drop constraint market_sales_item_check; drop columns material_id, material_qty; restore NOT NULL on certificate_id / new_certificate_id and the 0013 price check.)
--   drop function if exists public.material_ack(uuid, text, jsonb);
--   drop function if exists public.material_burn(uuid, text, jsonb);
--   drop function if exists public.material_credit(uuid, text, jsonb);
--   drop table if exists public.material_requests;
--   drop table if exists public.material_ledger;
--   drop table if exists public.material_balances;
--   drop function if exists arena_private.material_ledger_no_change();
--   -- then restore item_take_tokens and item_certificates_league_reset from 0010 / 0011 (re-run those create-or-replace blocks).

create schema if not exists arena_private;
revoke all on schema arena_private from public, anon, authenticated;
grant usage on schema arena_private to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- item_take_tokens (0010) plus the `whole` option. Everything else is exactly the 0010 function: one advisory lock per user, a bucket per (user, name) refilled with the DATABASE clock,
-- all non-partial takes must fit or nothing is taken, a partial take grants min(cost, tokens).
--   `whole`: true (with partial) grants floor(min(cost, tokens)) and takes only that, so a bucket counted in units never loses a fraction to a claim that got none.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.item_take_tokens(p_user_id uuid, p_start_at timestamptz, p_takes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_take jsonb;
  v_bucket text;
  v_cost double precision;
  v_rate double precision;
  v_capacity double precision;
  v_partial boolean;
  v_whole boolean;
  v_tokens double precision;
  v_updated timestamptz;
  v_found boolean;
  v_granted double precision;
  v_plan jsonb := '[]'::jsonb;
  v_grants jsonb := '[]'::jsonb;
  v_item jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('item_tokens:' || p_user_id::text, 0));

  for v_take in select e.value from pg_catalog.jsonb_array_elements(p_takes) as e loop
    v_bucket := v_take ->> 'bucket';
    v_cost := (v_take ->> 'cost')::double precision;
    v_rate := (v_take ->> 'rate_per_hour')::double precision;
    v_capacity := (v_take ->> 'capacity')::double precision;
    v_partial := coalesce((v_take ->> 'partial')::boolean, false);
    v_whole := coalesce((v_take ->> 'whole')::boolean, false);
    if v_bucket is null or v_cost is null or v_cost < 0 or v_rate is null or v_rate < 0 or v_capacity is null or v_capacity < 0 then
      raise exception using errcode = '22023', message = 'ITEM_TAKE_BAD_ARGUMENT';
    end if;

    select b.tokens, b.updated_at, true into v_tokens, v_updated, v_found
    from arena_private.item_buckets as b
    where b.user_id = p_user_id and b.bucket = v_bucket
    for update;

    if v_found is not true or v_updated < p_start_at then
      v_tokens := least(v_capacity, v_rate * greatest(0, pg_catalog.date_part('epoch', v_now - p_start_at) / 3600.0));
    else
      v_tokens := least(v_capacity, v_tokens + v_rate * greatest(0, pg_catalog.date_part('epoch', v_now - v_updated) / 3600.0));
    end if;
    v_found := null;

    if v_partial then
      v_granted := least(v_cost, v_tokens);
      if v_whole then
        v_granted := pg_catalog.floor(v_granted);
      end if;
    elsif v_tokens >= v_cost then
      v_granted := v_cost;
    else
      return pg_catalog.jsonb_build_object('ok', false, 'failed', v_bucket);
    end if;
    v_plan := v_plan || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('bucket', v_bucket, 'left', v_tokens - v_granted));
    v_grants := v_grants || pg_catalog.jsonb_build_array(v_granted);
  end loop;

  for v_item in select e.value from pg_catalog.jsonb_array_elements(v_plan) as e loop
    insert into arena_private.item_buckets as b (user_id, bucket, tokens, updated_at)
    values (p_user_id, v_item ->> 'bucket', (v_item ->> 'left')::double precision, v_now)
    on conflict (user_id, bucket) do update set tokens = excluded.tokens, updated_at = excluded.updated_at;
  end loop;

  return pg_catalog.jsonb_build_object('ok', true, 'granted', v_grants);
end;
$$;

revoke all on function public.item_take_tokens(uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.item_take_tokens(uuid, timestamptz, jsonb) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The balance
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists public.material_balances (
  user_id uuid not null references auth.users (id) on delete cascade,
  material_id text not null,
  -- every tradeable unit the account owns, except the ones escrowed in a market listing
  qty integer not null default 0,
  -- the part of qty the save does not hold yet (bought, or returned by a cancelled / expired listing): the game adds it to the save and acknowledges it
  pending integer not null default 0,
  -- how many deliveries ever raised pending: the game's acknowledgement is keyed by it, so a lost answer retried later never acknowledges a NEWER delivery
  seq integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, material_id),
  constraint material_balances_id_check check (material_id ~ '^[a-z][a-z_]{1,39}$'),
  constraint material_balances_qty_check check (qty >= 0 and qty <= 100000000),
  constraint material_balances_pending_check check (pending >= 0 and pending <= qty)
);

alter table public.material_balances enable row level security;
-- Clients: SELECT of their own rows only. No insert, no update, no delete: only the Edge Functions (service role) write.
revoke all on table public.material_balances from public, anon, authenticated;
grant select on table public.material_balances to authenticated;
grant select, insert, update on table public.material_balances to service_role;

drop policy if exists material_balances_select_own on public.material_balances;
create policy material_balances_select_own
  on public.material_balances
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The ledger (append-only): every change of a balance, with the balance after it.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists public.material_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  material_id text not null,
  -- the change of qty (negative for a burn or a listing)
  delta integer not null,
  -- the change of pending
  pending_delta integer not null default 0,
  qty_after integer not null,
  reason text not null,
  -- the request id / listing id / sale id that caused it
  ref text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint material_ledger_reason_check check (reason in ('claim', 'burn', 'list', 'unlist', 'sale', 'deliver', 'reset'))
);

create index if not exists material_ledger_user_idx on public.material_ledger (user_id, id desc);

create or replace function arena_private.material_ledger_no_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'MATERIAL_LEDGER_APPEND_ONLY';
end;
$$;

revoke all on function arena_private.material_ledger_no_change() from public, anon, authenticated;

drop trigger if exists material_ledger_no_update on public.material_ledger;
create trigger material_ledger_no_update
  before update on public.material_ledger
  for each row
  execute function arena_private.material_ledger_no_change();

alter table public.material_ledger enable row level security;
revoke all on table public.material_ledger from public, anon, authenticated;
grant select on table public.material_ledger to authenticated;
grant select, insert on table public.material_ledger to service_role;

drop policy if exists material_ledger_select_own on public.material_ledger;
create policy material_ledger_select_own
  on public.material_ledger
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Idempotency: one row per (user, request id) with the answer. The same request id always gets the same answer.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists public.material_requests (
  user_id uuid not null references auth.users (id) on delete cascade,
  request_id text not null,
  kind text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id),
  constraint material_requests_kind_check check (kind in ('claim', 'burn', 'ack', 'list'))
);

alter table public.material_requests enable row level security;
revoke all on table public.material_requests from public, anon, authenticated;
grant select, insert on table public.material_requests to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- public.material_credit: the tradeable units a validated claim was granted. ONE locked statement, and idempotent: a request id already used changes nothing.
--   p_credits   { "<material id>": <whole units>, ... }, units only from a claim the server rolled (material-claim). The same per-user lock as the market's listing and the certificates.
--   Returns { "status": "created" } or { "status": "replay" }.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.material_credit(p_user_id uuid, p_request_id text, p_credits jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_n integer;
  v_qty integer;
begin
  if p_request_id is null or p_request_id !~ '^[A-Za-z0-9_.:-]{8,64}$' or p_credits is null or pg_catalog.jsonb_typeof(p_credits) <> 'object' then
    raise exception using errcode = '22023', message = 'MATERIAL_CREDIT_BAD_ARGUMENT';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('item_commit:' || p_user_id::text, 0));

  if exists (select 1 from public.material_requests as r where r.user_id = p_user_id and r.request_id = p_request_id) then
    return pg_catalog.jsonb_build_object('status', 'replay');
  end if;

  for v_item in select e.key as material_id, e.value as amount from pg_catalog.jsonb_each(p_credits) as e loop
    v_n := (v_item.amount #>> '{}')::integer;
    if v_n is null or v_n < 0 or v_n > 100000 then
      raise exception using errcode = '22023', message = 'MATERIAL_CREDIT_BAD_ARGUMENT';
    end if;
    if v_n = 0 then
      continue;
    end if;
    insert into public.material_balances as b (user_id, material_id, qty)
    values (p_user_id, v_item.material_id, v_n)
    on conflict (user_id, material_id) do update set qty = b.qty + excluded.qty, updated_at = pg_catalog.now()
    returning b.qty into v_qty;
    insert into public.material_ledger (user_id, material_id, delta, pending_delta, qty_after, reason, ref)
    values (p_user_id, v_item.material_id, v_n, 0, v_qty, 'claim', p_request_id);
  end loop;

  insert into public.material_requests (user_id, request_id, kind, result)
  values (p_user_id, p_request_id, 'claim', pg_catalog.jsonb_build_object('tradeable', p_credits));
  return pg_catalog.jsonb_build_object('status', 'created');
end;
$$;

revoke all on function public.material_credit(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.material_credit(uuid, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- public.material_burn: the game spent (or threw away, or sold to a merchant) tradeable units. Lowers qty by what was spent, NEVER below zero, and pending never exceeds qty. Idempotent.
--   p_units   { "<material id>": <whole units>, ... } (batched: one call can carry many materials)
--   Returns { "status": "burned", "applied": { "<material id>": <units really taken> } } or { "status": "replay", "applied": ... }.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.material_burn(p_user_id uuid, p_request_id text, p_units jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_ask integer;
  v_qty integer;
  v_take integer;
  v_old jsonb;
  v_applied jsonb := '{}'::jsonb;
begin
  if p_request_id is null or p_request_id !~ '^[A-Za-z0-9_.:-]{8,64}$' or p_units is null or pg_catalog.jsonb_typeof(p_units) <> 'object' then
    raise exception using errcode = '22023', message = 'MATERIAL_BURN_BAD_ARGUMENT';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('item_commit:' || p_user_id::text, 0));

  select r.result into v_old from public.material_requests as r where r.user_id = p_user_id and r.request_id = p_request_id;
  if found then
    return pg_catalog.jsonb_build_object('status', 'replay', 'applied', coalesce(v_old -> 'applied', '{}'::jsonb));
  end if;

  for v_item in select e.key as material_id, e.value as amount from pg_catalog.jsonb_each(p_units) as e loop
    v_ask := (v_item.amount #>> '{}')::integer;
    if v_ask is null or v_ask < 0 or v_ask > 100000000 then
      raise exception using errcode = '22023', message = 'MATERIAL_BURN_BAD_ARGUMENT';
    end if;
    select b.qty into v_qty from public.material_balances as b where b.user_id = p_user_id and b.material_id = v_item.material_id for update;
    if not found then
      v_take := 0;
    else
      v_take := least(v_ask, v_qty);
    end if;
    if v_take > 0 then
      update public.material_balances as b
      set qty = b.qty - v_take, pending = least(b.pending, b.qty - v_take), updated_at = pg_catalog.now()
      where b.user_id = p_user_id and b.material_id = v_item.material_id
      returning b.qty into v_qty;
      insert into public.material_ledger (user_id, material_id, delta, pending_delta, qty_after, reason, ref, detail)
      values (p_user_id, v_item.material_id, -v_take, 0, v_qty, 'burn', p_request_id, pg_catalog.jsonb_build_object('asked', v_ask));
    end if;
    v_applied := v_applied || pg_catalog.jsonb_build_object(v_item.material_id, v_take);
  end loop;

  insert into public.material_requests (user_id, request_id, kind, result)
  values (p_user_id, p_request_id, 'burn', pg_catalog.jsonb_build_object('applied', v_applied));
  return pg_catalog.jsonb_build_object('status', 'burned', 'applied', v_applied);
end;
$$;

revoke all on function public.material_burn(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.material_burn(uuid, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- public.material_ack: the game put delivered units (a purchase, a cancelled or expired listing) into its save. Lowers pending by that much, never below zero. Idempotent.
--   Returns { "status": "acked", "applied": { ... } } or { "status": "replay", "applied": ... }.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.material_ack(p_user_id uuid, p_request_id text, p_units jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_ask integer;
  v_pending integer;
  v_qty integer;
  v_take integer;
  v_old jsonb;
  v_applied jsonb := '{}'::jsonb;
begin
  if p_request_id is null or p_request_id !~ '^[A-Za-z0-9_.:-]{8,64}$' or p_units is null or pg_catalog.jsonb_typeof(p_units) <> 'object' then
    raise exception using errcode = '22023', message = 'MATERIAL_ACK_BAD_ARGUMENT';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('item_commit:' || p_user_id::text, 0));

  select r.result into v_old from public.material_requests as r where r.user_id = p_user_id and r.request_id = p_request_id;
  if found then
    return pg_catalog.jsonb_build_object('status', 'replay', 'applied', coalesce(v_old -> 'applied', '{}'::jsonb));
  end if;

  for v_item in select e.key as material_id, e.value as amount from pg_catalog.jsonb_each(p_units) as e loop
    v_ask := (v_item.amount #>> '{}')::integer;
    if v_ask is null or v_ask < 0 or v_ask > 100000000 then
      raise exception using errcode = '22023', message = 'MATERIAL_ACK_BAD_ARGUMENT';
    end if;
    select b.pending into v_pending from public.material_balances as b where b.user_id = p_user_id and b.material_id = v_item.material_id for update;
    if not found then
      v_take := 0;
    else
      v_take := least(v_ask, v_pending);
    end if;
    if v_take > 0 then
      update public.material_balances as b
      set pending = b.pending - v_take, updated_at = pg_catalog.now()
      where b.user_id = p_user_id and b.material_id = v_item.material_id
      returning b.qty into v_qty;
      insert into public.material_ledger (user_id, material_id, delta, pending_delta, qty_after, reason, ref)
      values (p_user_id, v_item.material_id, 0, -v_take, v_qty, 'deliver', p_request_id);
    end if;
    v_applied := v_applied || pg_catalog.jsonb_build_object(v_item.material_id, v_take);
  end loop;

  insert into public.material_requests (user_id, request_id, kind, result)
  values (p_user_id, p_request_id, 'ack', pg_catalog.jsonb_build_object('applied', v_applied));
  return pg_catalog.jsonb_build_object('status', 'acked', 'applied', v_applied);
end;
$$;

revoke all on function public.material_ack(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.material_ack(uuid, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The League reset (0010 / 0011) also empties the material balances of the heroes it replaces: the units belonged to a hero that no longer exists.
-- ---------------------------------------------------------------------------------------------------------------------------------------
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

    -- the open lots of the replaced heroes are cancelled and their escrow is dropped (the units belonged to heroes that no longer exist); a RESERVED lot is left alone, like a reserved item
    update public.market_listings as l set status = 'cancelled', closed_at = pg_catalog.now()
    where l.material_id is not null and l.status = 'open' and l.created_at < new.reset_at;

    insert into public.material_ledger (user_id, material_id, delta, pending_delta, qty_after, reason, ref)
    select b.user_id, b.material_id, -b.qty, -b.pending, 0, 'reset', 'league_reset'
    from public.material_balances as b
    where (b.qty > 0 or b.pending > 0) and b.updated_at < new.reset_at;
    update public.material_balances as b set qty = 0, pending = 0, seq = b.seq + 1, updated_at = pg_catalog.now()
    where (b.qty > 0 or b.pending > 0) and b.updated_at < new.reset_at;
  end if;
  return new;
end;
$$;

revoke all on function arena_private.item_certificates_league_reset() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- PART B: LOTS OF MATERIALS ON THE MARKET
--
-- A listing is now EITHER a certificate (items, Gold Pouches: 0011 / 0013) OR a lot of one material: material_id, material_qty, unit_price_micro (the price of ONE unit in micro-SOL, up to 6
-- decimals) and the whole lot's price in lamports (unit x quantity x 1,000). A lot is bought WHOLE: the reservation, the payment verification and the sale are the same machinery as for an item
-- (one reservation per listing, one transaction with the seller's share and the game's fee); only the delivery differs. There are no partial buys: a seller who wants to sell 1,000 units in
-- pieces lists several lots (20 live listings, 20 a day, like any other listing).
--
--   * listing a lot moves its units from the seller's balance into the listing (escrow): qty goes down, and the units are no longer his;
--   * a purchase delivers the units to the buyer's balance as PENDING (the game adds them to the save and acknowledges, material_ack), exactly like a bought item waits for its certificate to be collected;
--   * a cancelled or expired lot returns its units to the seller the same way (pending);
--   * the League reset cancels the open lots of the heroes it replaces and drops their escrow (the units belonged to heroes that no longer exist).
-- ---------------------------------------------------------------------------------------------------------------------------------------
alter table public.market_listings alter column certificate_id drop not null;
alter table public.market_listings add column if not exists material_id text;
alter table public.market_listings add column if not exists material_qty integer;
alter table public.market_listings add column if not exists unit_price_micro bigint;
-- the seller's own request id for a lot: a retry of the same listing returns the same listing (a lost answer never lists twice)
alter table public.market_listings add column if not exists request_id text;

alter table public.market_listings drop constraint if exists market_listings_item_check;
alter table public.market_listings
  add constraint market_listings_item_check check (
    (certificate_id is not null and material_id is null and material_qty is null and unit_price_micro is null)
    or (certificate_id is null and material_id ~ '^[a-z][a-z_]{1,39}$' and material_qty between 1 and 100000 and unit_price_micro >= 1 and price_lamports = unit_price_micro * material_qty * 1000)
  );

-- an item still moves in 0.001 SOL steps; a lot only has to be a whole number of micro-SOL (its unit price has up to 6 decimals)
alter table public.market_listings drop constraint if exists market_listings_price_check;
alter table public.market_listings
  add constraint market_listings_price_check check (
    price_lamports between 1000000 and 1000000000000 and (price_lamports % 1000000 = 0 or (material_id is not null and price_lamports % 1000 = 0))
  );

create unique index if not exists market_listings_request_unique on public.market_listings (seller_id, request_id) where request_id is not null;

alter table public.market_sales alter column certificate_id drop not null;
alter table public.market_sales alter column new_certificate_id drop not null;
alter table public.market_sales add column if not exists material_id text;
alter table public.market_sales add column if not exists material_qty integer;
alter table public.market_sales drop constraint if exists market_sales_item_check;
alter table public.market_sales
  add constraint market_sales_item_check check (
    (certificate_id is not null and new_certificate_id is not null and material_id is null and material_qty is null)
    or (certificate_id is null and new_certificate_id is null and material_id is not null and material_qty > 0)
  );

-- The public face of the market: the listed item (read from its certificate) or the lot of materials, and its price in lamports. NOT the seller, NOT any wallet address, NOT the certificate id.
-- The first twelve columns are exactly 0013's; the two new ones are at the end (a lot of materials: how many, and the price of one unit in micro-SOL).
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
  l.expires_at,
  null::integer as material_qty,
  null::bigint as unit_price_micro
from public.market_listings as l
join public.item_certificates as c on c.id = l.certificate_id
where l.status in ('open', 'reserved') and l.expires_at > pg_catalog.now()
union all
select
  l.id,
  'material'::text,
  l.material_id,
  null::text,
  null::integer,
  '[]'::jsonb,
  null::integer,
  null::text,
  l.price_lamports,
  l.status,
  l.created_at,
  l.expires_at,
  l.material_qty,
  l.unit_price_micro
from public.market_listings as l
where l.material_id is not null and l.status in ('open', 'reserved') and l.expires_at > pg_catalog.now();

revoke all on table public.market_listings_public from public, anon, authenticated;
grant select on table public.market_listings_public to anon, authenticated, service_role;

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
  s.buyer_id,
  s.material_qty
from public.market_sales as s;

revoke all on table arena_private.market_sales_ledger from public, anon, authenticated;
grant select on table arena_private.market_sales_ledger to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- arena_private.material_deliver: units that reach an account's balance as a DELIVERY (a purchase, a cancelled or expired lot): qty and pending go up together and seq counts the delivery.
-- The caller holds the listing row lock; the balance row is locked by the upsert.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function arena_private.material_deliver(p_user_id uuid, p_material_id text, p_qty integer, p_reason text, p_ref text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_qty integer;
begin
  if p_qty is null or p_qty < 1 then
    raise exception using errcode = '22023', message = 'MATERIAL_DELIVER_BAD_ARGUMENT';
  end if;
  insert into public.material_balances as b (user_id, material_id, qty, pending, seq)
  values (p_user_id, p_material_id, p_qty, p_qty, 1)
  on conflict (user_id, material_id) do update set qty = b.qty + excluded.qty, pending = b.pending + excluded.pending, seq = b.seq + 1, updated_at = pg_catalog.now()
  returning b.qty into v_qty;
  insert into public.material_ledger (user_id, material_id, delta, pending_delta, qty_after, reason, ref)
  values (p_user_id, p_material_id, p_qty, p_qty, v_qty, p_reason, p_ref);
end;
$$;

revoke all on function arena_private.material_deliver(uuid, text, integer, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- market_release_stale (0011) with the lots of materials: an open listing past its expiry returns its certificate to the owner, or its units to the seller's balance (as a delivery).
-- The CALLER HOLDS THE LISTING ROW LOCK.
-- ---------------------------------------------------------------------------------------------------------------------------------------
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
    if v_listing.material_id is not null then
      perform arena_private.material_deliver(v_listing.seller_id, v_listing.material_id, v_listing.material_qty, 'unlist', p_listing_id::text);
    else
      insert into public.item_certificate_events (certificate_id, user_id, event, detail)
      select c.id, c.user_id, 'unlist', pg_catalog.jsonb_build_object('reason', 'expired', 'listing_id', p_listing_id)
      from public.item_certificates as c where c.id = v_listing.certificate_id and c.status = 'listed';
      update public.item_certificates as c set status = 'held' where c.id = v_listing.certificate_id and c.status = 'listed';
    end if;
    perform arena_private.market_log('listing_expired', v_listing.seller_id, p_listing_id, null, '{}'::jsonb);
  end if;
end;
$$;

revoke all on function arena_private.market_release_stale(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- public.market_list_material: lists a LOT of one tradeable material.
--   Under the seller's lock (the same one the certificates use). Idempotent by (seller, request id): a retry returns the same listing and moves nothing twice.
--   Refusals (the same names as market_list, plus not_enough): price (the unit price or the lot's total is out of bounds), no_wallet, flagged, not_enough (the balance that is IN THE SAVE, qty - pending,
--   does not cover the quantity), limit_active, limit_day. The quantity is limited by p_max_qty (the rules.ts number).
--   Returns { "status": "listed", "listing_id", "expires_at" } or { "status": "refused", "reason" }.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.market_list_material(
  p_user_id uuid,
  p_request_id text,
  p_material_id text,
  p_qty integer,
  p_unit_price_micro bigint,
  p_ttl_days integer,
  p_max_active integer,
  p_max_per_day integer,
  p_min_lamports bigint,
  p_max_lamports bigint,
  p_max_qty integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_address text;
  v_old public.market_listings%rowtype;
  v_bal public.material_balances%rowtype;
  v_total bigint;
  v_active integer;
  v_today integer;
  v_listing_id uuid;
  v_expires timestamptz;
begin
  if p_request_id is null or p_request_id !~ '^[A-Za-z0-9_.:-]{8,64}$' or p_material_id is null or p_material_id !~ '^[a-z][a-z_]{1,39}$'
     or p_qty is null or p_qty < 1 or p_qty > p_max_qty or p_unit_price_micro is null or p_unit_price_micro < 1 then
    raise exception using errcode = '22023', message = 'MARKET_LIST_MATERIAL_BAD_ARGUMENT';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('item_commit:' || p_user_id::text, 0));

  select * into v_old from public.market_listings as l where l.seller_id = p_user_id and l.request_id = p_request_id;
  if found then
    return pg_catalog.jsonb_build_object('status', 'listed', 'listing_id', v_old.id, 'expires_at', v_old.expires_at);
  end if;

  v_total := p_unit_price_micro * p_qty * 1000;
  if v_total < p_min_lamports or v_total > p_max_lamports then
    return pg_catalog.jsonb_build_object('status', 'refused', 'reason', 'price');
  end if;
  select w.address into v_address from public.market_wallets as w where w.user_id = p_user_id;
  if v_address is null then
    return pg_catalog.jsonb_build_object('status', 'refused', 'reason', 'no_wallet');
  end if;
  if arena_private.has_item_flags(p_user_id) then
    return pg_catalog.jsonb_build_object('status', 'refused', 'reason', 'flagged');
  end if;

  select * into v_bal from public.material_balances as b where b.user_id = p_user_id and b.material_id = p_material_id for update;
  if not found or v_bal.qty - v_bal.pending < p_qty then
    return pg_catalog.jsonb_build_object('status', 'refused', 'reason', 'not_enough');
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
  -- the escrow: the units leave the balance (pending never exceeds qty: qty - pending >= p_qty was just checked)
  update public.material_balances as b set qty = b.qty - p_qty, updated_at = pg_catalog.now() where b.user_id = p_user_id and b.material_id = p_material_id;
  insert into public.market_listings (certificate_id, material_id, material_qty, unit_price_micro, request_id, seller_id, seller_address, price_lamports, expires_at)
  values (null, p_material_id, p_qty, p_unit_price_micro, p_request_id, p_user_id, v_address, v_total, v_expires)
  returning id into v_listing_id;
  insert into public.material_ledger (user_id, material_id, delta, pending_delta, qty_after, reason, ref, detail)
  values (p_user_id, p_material_id, -p_qty, 0, v_bal.qty - p_qty, 'list', v_listing_id::text, pg_catalog.jsonb_build_object('unit_price_micro', p_unit_price_micro));
  perform arena_private.market_log('listed', p_user_id, v_listing_id, null, pg_catalog.jsonb_build_object('price_lamports', v_total, 'material_id', p_material_id, 'material_qty', p_qty, 'unit_price_micro', p_unit_price_micro));
  return pg_catalog.jsonb_build_object('status', 'listed', 'listing_id', v_listing_id, 'expires_at', v_expires);
end;
$$;

revoke all on function public.market_list_material(uuid, text, text, integer, bigint, integer, integer, integer, bigint, bigint, integer) from public, anon, authenticated;
grant execute on function public.market_list_material(uuid, text, text, integer, bigint, integer, integer, integer, bigint, bigint, integer) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- market_cancel_listing (0011) with the lots: a cancelled lot returns its units to the seller's balance as a delivery (pending, for the game to collect).
-- ---------------------------------------------------------------------------------------------------------------------------------------
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
  perform arena_private.market_log('listing_cancelled', p_user_id, p_listing_id, null, '{}'::jsonb);
  if v_listing.material_id is not null then
    perform arena_private.material_deliver(p_user_id, v_listing.material_id, v_listing.material_qty, 'unlist', p_listing_id::text);
    return pg_catalog.jsonb_build_object('status', 'cancelled', 'material_id', v_listing.material_id, 'material_qty', v_listing.material_qty);
  end if;
  insert into public.item_certificate_events (certificate_id, user_id, event, detail)
  values (v_listing.certificate_id, p_user_id, 'unlist', pg_catalog.jsonb_build_object('reason', 'cancelled', 'listing_id', p_listing_id));
  update public.item_certificates as c set status = 'held' where c.id = v_listing.certificate_id and c.status = 'listed';
  return pg_catalog.jsonb_build_object('status', 'cancelled', 'certificate_id', v_listing.certificate_id);
end;
$$;

revoke all on function public.market_cancel_listing(uuid, uuid) from public, anon, authenticated;
grant execute on function public.market_cancel_listing(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- market_record_payment (0013) with the lots: once the payment is in, a lot's units are delivered to the BUYER's balance (pending) instead of a new certificate being issued. Everything before step 5
-- (the numbers, the signature consumed first, extra payments, late payments, refund_due) is exactly 0013's.
-- ---------------------------------------------------------------------------------------------------------------------------------------
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
  v_sale_id := gen_random_uuid();
  if v_listing.material_id is not null then
    -- a LOT of materials: the buyer gets the whole lot as a delivery on his balance (pending), the ledger records the sale, the units were already out of the seller's balance (the escrow)
    if v_listing.status not in ('open', 'reserved') then
      raise exception using errcode = 'P0001', message = 'MARKET_LOT_NOT_LISTED';
    end if;
    perform arena_private.material_deliver(p_buyer_id, v_listing.material_id, v_listing.material_qty, 'sale', v_sale_id::text);
    insert into public.market_sales (id, listing_id, reservation_id, certificate_id, new_certificate_id, seller_id, buyer_id, seller_address, buyer_address, fee_address, item_kind, item_template, material_id, material_qty,
                                     price_lamports, fee_lamports, seller_lamports, tx_signature, chain_id, livemode)
    values (v_sale_id, v_listing.id, v_res.id, null, null, v_listing.seller_id, p_buyer_id, v_res.seller_address, v_res.buyer_address, v_res.fee_address, 'material', v_listing.material_id, v_listing.material_id, v_listing.material_qty,
            v_res.price_lamports, v_res.fee_lamports, v_res.seller_lamports, p_tx_hash, v_res.chain_id, v_res.livemode);
    update public.market_listings as l set status = 'sold', closed_at = pg_catalog.now() where l.id = v_listing.id;
    update public.market_reservations as r set status = 'paid', closed_at = pg_catalog.now() where r.id = v_res.id;
    perform arena_private.market_log('sold', p_buyer_id, v_listing.id, v_res.id, pg_catalog.jsonb_build_object('sale_id', v_sale_id, 'price_lamports', v_res.price_lamports, 'fee_lamports', v_res.fee_lamports, 'material_id', v_listing.material_id, 'material_qty', v_listing.material_qty));
    return pg_catalog.jsonb_build_object('status', 'sold', 'sale_id', v_sale_id, 'material_id', v_listing.material_id, 'material_qty', v_listing.material_qty);
  end if;

  select * into v_cert from public.item_certificates as c where c.id = v_listing.certificate_id for update;
  if not found or v_cert.status <> 'listed' then
    raise exception using errcode = 'P0001', message = 'MARKET_CERTIFICATE_NOT_LISTED';
  end if;

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
-- SQL TEST PLAN (run after applying; nothing here is run automatically).
--
-- A. Clients cannot write. As a signed-in user (set local role authenticated; select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);):
--      select * from public.material_balances;  select * from public.material_ledger;     -> ONLY the user's own rows
--      select * from public.material_requests;                                              -> permission denied
--      insert into public.material_balances (user_id, material_id, qty) values ('<uuid>', 'iron', 99);  update public.material_balances set qty = 99;  delete from ...   -> permission denied
--      select public.material_credit('<uuid>', 'req-00000001', '{"iron": 5}');  (and material_burn, material_ack)    -> permission denied for function
-- B. Credit. As the service role, for a user U1:
--      select public.material_credit('<U1>', 'claim:hunt:1', '{"iron": 3, "copper": 1}');  -> { status: created }; two balance rows (qty 3 and 1, pending 0); two 'claim' ledger rows; one request row.
--      The same call again -> { status: replay }, nothing changes. '{"iron": -1}' or '{"iron": 100001}' -> MATERIAL_CREDIT_BAD_ARGUMENT, nothing written (the whole call rolls back).
--      A request id shorter than 8 characters -> MATERIAL_CREDIT_BAD_ARGUMENT. A material id with capital letters -> the balance table's id check fails.
-- C. Burn. select public.material_burn('<U1>', 'burn:1:aaaa', '{"iron": 2, "gold_ore": 5}');
--      -> { status: burned, applied: { iron: 2, gold_ore: 0 } } (a material with no balance burns 0); iron qty 1; a 'burn' ledger row for iron only.
--      Burn more than owned: '{"iron": 10}' -> applied iron 1, qty 0 (never negative). Again with the same id -> replay with the SAME applied. pending never exceeds qty after a burn.
-- D. Ack. Set a delivery by hand: update public.material_balances set qty = 5, pending = 3, seq = 1 where user_id = '<U1>' and material_id = 'iron';
--      select public.material_ack('<U1>', 'ack:iron:1', '{"iron": 2}'); -> pending 1. Ask for 9 -> pending 0 (never negative). The same id again -> replay.
-- E. Two sessions at once: material_credit with the SAME request id from two connections -> exactly one 'created', one 'replay' (the per-user advisory lock serialises them), one request row.
-- F. The ledger is append-only: update public.material_ledger set delta = 0;  (as the service role) -> MATERIAL_LEDGER_APPEND_ONLY. (A delete is allowed only so that deleting an account can cascade.)
-- G. item_take_tokens with whole: select public.item_take_tokens('<U1>', now() - interval '1 hour', '[{"bucket":"mat_day_iron","cost":5,"rate_per_hour":0.25,"capacity":3,"partial":true,"whole":true}]');
--      -> { ok: true, granted: [0] } (0.25 token is not a unit) and the bucket still holds 0.25; an hour later the same call with cost 1 grants [1] when the bucket reached 1.
--      Without "whole" the same call grants the fraction (the 0010 behaviour). A non-partial take that does not fit still returns { ok: false, failed: "<bucket>" } and takes nothing.
-- H. League reset: with balances and a season_goal row, `update arena_private.season_goal set reset_at = now()` zeroes qty and pending of every balance older than reset_at, with 'reset' ledger rows,
--    and cancels the OPEN lots created before it (their escrow is not returned); a reserved lot is left alone.
-- I. A lot. U1 has a linked wallet and a balance of 50 iron (material_credit), pending 0:
--      select public.market_list_material('<U1>', 'lot:iron:0001', 'iron', 20, 2500, 30, 20, 20, 1000000, 50000000000, 10000);
--        -> { status: listed }; the lot is 20 x 2,500 micro-SOL = 50,000,000 lamports (0.05 SOL); iron qty 30; a 'list' ledger row (-20); one live listing with certificate_id null, material_id 'iron', material_qty 20.
--      The same call again (same request id) -> the SAME listing_id, nothing moved twice. A 21st lot in 24 hours -> limit_day. 30 more than he owns (qty - pending) -> not_enough. A unit price of 0 or a total under
--      0.001 SOL (1,000,000 lamports) or over 50 SOL -> price. No wallet -> no_wallet. A flagged account -> flagged. A lot of more than p_max_qty -> MARKET_LIST_MATERIAL_BAD_ARGUMENT.
--      Units that are pending (delivered, not in the save yet) cannot be listed: with qty 10 and pending 10, listing 1 -> not_enough.
-- J. Browse. `select * from public.market_listings_public;` shows the lot with kind 'material', template_id 'iron', material_qty 20, unit_price_micro 2500 and NO seller; items still show their columns (material_qty null).
-- K. Cancel. select public.market_cancel_listing('<U1>', '<L>'); -> { status: cancelled, material_id: iron, material_qty: 20 }; iron qty 50 again, pending 20, seq +1; an 'unlist' ledger row. A reserved lot -> reserved.
-- L. Buy a lot. U2 (linked wallet) reserves the lot (market_reserve: price 50,000,000 = fee 2,500,000 + seller 47,500,000), then market_record_payment with the two transfers' total:
--      -> { status: sold, sale_id, material_id: iron, material_qty: 20 }; U2's iron balance qty 20, pending 20, seq 1 (a 'sale' ledger row); one market_sales row with certificate_id null, material_id, material_qty 20,
--      price/fee/seller in lamports; the listing 'sold', the reservation 'paid'. U1's balance is unchanged (the escrow already took the units). No certificate was created.
--      The game then acknowledges: select public.material_ack('<U2>', 'ack:xxxxxxxx', '{"iron": 20}'); -> pending 0.
-- M. Expiry. update public.market_listings set expires_at = now() - interval '1 minute' where id = '<L>' (an open lot); the next market_expire_due(50) or any read of it -> 'expired' and the units return to U1 as a delivery.
-- N. Constraints. insert a listing with both a certificate_id and a material_id, or with neither, or with price_lamports <> unit_price_micro x material_qty x 1000 -> check violation. An item listing with a price that is
--    not a multiple of 1,000,000 lamports -> check violation (the 0.001 SOL step still holds for items).
-- ---------------------------------------------------------------------------------------------------------------------------------------
