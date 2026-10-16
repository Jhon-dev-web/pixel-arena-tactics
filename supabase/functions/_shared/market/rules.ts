import { MARKET_FEE_PERCENT, MARKET_MAX_PRICE_CENTS, MARKET_MIN_PRICE_CENTS } from '../chain/money.ts';

// Every number of the market's rules in ONE place. The handlers pass them to the SQL functions as arguments (migration 0011 has none of them hard coded except the price check constraint),
// and a static test pins the SQL to these names. Change a rule here and redeploy; no migration needed (except the price bounds, which are also a check constraint).
export const MARKET_RULES = {
  feePercent: MARKET_FEE_PERCENT,
  minPriceCents: MARKET_MIN_PRICE_CENTS,
  maxPriceCents: MARKET_MAX_PRICE_CENTS,
  /** a listing lives this long, then the item goes back to its owner */
  listingTtlDays: 30,
  /** live (open or reserved) listings per seller */
  maxActiveListings: 20,
  /** listings created per seller in 24 hours */
  maxListingsPerDay: 20,
  /** the buyer's lock on a listing */
  reservationTtlMinutes: 30,
  /** a valid payment this long after the lock ended still delivers, if the listing is still unsold and free for that buyer */
  graceMinutes: 120,
  /** reservations a buyer may open per window (abandoned ones count: nobody can park on the listings) */
  reserveRateMax: 10,
  reserveRateWindowSeconds: 3600,
  /** the wallet-link nonce */
  nonceTtlSeconds: 10 * 60,
  nonceMax: 10,
  nonceWindowSeconds: 60 * 60,
  /** verifications (each one costs the RPC provider calls) per account: refill per hour and capacity */
  verifyPerHour: 240,
  verifyCapacity: 60,
  /** the USDT Pass: how long a purchase intent counts payments from */
  passIntentTtlHours: 24,
} as const;

export const MARKET_VERIFY_BUCKET = 'market_verify';
