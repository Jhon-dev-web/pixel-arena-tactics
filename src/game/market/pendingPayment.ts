// A payment the player's wallet already sent (market reservation or Adventurer Pass) but the server has not confirmed yet. The wallet returns the transaction signature the moment it
// sends; if the page closes, reloads or crashes before the server answers, or the server is paused (market_paused / pass_sales_paused), the money is on chain and the game would forget
// the signature. So it is remembered here (this browser, across a reload) and the verification is resumed automatically when the screen opens again. It is forgotten only once the server
// gave a FINAL answer. This is a convenience for honest players, not a security measure: the server verifies the transaction on chain and decides everything.
//
// It uses the browser's localStorage directly (like the error log), NOT lib/deviceStore: online, deviceStore keeps everything in memory only, which would lose the signature on reload, and
// a signature is the receipt of a payment already made, not game data.

export const PENDING_PAYMENTS_KEY = 'arena.pendingPayments.v1';
/** After a week the entry is dropped (the payment would be long past any grace period; the owner's queue has it if it reached the game). */
export const PENDING_PAYMENT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 10;
/** How long a screen waits before asking again after the server said it is paused (the server's own Retry-After is 5 minutes). */
export const PAUSED_RETRY_MS = 5 * 60 * 1000;

export interface PendingPayment {
  signature: string;
  at: number;
  /** the linked wallet the payment was made from (the Pass flow only resumes for the same wallet) */
  wallet?: string;
}
type Book = Record<string, PendingPayment>;
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export const marketPendingKey = (reservationId: string): string => `market:${reservationId}`;
export const PASS_PENDING_KEY = 'pass';

function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function read(storage: StorageLike | null, now: number): Book {
  try {
    const raw = storage?.getItem(PENDING_PAYMENTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const book: Book = {};
    for (const [k, v] of Object.entries(parsed ?? {})) {
      const e = v as Partial<PendingPayment> | null;
      if (e && typeof e.signature === 'string' && typeof e.at === 'number' && now - e.at <= PENDING_PAYMENT_MAX_AGE_MS && e.at <= now + 60_000) {
        book[k] = { signature: e.signature, at: e.at, ...(typeof e.wallet === 'string' ? { wallet: e.wallet } : {}) };
      }
    }
    return book;
  } catch {
    return {};
  }
}

function write(storage: StorageLike | null, book: Book): void {
  try {
    const entries = Object.entries(book).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_ENTRIES);
    storage?.setItem(PENDING_PAYMENTS_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* storage blocked: the signature lives only until the page closes, which is how it worked before */
  }
}

/** Remembers the signature the wallet just returned. */
export function savePending(key: string, signature: string, wallet?: string, now: number = Date.now(), storage: StorageLike | null = browserStorage()): void {
  const book = read(storage, now);
  book[key] = { signature, at: now, ...(wallet ? { wallet } : {}) };
  write(storage, book);
}

/** The remembered signature of this payment, if any. */
export function loadPending(key: string, now: number = Date.now(), storage: StorageLike | null = browserStorage()): PendingPayment | null {
  return read(storage, now)[key] ?? null;
}

/** The server gave a final answer (or the payment is no longer relevant): forget it. */
export function clearPending(key: string, now: number = Date.now(), storage: StorageLike | null = browserStorage()): void {
  const book = read(storage, now);
  if (!(key in book)) return;
  delete book[key];
  write(storage, book);
}

/** Answers that say "the server cannot decide right now" (paused, rate limited, or a server error): the payment may well be good, so the signature stays saved. */
export const isHeldReason = (reason: string): boolean => reason === 'market_paused' || reason === 'pass_sales_paused' || reason === 'rate_limited' || /^status_5\d\d$/.test(reason);
/** The server is paused on purpose: the signature is kept and asked again later. */
export const isPausedReason = (reason: string): boolean => reason === 'market_paused' || reason === 'pass_sales_paused';
