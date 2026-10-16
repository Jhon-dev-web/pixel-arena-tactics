import { MARKET_FEE_PERCENT, MARKET_MAX_PRICE_LAMPORTS, MARKET_MIN_PRICE_LAMPORTS } from '../chain/solMoney.ts';

// Every number of the market's rules in ONE place. The handlers pass them to the SQL functions as arguments (migration 0011 has none of them hard coded except the price check constraint),
// and a static test pins the SQL to these names. Change a rule here and redeploy; no migration needed (except the price bounds, which are also a check constraint).
export const MARKET_RULES = {
  feePercent: MARKET_FEE_PERCENT,
  minPriceLamports: MARKET_MIN_PRICE_LAMPORTS,
  maxPriceLamports: MARKET_MAX_PRICE_LAMPORTS,
  /** a listing lives this long, then the item goes back to its owner */
  listingTtlDays: 30,
  /** the most units of one material in ONE listing (a lot is bought whole; a bag holds at most about this many of a material) */
  maxMaterialQtyPerListing: 10_000,
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
  /** verifications and blockhash requests (each one costs the RPC provider calls) per account: refill per hour and capacity */
  verifyPerHour: 240,
  verifyCapacity: 60,
  /** the USDC Pass: how long a purchase intent counts payments from */
  passIntentTtlHours: 24,
  /** the optional SOL/USD read (secret SOL_USD_PRICE_URL) is cached this long on the server; the game never calls a third party */
  solUsdCacheSeconds: 300,
} as const;

export const MARKET_VERIFY_BUCKET = 'market_verify';
