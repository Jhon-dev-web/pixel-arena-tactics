import type { MarketItemView, MarketOverview, MyListingView, ReservationView } from '../../../supabase/functions/_shared/market/types';
import type { PublicListing } from './api';

// OWNER RULE (2026-10-21): every click is a request to the server, and what the player bought or published must show at once, even if the screen stops for a moment. So when the server answers an
// action, the screen applies the answer HERE (pure functions, no waiting for a periodic sync), and then asks the server once for the lists it changed (the truth replaces this local guess). The
// periodic MarketSync stays only as a safety net.

/** What a server answer changed, as the market screen sees it. */
export type MarketChange =
  /** a listing was published (the server answered with its id and expiry) */
  | { kind: 'listed'; listing: MyListingView }
  /** a listing of mine was cancelled */
  | { kind: 'cancelled'; listingId: string }
  /** a reservation was made: the listing is taken in the browse list */
  | { kind: 'reserved'; reservation: ReservationView }
  /** a reservation was cancelled: the listing is open again */
  | { kind: 'reservationReleased'; reservation: ReservationView }
  /** the payment was recorded: the reservation is paid (the listing is gone) or owed back */
  | { kind: 'paid'; reservation: ReservationView };

export interface MarketLive {
  overview: MarketOverview | null;
  listings: PublicListing[];
}

const OPEN_STATUSES: MyListingView['status'][] = ['open', 'reserved'];

/** A listing of mine as the overview would show it, built from what the player just published and the server's answer (id and expiry). */
export function myListingFrom(args: { id: string; certificateId: string | null; priceLamports: number; item: MarketItemView; expiresAt: string; now: number }): MyListingView {
  return { id: args.id, certificateId: args.certificateId, priceLamports: args.priceLamports, status: 'open', createdAt: new Date(args.now).toISOString(), expiresAt: args.expiresAt, item: args.item };
}

const setBrowseStatus = (list: PublicListing[], id: string, status: 'open' | 'reserved'): PublicListing[] => list.map((l) => (l.id === id ? { ...l, status } : l));

/** Applies one server answer to the lists on screen. Idempotent: applying the same change twice gives the same lists. */
export function applyMarketChange(live: MarketLive, change: MarketChange): MarketLive {
  const { overview, listings } = live;
  switch (change.kind) {
    case 'listed': {
      if (!overview) return live;
      const rest = overview.listings.filter((l) => l.id !== change.listing.id);
      return { overview: { ...overview, listings: [change.listing, ...rest] }, listings };
    }
    case 'cancelled': {
      return {
        overview: overview ? { ...overview, listings: overview.listings.filter((l) => l.id !== change.listingId) } : overview,
        listings: listings.filter((l) => l.id !== change.listingId),
      };
    }
    case 'reserved': {
      return {
        overview: overview ? { ...overview, reservation: change.reservation, listings: overview.listings.map((l) => (l.id === change.reservation.listingId && OPEN_STATUSES.includes(l.status) ? { ...l, status: 'reserved' as const } : l)) } : overview,
        listings: setBrowseStatus(listings, change.reservation.listingId, 'reserved'),
      };
    }
    case 'reservationReleased': {
      return {
        overview: overview ? { ...overview, reservation: null, listings: overview.listings.map((l) => (l.id === change.reservation.listingId && l.status === 'reserved' ? { ...l, status: 'open' as const } : l)) } : overview,
        listings: setBrowseStatus(listings, change.reservation.listingId, 'open'),
      };
    }
    case 'paid': {
      const sold = change.reservation.status === 'paid';
      return {
        overview: overview ? { ...overview, reservation: change.reservation } : overview,
        // sold: the listing leaves the browse list at once (a refund_due one stays gone too: the server decides if it comes back)
        listings: sold || change.reservation.status === 'refund_due' ? listings.filter((l) => l.id !== change.reservation.listingId) : listings,
      };
    }
    default:
      return live;
  }
}

/** The answers of an action that must not be overwritten by an older read: a counter handed out per read, the read applies only while it is still the newest. */
export function makeReadSequence(): { next: () => number; isLatest: (n: number) => boolean } {
  let latest = 0;
  return { next: () => ++latest, isLatest: (n) => n === latest };
}
