import { MARKET_RULES } from './rules.ts';

// The optional "about US$" line next to SOL prices. The SERVER reads the price from the URL the owner put in the secret SOL_USD_PRICE_URL (any https JSON endpoint that carries a US dollar price
// of one SOL), keeps it for 5 minutes and returns it with the market overview. The game never calls a third party. Without the secret the answer is null and the game shows no dollar line.
//
// The JSON shape is not fixed (CoinGecko {"solana":{"usd":150.2}}, Coinbase {"data":{"amount":"150.2"}}, Jupiter, ...): the first number found under a key named usd / price / amount (looked up
// breadth first, a few levels deep) is taken. Anything that is not a finite number between 0.01 and 100,000 is ignored. This is a convenience for the player, never used for a payment.

const KEYS = ['usd', 'USD', 'price', 'amount', 'last'];
const MAX_DEPTH = 4;
const STALE_MS = 60 * 60 * 1000;

export function extractUsdPrice(json: unknown): number | null {
  const queue: { v: unknown; depth: number }[] = [{ v: json, depth: 0 }];
  while (queue.length > 0) {
    const { v, depth } = queue.shift() as { v: unknown; depth: number };
    if (!v || typeof v !== 'object' || depth > MAX_DEPTH) continue;
    const obj = v as Record<string, unknown>;
    for (const k of KEYS) {
      const raw = obj[k];
      const n = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : NaN;
      if (Number.isFinite(n) && n >= 0.01 && n <= 100_000) return n;
    }
    for (const child of Object.values(obj)) if (child && typeof child === 'object') queue.push({ v: child, depth: depth + 1 });
  }
  return null;
}

export interface SolUsdReader {
  (): Promise<number | null>;
}

/** A reader with its own 5 minute cache. A failed read keeps the last good value for up to an hour, then answers null. */
export function createSolUsdReader(url: string | undefined, opts: { fetchFn?: typeof fetch; nowMs?: () => number; timeoutMs?: number } = {}): SolUsdReader {
  const target = (url ?? '').trim();
  const doFetch = opts.fetchFn ?? fetch;
  const now = opts.nowMs ?? (() => Date.now());
  const ttlMs = MARKET_RULES.solUsdCacheSeconds * 1000;
  let cached: { price: number; at: number } | null = null;
  let inflight: Promise<number | null> | null = null;

  const read = async (): Promise<number | null> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 3000);
    try {
      const res = await doFetch(target, { headers: { accept: 'application/json' }, signal: ctrl.signal });
      if (!res.ok) return null;
      const price = extractUsdPrice(await res.json());
      if (price !== null) cached = { price, at: now() };
      return price;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  return async () => {
    if (!/^https:\/\//i.test(target)) return null;
    if (cached && now() - cached.at < ttlMs) return cached.price;
    inflight ??= read().finally(() => {
      inflight = null;
    });
    const fresh = await inflight;
    if (fresh !== null) return fresh;
    return cached && now() - cached.at < STALE_MS ? cached.price : null;
  };
}

// The Edge Functions build their dependencies on every request, so the reader lives here, one per URL, to keep its cache across requests.
const readers = new Map<string, SolUsdReader>();
export function solUsdReaderFor(url: string | undefined): SolUsdReader {
  const key = (url ?? '').trim();
  let r = readers.get(key);
  if (!r) {
    r = createSolUsdReader(key);
    readers.set(key, r);
  }
  return r;
}
