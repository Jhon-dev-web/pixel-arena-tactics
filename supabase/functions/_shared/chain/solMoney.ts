import { MARKET_FEE_PERCENT } from './money.ts';

// The money of the Solana market. Pure and dependency free: the Edge Functions and the game (to SHOW the split and to BUILD the transfers) import this one file, so the amount on the
// screen, the amount the wallet signs and the amount the server verifies can never be computed three different ways.
//
//   * Items and Gold Pouches are priced and paid in SOL (native): 1 SOL = 1,000,000,000 lamports. A listing price is a whole number of 0.001 SOL steps (so it fits "up to 3 decimals").
//   * The Adventurer Pass is paid in USDC (an SPL token, 6 decimals): 1 USDC = 1,000,000 base units.
// No float ever touches money: prices travel as integer lamports (at most 5 x 10^10, far inside the 2^53 a JS number holds exactly).

export const LAMPORTS_PER_SOL = 1_000_000_000;
export const SOL_DECIMALS = 9;
/** A price moves in steps of 0.001 SOL. */
export const SOL_PRICE_STEP_LAMPORTS = 1_000_000;
/** 0.001 SOL: below this the game's 5% is dust. */
export const MARKET_MIN_PRICE_LAMPORTS = 1_000_000;
/** 50 SOL: a sane ceiling while the market is new (one typo cannot sell a Gold Pouch for a fortune). Tune it here; the SQL check constraint only guards a wider absolute bound (0.001 to 1,000 SOL). */
export const MARKET_MAX_PRICE_LAMPORTS = 50 * LAMPORTS_PER_SOL;
/** The widest bound the database enforces on its own (migration 0013): 1,000 SOL. */
export const MARKET_ABSOLUTE_MAX_PRICE_LAMPORTS = 1000 * LAMPORTS_PER_SOL;

// ---- tradeable materials (docs/MARKET_FOUNDATION.md "Materiais negociaveis"): a lot of one material is priced PER UNIT, in micro-SOL (1 micro-SOL = 0.000001 SOL = 1,000 lamports), so the unit price has up to 6 decimals ----
/** 1,000 lamports = 0.000001 SOL: the step of a unit price. */
export const LAMPORTS_PER_MICRO_SOL = 1000;
/** The most a unit price can be: the whole market ceiling for ONE unit. */
export const MAX_UNIT_PRICE_MICRO = MARKET_MAX_PRICE_LAMPORTS / LAMPORTS_PER_MICRO_SOL;

/** The price of a whole lot in lamports: unit price (micro-SOL) x quantity x 1,000. Integers all the way (at most 5 x 10^7 x 10^4 x 10^3 = 5 x 10^14, far inside 2^53). */
export const materialTotalLamports = (unitPriceMicro: number, quantity: number): number => unitPriceMicro * quantity * LAMPORTS_PER_MICRO_SOL;

export const isUnitPriceMicro = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_UNIT_PRICE_MICRO;

/** A lot is valid when its total is a whole number of micro-SOL, at least 0.001 SOL and at most the market ceiling. */
export const isMaterialTotalLamports = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= MARKET_MIN_PRICE_LAMPORTS && v <= MARKET_MAX_PRICE_LAMPORTS && v % LAMPORTS_PER_MICRO_SOL === 0;

/** "0.0025" / "1" / "0.000001" -> micro-SOL (2500 / 1000000 / 1). null for more than 6 decimals, a sign, an exponent, text, zero. */
export function parseUnitPrice(text: string | undefined | null): number | null {
  if (typeof text !== 'string') return null;
  const m = /^(\d{1,4})(?:\.(\d{1,6}))?$/.exec(text.trim());
  if (!m) return null;
  const micro = Number(m[1]) * 1_000_000 + Number((m[2] ?? '').padEnd(6, '0') || '0');
  return micro > 0 ? micro : null;
}

/** 2500 -> "0.0025": a unit price in SOL with the decimals it needs (at least 2, at most 6). */
export function formatUnitPrice(micro: number): string {
  const whole = Math.floor(micro / 1_000_000);
  let frac = String(micro % 1_000_000).padStart(6, '0').replace(/0+$/, '');
  if (frac.length < 2) frac = frac.padEnd(2, '0');
  return `${whole}.${frac}`;
}

export const USDC_DECIMALS = 6;
export const USDC_UNIT = 1_000_000;
export const DEFAULT_PASS_PRICE_USDC_UNITS = 10 * USDC_UNIT;

export { MARKET_FEE_PERCENT };

export interface LamportSplit {
  /** What the buyer pays in total. */
  priceLamports: number;
  /** The game's share: price x 5%, ROUNDED UP to the lamport so the game never gets less than 5%. */
  feeLamports: number;
  /** The seller's share: the price minus the fee, so the two parts always add up to the price exactly. */
  sellerLamports: number;
}

export const isPriceLamports = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= MARKET_MIN_PRICE_LAMPORTS && v <= MARKET_MAX_PRICE_LAMPORTS && v % SOL_PRICE_STEP_LAMPORTS === 0;

export function splitLamports(priceLamports: number): LamportSplit {
  if (!Number.isSafeInteger(priceLamports) || priceLamports < 1) throw new RangeError('price must be a positive whole number of lamports');
  const feeLamports = Math.floor((priceLamports * MARKET_FEE_PERCENT + 99) / 100);
  return { priceLamports, feeLamports, sellerLamports: priceLamports - feeLamports };
}

/** "0.5" / "1" / "12.345" -> lamports. null for anything else (more than 3 decimals, a sign, an exponent, text, zero). */
export function parseSolAmount(text: string | undefined | null): number | null {
  if (typeof text !== 'string') return null;
  const m = /^(\d{1,4})(?:\.(\d{1,3}))?$/.exec(text.trim());
  if (!m) return null;
  const lamports = Number(m[1]) * LAMPORTS_PER_SOL + Number((m[2] ?? '').padEnd(3, '0') || '0') * SOL_PRICE_STEP_LAMPORTS;
  return lamports > 0 ? lamports : null;
}

/** 1_500_000 -> "0.0015": SOL with the decimals it needs (at least `min`, at most 9), no trailing zeros beyond `min`. */
export function formatSol(lamports: number, min = 2): string {
  const whole = Math.floor(lamports / LAMPORTS_PER_SOL);
  let frac = String(lamports % LAMPORTS_PER_SOL).padStart(SOL_DECIMALS, '0').replace(/0+$/, '');
  if (frac.length < min) frac = frac.padEnd(min, '0');
  return frac.length > 0 ? `${whole}.${frac}` : String(whole);
}

/** "10.00" / "10" / "0.5" -> USDC base units. null for more than 6 decimals, a sign, an exponent, text. */
export function parseUsdcAmount(text: string | undefined | null): number | null {
  if (typeof text !== 'string') return null;
  const m = /^(\d{1,7})(?:\.(\d{1,6}))?$/.exec(text.trim());
  if (!m) return null;
  return Number(m[1]) * USDC_UNIT + Number((m[2] ?? '').padEnd(USDC_DECIMALS, '0') || '0');
}

/** 10_000_000 -> "10.00" */
export function formatUsdc(units: number): string {
  const whole = Math.floor(units / USDC_UNIT);
  let frac = String(units % USDC_UNIT).padStart(USDC_DECIMALS, '0').replace(/0+$/, '');
  if (frac.length < 2) frac = frac.padEnd(2, '0');
  return `${whole}.${frac}`;
}
