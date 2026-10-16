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
--   * arena_private.item_certificates_league_reset   REPLACED again: the League reset also zeroes the material balances of the heroes it replaces.
--
-- NOT APPLIED by the work that wrote this file, and NEVER RUN against a real database: only read by static tests (supabase/functions/_shared/__tests__/migration0015.test.ts). The owner applies it
-- AFTER 0014, in the DEVELOPMENT project first, and runs the SQL TEST PLAN at the end.
--
-- ROLLBACK (by hand, in this order; it deletes every balance, so EXPORT material_balances and material_ledger first if tradeable materials ever had value):
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
-- H. League reset: with balances and a season_goal row, `update arena_private.season_goal set reset_at = now()` zeroes qty and pending of every balance older than reset_at, with 'reset' ledger rows.
-- ---------------------------------------------------------------------------------------------------------------------------------------
