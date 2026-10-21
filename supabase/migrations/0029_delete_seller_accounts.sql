-- An account that sold a piece on the market can be deleted (depends on 0011 market, 0027 admin delete). NOT APPLIED from this repo: the owner runs it (SQL editor or `supabase db push`), in the
-- DEVELOPMENT project first. It is run for real by admin/tests/sql/deleteuser.integration.test.ts (an in-memory Postgres).
--
-- THE PROBLEM THIS SOLVES. A sale ends the seller's certificate and issues a new one for the buyer that points back at it (item_certificates.origin_certificate_id), and the buyer's reservation points
-- at the seller's listing (market_reservations.listing_id). Both were real foreign keys without a cascade, so deleting the SELLER (whose certificates and listings cascade from auth.users) was refused,
-- and the panel's dry run reported 'blocked'. A cascade would be wrong (it would delete the BUYER's piece and his payment record); SET NULL would be wrong too ("origin_certificate_id is null" means
-- "minted by the server" in the mint caps, the forge pity and the panel's counts, so a bought piece would turn into a minted one).
--
-- THE FIX. The two columns become plain uuids, like market_reservations.buyer_id and chain_payments.user_id already are: the trail outlives the account. After a seller is deleted, the buyer's piece
-- keeps a non-null origin that no longer resolves (still "bought"), and the reservation keeps its listing id, amounts and addresses. Only server functions ever write these columns.
--
-- ROLLBACK (by hand; only possible while every reference still resolves, so check first):
--   select count(*) from public.item_certificates c where c.origin_certificate_id is not null and not exists (select 1 from public.item_certificates o where o.id = c.origin_certificate_id);
--   select count(*) from public.market_reservations r where not exists (select 1 from public.market_listings l where l.id = r.listing_id);
--   both 0 ->  alter table public.item_certificates add constraint item_certificates_origin_certificate_id_fkey foreign key (origin_certificate_id) references public.item_certificates (id);
--              alter table public.market_reservations add constraint market_reservations_listing_id_fkey foreign key (listing_id) references public.market_listings (id);

alter table public.item_certificates drop constraint if exists item_certificates_origin_certificate_id_fkey;
alter table public.market_reservations drop constraint if exists market_reservations_listing_id_fkey;

comment on column public.item_certificates.origin_certificate_id is
  'The certificate a bought piece was copied from. A plain uuid (0029): it may no longer resolve after the seller''s account was deleted; not null still means "bought, not minted".';
comment on column public.market_reservations.listing_id is
  'The listing this reservation locked. A plain uuid (0029): it may no longer resolve after the seller''s account was deleted; the amounts and addresses are kept on the reservation.';
