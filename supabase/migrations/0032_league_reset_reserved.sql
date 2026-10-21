-- League reset leak: an item (or lot) that was RESERVED at the moment of the reset used to survive it.
--
-- THE BUG (0011 / 0015). The reset trigger (arena_private.item_certificates_league_reset) revoked the old certificates and cancelled the old lots but deliberately SKIPPED every listing that
-- was 'reserved' (a buyer held it). When that reservation then lapsed and the seller cancelled (or the listing expired), the certificate went back to 'held' (and a lot's units back to the
-- seller's balance), so a reset hero could end up with an item minted by the PREVIOUS season's hero.
--
-- THE FIX (the simplest correct option: void everything at reset, refund the buyer). A certificate or lot created before reset_at can never come back, so the reset now treats a reserved
-- listing like any other old one:
--   * the pending reservation becomes 'refund_due' (and its recorded payments 'refund_due'): a payment that was already made is owed back, never lost;
--   * the listing is 'cancelled' (the escrowed units of a lot are dropped, like every other old lot), the certificate is 'revoked';
--   * a payment that arrives LATER for that reservation (the buyer's wallet was slow, the client resubmits) is handled by market_record_payment (0015) with NO change: a 'refund_due'
--     reservation records the transaction as 'refund_due' and answers { status: 'refund_due' }. It does not raise, so the signature is consumed and shows up in the refund queue.
--   * a reservation that had already lapsed into its late-payment grace has its listing 'open' or 'cancelled' by the same reset; a late payment on a cancelled listing is 'refund_due' too.
-- The logic lives in arena_private.league_reset_void(reset_at), called by the trigger (set-once, like reset_at) and ONCE here for a project where the League already opened (it also revokes the
-- certificates that already leaked back to 'held'; nothing created before reset_at is legitimate after it). Idempotent: running it again finds nothing left to void.
--
-- NOT APPLIED from this repo: the owner runs it (SQL editor or `supabase db push`), in the DEVELOPMENT project first.
--
-- ROLLBACK (by hand): re-run the `create or replace function arena_private.item_certificates_league_reset()` block of 0015_tradeable_materials.sql and
--   drop function if exists arena_private.league_reset_void(timestamptz);
-- (reservations / listings already voided stay voided).

create or replace function arena_private.league_reset_void(p_reset_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_reset_at is null then
    return;
  end if;

  -- 1. RESERVED listings of the replaced heroes (item or lot): the reservation is owed back, the listing is cancelled.
  insert into public.market_events (kind, user_id, listing_id, reservation_id, detail)
  select 'refund_due', r.buyer_id, r.listing_id, r.id, pg_catalog.jsonb_build_object('why', 'league_reset')
  from public.market_reservations as r
  join public.market_listings as l on l.id = r.listing_id
  left join public.item_certificates as c on c.id = l.certificate_id
  where r.status = 'pending' and l.status = 'reserved' and coalesce(c.created_at, l.created_at) < p_reset_at;

  update public.chain_payments as p set status = 'refund_due'
  from public.market_reservations as r
  join public.market_listings as l on l.id = r.listing_id
  left join public.item_certificates as c on c.id = l.certificate_id
  where p.reservation_id = r.id and p.status = 'applied'
    and r.status = 'pending' and l.status = 'reserved' and coalesce(c.created_at, l.created_at) < p_reset_at;

  update public.market_reservations as r set status = 'refund_due', closed_at = pg_catalog.now()
  from public.market_listings as l
  left join public.item_certificates as c on c.id = l.certificate_id
  where r.listing_id = l.id and r.status = 'pending' and l.status = 'reserved' and coalesce(c.created_at, l.created_at) < p_reset_at;

  update public.market_listings as l set status = 'cancelled', closed_at = pg_catalog.now()
  where l.status = 'reserved' and coalesce((select c.created_at from public.item_certificates as c where c.id = l.certificate_id), l.created_at) < p_reset_at;

  -- 2. OPEN listings of the replaced heroes.
  update public.market_listings as l set status = 'cancelled', closed_at = pg_catalog.now()
  from public.item_certificates as c
  where l.certificate_id = c.id and l.status = 'open' and c.created_at < p_reset_at;
  update public.market_listings as l set status = 'cancelled', closed_at = pg_catalog.now()
  where l.material_id is not null and l.status = 'open' and l.created_at < p_reset_at;

  -- 3. Every certificate minted before the reset is void (held, or listed with a listing that no longer exists).
  insert into public.item_certificate_events (certificate_id, user_id, event, detail)
  select c.id, c.user_id, 'revoke', pg_catalog.jsonb_build_object('reason', 'league_reset')
  from public.item_certificates as c
  where c.status in ('held', 'listed') and c.created_at < p_reset_at;
  update public.item_certificates as c set status = 'revoked'
  where c.status in ('held', 'listed') and c.created_at < p_reset_at;

  -- 4. The material balances of the replaced heroes (escrowed units of the lots above are simply dropped).
  insert into public.material_ledger (user_id, material_id, delta, pending_delta, qty_after, reason, ref)
  select b.user_id, b.material_id, -b.qty, -b.pending, 0, 'reset', 'league_reset'
  from public.material_balances as b
  where (b.qty > 0 or b.pending > 0) and b.updated_at < p_reset_at;
  update public.material_balances as b set qty = 0, pending = 0, seq = b.seq + 1, updated_at = pg_catalog.now()
  where (b.qty > 0 or b.pending > 0) and b.updated_at < p_reset_at;
end;
$$;

revoke all on function arena_private.league_reset_void(timestamptz) from public, anon, authenticated;

create or replace function arena_private.item_certificates_league_reset()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reset_at is not null and old.reset_at is null then
    perform arena_private.league_reset_void(new.reset_at);
  end if;
  return new;
end;
$$;

revoke all on function arena_private.item_certificates_league_reset() from public, anon, authenticated;

-- Applied AFTER the League already opened: void what leaked back (no-op while reset_at is null).
select arena_private.league_reset_void((select g.reset_at from arena_private.season_goal as g where g.id));
