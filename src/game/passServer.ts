import { deviceStorage } from '../lib/deviceStore';
import { supabase } from '../lib/supabaseClient';
import { normalizeSave, SaveData } from './engine';
import { setServerPassStatus } from './entitlements';
import { withSessionWindow } from './huntSession';

// The web build's side of the Adventurer Pass: the Pass is a row in the server's `entitlements` table (supabase/migrations/0003_entitlements.sql) that only
// the payment webhook (or the owner, by hand) can write. This file reads it, caches the answer briefly, and keeps the save in line. The Pass is bought in USDC (src/components/PassUsdc.tsx); nothing here starts a payment.
// Season / championship code that must know "does this account own the Pass?" calls fetchServerPassOwned() below (and, on the server, the SQL function
// arena_private.owns_adventurer_pass); it must never trust save.hasBattlePass.

// ---- Reading the entitlement --------------------------------------------------------------------------------------------------------------

/**
 * THE read of the server entitlement: true when the signed-in account has an active Adventurer Pass. Throws when the server cannot be asked
 * (network, not signed in). RLS lets a user select only his own rows, so no user id is sent.
 */
export async function fetchServerPassOwned(): Promise<boolean> {
  return (await fetchServerPassStatus()).owned;
}

/**
 * What the server says about the account's Pass (migration 0025, public.my_pass_status): the Pass belongs to a season, so "owned" means it covers the CURRENT season.
 * validThrough = the last season of the newest Pass the account ever held (null: never had one); currentSeason = the season a Pass bought now would cover.
 */
export interface PassStatus {
  owned: boolean;
  validThrough: number | null;
  currentSeason: number | null;
}

const seasonOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 1000 ? v : null);

/** Maps the server's answer. Anything that is not a clear "owned: true" is NOT owned (fail closed); a season that is not a small positive integer is dropped. */
export function mapPassStatus(raw: unknown): PassStatus {
  const r = raw && typeof raw === 'object' ? (raw as { owned?: unknown; valid_through?: unknown; current_season?: unknown }) : {};
  return { owned: r.owned === true, validThrough: seasonOrNull(r.valid_through), currentSeason: seasonOrNull(r.current_season) };
}

export async function fetchServerPassStatus(): Promise<PassStatus> {
  if (!supabase) throw new Error('not_configured');
  const { data, error } = await supabase.rpc('my_pass_status');
  if (error) throw new Error('entitlement_read_failed');
  return mapPassStatus(data);
}

// ---- Offline grace cache ------------------------------------------------------------------------------------------------------------------
// A convenience so a player who is briefly offline keeps the perks he paid for. It is NOT security: it lives in localStorage, where the player can edit it;
// it is only consulted when the server cannot be reached, it expires after PASS_CACHE_MAX_AGE_MS, and every successful server answer overwrites it.
// Nothing server-side ever reads it (the ranking checks the table).
export const PASS_CACHE_KEY = 'arena.passEntitlement.v1';
export const PASS_CACHE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
const defaultStorage = (): StorageLike | null => {
  return deviceStorage;
};

export function readPassCache(userId: string, now: number, storage: StorageLike | null = defaultStorage()): boolean | null {
  try {
    const raw = storage?.getItem(PASS_CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as { userId?: unknown; owned?: unknown; checkedAt?: unknown };
    if (c.userId !== userId || typeof c.owned !== 'boolean' || typeof c.checkedAt !== 'number') return null;
    if (now - c.checkedAt > PASS_CACHE_MAX_AGE_MS || c.checkedAt > now + 60_000) return null;
    return c.owned;
  } catch {
    return null;
  }
}

export function writePassCache(userId: string, owned: boolean, now: number, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(PASS_CACHE_KEY, JSON.stringify({ userId, owned, checkedAt: now }));
  } catch {
    /* storage blocked: the cache is optional */
  }
}

export interface PassResolution {
  owned: boolean;
  from: 'server' | 'cache' | 'none';
}

