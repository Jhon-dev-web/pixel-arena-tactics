-- Gold Pouch price floor (owner decision 2026-10-22). Depends on 0010 (item_certificates), 0013 (market_list in lamports). NOT APPLIED from this repo: the owner runs it (SQL editor or `supabase db push`),
-- in the DEVELOPMENT project first. It is run for real by admin/tests/sql/pouchfloor.integration.test.ts (an in-memory Postgres).
--
-- THE RULE. A Gold Pouch cannot be listed below US$ 0.25 per 1,000 Gold of face value (small 2,000 = US$ 0.50, medium 5,000 = US$ 1.25, large 20,000 = US$ 5.00; the old faces 10,000 / 50,000 / 100,000 follow the
-- same per-1,000 rule from the certificate's gold_amount). Above the floor the price is free. The market charges in SOL, so the Edge Function (market-list) reads the SERVER's USD per SOL (the same cached
-- read as the "about US$" line) and passes both numbers in; this function turns them into lamports and refuses a pouch listed below the floor. Items and material lots keep the general minimum (0.001 SOL).
--
-- THE SUM (identical to pouchFloorLamports in supabase/functions/_shared/chain/solMoney.ts): steps = ceil(gold_amount x p_pouch_floor_usd_micro / p_sol_usd_micro) price steps of 0.001 SOL, so the floor
-- is ROUNDED UP to the step and is never under its dollar value; never below p_min_lamports. Integer (numeric) math only.
--
-- WHAT THIS FILE DOES. Replaces public.market_list (the 8-argument version of 0013) by a 10-argument one: two NEW trailing arguments with DEFAULT NULL,
--     p_pouch_floor_usd_micro bigint  the floor in micro-dollars per 1,000 Gold (250000 = US$ 0.25). NULL = no pouch floor (a caller that predates this file keeps the old behaviour).
--     p_sol_usd_micro            bigint  micro-dollars per SOL (150200000 = US$ 150.20), or NULL when the server has no usable price.
--   For a certificate of kind 'gold_pouch' with the floor on:
--     no usable SOL price                    -> { status: 'refused', reason: 'pouch_rate_unavailable' }  (retryable: nothing was changed)
--     p_price_lamports below the floor       -> { status: 'refused', reason: 'below_pouch_floor', floor_lamports }
--   Every other refusal, the escrow, the log and the answers are exactly those of 0013. The old 8-argument function is dropped (a call with 8 arguments still resolves, to the new function).
--
-- ROLLBACK (by hand): drop function if exists public.market_list(uuid, uuid, bigint, integer, integer, integer, bigint, bigint, bigint, bigint); then run the market_list block of
--   supabase/migrations/0013_solana.sql again (create or replace function public.market_list(...) plus its revoke / grant). Nothing else depends on the new signature.

drop function if exists public.market_list(uuid, uuid, bigint, integer, integer, integer, bigint, bigint);

create or replace function public.market_list(
  p_user_id uuid,
  p_certificate_id uuid,
  p_price_lamports bigint,
  p_ttl_days integer,
  p_max_active integer,
  p_max_per_day integer,
  p_min_lamports bigint,
  p_max_lamports bigint,
  p_pouch_floor_usd_micro bigint default null,
  p_sol_usd_micro bigint default null
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
  v_floor bigint;
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

  -- The Gold Pouch floor: US$ per 1,000 Gold of the certificate's face value, converted at the server's SOL price, rounded UP to the 0.001 SOL step.
  if v_cert.kind = 'gold_pouch' and p_pouch_floor_usd_micro is not null then
    if p_sol_usd_micro is null or p_sol_usd_micro < 1 then
      return pg_catalog.jsonb_build_object('status', 'refused', 'reason', 'pouch_rate_unavailable');
    end if;
    v_floor := greatest(
      p_min_lamports,
      pg_catalog.ceil((v_cert.gold_amount::numeric * p_pouch_floor_usd_micro::numeric) / p_sol_usd_micro::numeric)::bigint * 1000000
    );
    if p_price_lamports < v_floor then
      return pg_catalog.jsonb_build_object('status', 'refused', 'reason', 'below_pouch_floor', 'floor_lamports', v_floor);
    end if;
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

revoke all on function public.market_list(uuid, uuid, bigint, integer, integer, integer, bigint, bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.market_list(uuid, uuid, bigint, integer, integer, integer, bigint, bigint, bigint, bigint) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- SQL TEST PLAN (run in the SQL editor of the DEVELOPMENT project after applying this file; admin/tests/sql/pouchfloor.integration.test.ts runs the same cases)
-- ---------------------------------------------------------------------------------------------------------------------------------------
-- A. Small pouch (gold_amount 2000), rate US$ 150 (150000000): floor = ceil(2000 x 250000 / 150000000) = 4 steps = 4000000 lamports. A listing at 3000000 -> refused 'below_pouch_floor', floor_lamports 4000000;
--    at 4000000 -> listed.
-- B. No rate (p_sol_usd_micro null) with the floor on -> refused 'pouch_rate_unavailable'. With p_pouch_floor_usd_micro null the old behaviour (no floor).
-- C. An item (kind other than gold_pouch) at 1000000 lamports -> listed: the floor does not touch items.
