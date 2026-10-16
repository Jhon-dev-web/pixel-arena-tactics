// The money of the market, in whole US cents, and its conversion to USDT base units. Pure and dependency free: the Edge Functions and the game (to SHOW the split) import this one file,
// so the amount on the screen and the amount the server verifies can never be computed two different ways.
//
// USDT on BNB Smart Chain (BEP-20, "BSC-USD") has 18 decimals, so 0.01 USDT = 10^16 base units. Prices are stored as integer cents: no float ever touches money.

export const USDT_DECIMALS = 18;
export const CENT_UNITS = 10n ** 16n;

/** The game's fee on every sale, in percent of the price. The owner's decision: 5%. */
export const MARKET_FEE_PERCENT = 5;
/** 0.50 USDT: below this the fee rounds to nothing useful and the gas costs more than the item. */
export const MARKET_MIN_PRICE_CENTS = 50;
/** 5,000.00 USDT: a sane ceiling while the market is new (one typo cannot sell a Gold Pouch for a fortune; raise it in code when the owner decides). */
export const MARKET_MAX_PRICE_CENTS = 500_000;

export interface PriceSplit {
  /** What the buyer pays in total. */
  priceCents: number;
  /** The game's share: price x 5%, ROUNDED UP to the cent so the game never gets less than 5%. */
  feeCents: number;
  /** The seller's share: the price minus the fee, so the two parts always add up to the price exactly. */
  sellerCents: number;
}

export const isPriceCents = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= MARKET_MIN_PRICE_CENTS && v <= MARKET_MAX_PRICE_CENTS;

export function splitPrice(priceCents: number): PriceSplit {
  if (!Number.isInteger(priceCents) || priceCents < 1) throw new RangeError('price must be a positive whole number of cents');
  const feeCents = Math.floor((priceCents * MARKET_FEE_PERCENT + 99) / 100);
  return { priceCents, feeCents, sellerCents: priceCents - feeCents };
}

export const centsToUnits = (cents: number): bigint => BigInt(cents) * CENT_UNITS;

/** "10.00" / "10" / "0.5" -> cents. null for anything else (more than 2 decimals, a sign, an exponent, text). */
export function parseUsdtAmount(text: string | undefined | null): number | null {
  if (typeof text !== 'string') return null;
  const m = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || '0');
}

/** 1000 -> "10.00" */
export function formatUsdt(cents: number): string {
  const whole = Math.floor(cents / 100);
  const frac = String(cents % 100).padStart(2, '0');
  return `${whole}.${frac}`;
}