/** Asks the server; if it cannot be reached, falls back to a fresh cache entry, and otherwise to "not owned" (fail closed). */
export async function resolvePassOwned(
  userId: string,
  deps: { fetchOwned?: () => Promise<boolean>; storage?: StorageLike | null; now?: () => number } = {},
): Promise<PassResolution> {
  const fetchOwned = deps.fetchOwned ?? fetchServerPassOwned;
  const now = deps.now ?? Date.now;
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
  try {
    const owned = await fetchOwned();
    writePassCache(userId, owned, now(), storage);
    return { owned, from: 'server' };
  } catch {
    const cached = readPassCache(userId, now(), storage);
    return cached === null ? { owned: false, from: 'none' } : { owned: cached, from: 'cache' };
  }
}

/** Like resolvePassOwned, but keeps the season facts too. A cache answer carries none (the cache stores only the yes/no). */
export async function resolvePassStatus(
  userId: string,
  deps: { fetchStatus?: () => Promise<PassStatus>; storage?: StorageLike | null; now?: () => number } = {},
): Promise<{ status: PassStatus; from: PassResolution['from'] }> {
  const fetchStatus = deps.fetchStatus ?? fetchServerPassStatus;
  const now = deps.now ?? Date.now;
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
  try {
    const status = await fetchStatus();
    writePassCache(userId, status.owned, now(), storage);
    return { status, from: 'server' };
  } catch {
    const cached = readPassCache(userId, now(), storage);
    return { status: { owned: cached === true, validThrough: null, currentSeason: null }, from: cached === null ? 'none' : 'cache' };
  }
}

/** Fetch (with cache fallback) and publish the result to the entitlement store the whole game reads. */
export async function refreshServerPass(userId: string): Promise<PassResolution> {
  const r = await resolvePassStatus(userId);
  setServerPassStatus(r.status);
  return { owned: r.status.owned, from: r.from };
}

/** Mid-session recheck: a failure changes nothing (a hiccup must not take the Pass away); only a real server answer updates the store and the cache. */
export async function recheckServerPass(userId: string): Promise<void> {
  try {
    const status = await fetchServerPassStatus();
    writePassCache(userId, status.owned, Date.now());
    setServerPassStatus(status);
  } catch {
    /* keep what we have */
  }
}

// ---- Keeping the save in line -------------------------------------------------------------------------------------------------------------

/**
 * Overwrites the save's flag with the server's answer so no old code path can disagree. Gaining the Pass opens the pass window of a running Hunt (like the
 * DEV grant used to). Losing it (refund, revoke, or a save edited to claim it) re-normalizes the save with the flag off, which drops what is gated on it
 * (golden skin, second hero skill, extended gathering caps), and closes any Hunt pass windows.
 */
export function applyServerPass(save: SaveData, owned: boolean, now: number): SaveData {
  if (!!save.hasBattlePass === owned) return save;
  if (owned) {
    return { ...save, hasBattlePass: owned, huntSession: save.huntSession ? withSessionWindow(save.huntSession, 'pass', { from: now, to: null }) : save.huntSession };
  }
  const cleaned = normalizeSave(JSON.parse(JSON.stringify({ ...save, hasBattlePass: owned })));
  return { ...cleaned, huntSession: cleaned.huntSession ? { ...cleaned.huntSession, pass: [] } : cleaned.huntSession };
}

// ---- Waiting for the payment to be recorded -----------------------------------------------------------------------------------------------
export const PASS_POLL_INTERVAL_MS = 2000;
export const PASS_POLL_MAX_MS = 40_000;

