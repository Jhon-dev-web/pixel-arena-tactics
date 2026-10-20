import { deviceStorage } from '../lib/deviceStore';
// A mint (the forge, a Gold Pouch) asks the server to roll. If the server rolled and committed but the ANSWER was lost, the certificate exists on the server and the piece is not in the save:
// an orphan. The cure is the idempotent request id of mint-item (docs/MARKET_FOUNDATION.md): ask again with the SAME id and the server returns the stored result instead of rolling again.
// So the id of an action that has not finished is remembered (in this browser, across a reload) under a key that describes WHAT was asked, and the next identical attempt reuses it.
// An intent ends when the action is applied to the save, or when the server gave a final refusal. It also expires after a day (the server keeps the request forever, but a stale id is not worth keeping).
//
// This is a convenience for honest players, not a security measure: the server decides everything and its own limits apply to a replay exactly as to the first call.

export const MINT_INTENTS_KEY = 'arena.mintIntents.v1';
export const MINT_INTENT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_INTENTS = 20;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
interface Intent {
  id: string;
  at: number;
}
type Book = Record<string, Intent>;

const defaultStorage = (): StorageLike | null => {
  return deviceStorage;
};

function read(storage: StorageLike | null, now: number): Book {
  try {
    const raw = storage?.getItem(MINT_INTENTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Book;
    const book: Book = {};
    for (const [k, v] of Object.entries(parsed ?? {})) {
      if (v && typeof v.id === 'string' && typeof v.at === 'number' && now - v.at <= MINT_INTENT_MAX_AGE_MS && v.at <= now + 60_000) book[k] = { id: v.id, at: v.at };
    }
    return book;
  } catch {
    return {};
  }
}

function write(storage: StorageLike | null, book: Book): void {
  try {
    const entries = Object.entries(book).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_INTENTS);
    storage?.setItem(MINT_INTENTS_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* storage blocked: the intent lives only until the page closes, which is how it worked before */
  }
}

/** The request id of this unfinished action: the remembered one if there is one, else a fresh one (remembered from now on). */
export function intentRequestId(key: string, makeId: () => string, now: number = Date.now(), storage: StorageLike | null = defaultStorage()): string {
  const book = read(storage, now);
  const have = book[key];
  if (have) return have.id;
  const id = makeId();
  book[key] = { id, at: now };
  write(storage, book);
  return id;
}

/** The action is done (applied to the save) or finally refused: forget its id. */
export function clearIntent(key: string, now: number = Date.now(), storage: StorageLike | null = defaultStorage()): void {
  const book = read(storage, now);
  if (!(key in book)) return;
  delete book[key];
  write(storage, book);
}