/** Polls until the entitlement shows up or the time budget is spent. 'pending' = the payment may still be processing. Errors count as "not yet". */
export async function pollPassOwned(
  fetchOwned: () => Promise<boolean>,
  opts: { intervalMs?: number; maxMs?: number; sleep?: (ms: number) => Promise<void>; isCancelled?: () => boolean } = {},
): Promise<'owned' | 'pending' | 'cancelled'> {
  const interval = opts.intervalMs ?? PASS_POLL_INTERVAL_MS;
  const attempts = Math.max(1, Math.floor((opts.maxMs ?? PASS_POLL_MAX_MS) / interval));
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let i = 0; i < attempts; i++) {
    if (opts.isCancelled?.()) return 'cancelled';
    try {
      if (await fetchOwned()) return 'owned';
    } catch {
      /* the server may be briefly unreachable: keep trying until the budget ends */
    }
    if (i < attempts - 1) await sleep(interval);
  }
  return opts.isCancelled?.() ? 'cancelled' : 'pending';
}

// ---- The "buy the Pass" link from the website ---------------------------------------------------------------------------------------------
// The public site (portal/) links to `<play url>/?comprar=passe`. The site cannot run the payment (it needs the player's login and wallet), so the game catches the marker as
// early as possible (main.tsx), takes it out of the address bar and remembers it for this tab (sessionStorage, 30 minutes) so it survives the login screen and an
// e-mail-confirmation reload. Once signed in, App opens the Pass modal and, only when the USDC payment is on (VITE_MARKET_ENABLED) and the server says the account does not own
// the Pass, HIGHLIGHTS the buy button. It never starts a payment by itself: a link must not lead to a payment without a tap; the player presses the button.
export const BUY_INTENT_PARAM = 'comprar';
export const BUY_INTENT_VALUE = 'passe';
export const BUY_INTENT_KEY = 'arena.buyIntent.v1';
export const BUY_INTENT_MAX_AGE_MS = 30 * 60 * 1000;

type SessionStorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const defaultSessionStorage = (): SessionStorageLike | null => {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
};

/** Reads ?comprar=passe once, removes it from the address bar and remembers the intent. Returns true when the marker was in the URL. */
export function captureBuyIntent(
  href: string = typeof window !== 'undefined' ? window.location.href : '',
  replaceUrl: (relative: string) => void = (u) => window.history.replaceState(null, '', u),
  now: number = Date.now(),
  storage: SessionStorageLike | null = defaultSessionStorage(),
): boolean {
  try {
    const url = new URL(href);
    if (url.searchParams.get(BUY_INTENT_PARAM) !== BUY_INTENT_VALUE) return false;
    url.searchParams.delete(BUY_INTENT_PARAM);
    replaceUrl(url.pathname + url.search + url.hash);
    try {
      storage?.setItem(BUY_INTENT_KEY, JSON.stringify({ at: now }));
    } catch {
      /* storage blocked: the intent only lives until the next reload */
    }
    pendingBuyIntent = now;
    return true;
  } catch {
    return false;
  }
}

let pendingBuyIntent: number | null = null;

/** True while a fresh buy intent is waiting (in memory or in this tab's session storage). */
export function hasBuyIntent(now: number = Date.now(), storage: SessionStorageLike | null = defaultSessionStorage()): boolean {
  let at = pendingBuyIntent;
  if (at === null) {
    try {
      const raw = storage?.getItem(BUY_INTENT_KEY);
      const parsed = raw ? (JSON.parse(raw) as { at?: unknown }) : null;
      if (parsed && typeof parsed.at === 'number') at = parsed.at;
    } catch {
      at = null;
    }
  }
  return at !== null && now - at >= 0 && now - at <= BUY_INTENT_MAX_AGE_MS;
}

export function clearBuyIntent(storage: SessionStorageLike | null = defaultSessionStorage()): void {
  pendingBuyIntent = null;
  try {
    storage?.removeItem(BUY_INTENT_KEY);
  } catch {
    /* nothing to clear */
  }
}

/**
 * What to do once the player is signed in on the web build with a buy intent. The modal always opens; 'highlight' = also draw attention to the buy button (payment on and the
 * server says the account does not own the Pass). NEVER a payment: the player taps. `owned` is the SERVER's answer (null = it could not be asked: never guess).
 */
export function buyIntentAction(paymentOn: boolean, owned: boolean | null): 'open' | 'highlight' {
  return paymentOn && owned === false ? 'highlight' : 'open';
}
