import { deviceStorage } from '../lib/deviceStore';
import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from '../lib/supabaseClient';
import { defaultSave, SaveData } from './engine';
import { leagueEpochOf, LeagueMark } from './leagueMark';
import { setLeagueEpoch } from './leagueClock';
import { SaveConflictError, SaveRepository } from './saveRepository';

// The first paid League starts every ONLINE hero from zero, once (owner decision; migration 0009_first_league_reset.sql, docs/SEASON_RANKING.md "Reset da primeira Liga").
//
// The server stamps ONE moment, league_reset_at, when the first ranked season opens. The game reads it on login and on resume. A hero whose marker (save.league.epoch) is below that
// moment predates the League: it is replaced by a fresh hero whose marker IS the server's own value (never the device clock), so the check is exact and idempotent: a reload, a second
// tab, a skewed clock or a retry after a failed upload all end in the same place and never reset a fresh hero again. Kept: the account, the username (profiles) and the Pass (a server
// entitlement). Wiped: everything in the save. The offline / desktop build has no backend, never asks, and is never touched.

/** The cosmetic title the testers receive (titles.ts). No stats, nothing tradeable. */
export const PIONEER_TITLE_ID = 'title_pioneer';

const RESET_AT_CACHE_KEY = 'arena.leagueResetAt.v1';
/** The old hero is kept on this device only, as a memory. Nothing in the game reads this key: it is never imported, offered or restored (a test pins that). */
export const PRE_LEAGUE_BACKUP_PREFIX = 'arena-pre-league-memory.';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
const defaultStorage = (): StorageLike | null => {
  return deviceStorage;
};

// ---- the server's reset moment, as the game knows it -------------------------------------------------------------------------------------------

/** undefined = not asked yet (or no backend), null = asked, the League has not opened, number = the reset moment in ms. */
let known: number | null | undefined;
const listeners = new Set<() => void>();
const setKnown = (v: number | null | undefined): void => {
  setLeagueEpoch(typeof v === 'number' ? v : null); // the event calendar (leagueEvents.ts) hangs from the server's moment
  if (known === v) return;
  known = v;
  listeners.forEach((l) => l());
};

export const getServerResetAt = (): number | null | undefined => known;
/** Test helper: forget what was learned. */
export const resetKnownLeagueResetAt = (): void => setKnown(undefined);

/** Parses what league_reset_at() returned (an ISO string or null) to ms. Null for anything that is not a date. */
export function parseResetAt(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

/** THE read: public.league_reset_at(). Throws when the server cannot be asked. */
export async function fetchLeagueResetAt(): Promise<number | null> {
  if (!supabase) throw new Error('not_configured');
  const { data, error } = await supabase.rpc('league_reset_at');
  if (error) throw new Error('league_reset_read_failed');
  return parseResetAt(data);
}

function readCachedResetAt(storage: StorageLike | null): number | null {
  try {
    const raw = Number(storage?.getItem(RESET_AT_CACHE_KEY));
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Asks the server and remembers the answer. Once the League opened the value never changes (set-once on the server), so a cached positive value is safe to use when the server
 * cannot be reached: a brief outage can neither skip the reset nor repeat it. A failed ask with no cache leaves "unknown" (undefined) and the game carries on; the next login or
 * resume asks again. Never throws.
 */
export async function readLeagueResetAt(deps: { fetchAt?: () => Promise<number | null>; storage?: StorageLike | null } = {}): Promise<number | null | undefined> {
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
  try {
    const at = await (deps.fetchAt ?? fetchLeagueResetAt)();
    try {
      if (at !== null) storage?.setItem(RESET_AT_CACHE_KEY, String(at));
    } catch {
      /* the cache is optional */
    }
    setKnown(at);
    return at;
  } catch {
    const cached = readCachedResetAt(storage);
    if (cached !== null) {
      setKnown(cached);
      return cached;
    }
    return known;
  }
}

/** React: the known reset moment (undefined while unknown); asks once when nobody has yet. Components show the pre-season warning only when it is exactly null. */
export function useLeagueResetAt(): number | null | undefined {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getServerResetAt,
    getServerResetAt,
  );
  useEffect(() => {
    if (known === undefined && supabase) void readLeagueResetAt();
  }, []);
  return value;
}

/** public.my_pioneer(): did this account have an accepted snapshot before the reset. Throws when the server cannot be asked. */
export async function fetchIsPioneer(): Promise<boolean> {
  if (!supabase) throw new Error('not_configured');
  const { data, error } = await supabase.rpc('my_pioneer');
  if (error) throw new Error('pioneer_read_failed');
  return data === true;
}

// ---- the decisions (pure) ----------------------------------------------------------------------------------------------------------------------

/** The hero predates the first League. Always false when the League has not opened (null) or the reset moment is unknown (undefined): nothing is touched without the server's word. */
export const needsLeagueReset = (save: Pick<SaveData, 'league'>, resetAt: number | null | undefined): boolean => typeof resetAt === 'number' && leagueEpochOf(save) < resetAt;

/** A save that already belongs to the reset but whose "Pioneiro" question was never answered (the ask failed at the moment of the reset). */
export const needsPioneerCheck = (save: Pick<SaveData, 'league'>, resetAt: number | null | undefined): boolean =>
  typeof resetAt === 'number' && leagueEpochOf(save) >= resetAt && save.league?.pioneerChecked !== true;

/** Online import rule: a save from before the reset cannot enter the online game. A missing marker counts as before. */
export const isPreResetSave = (save: Pick<SaveData, 'league'>, resetAt: number | null | undefined): boolean => needsLeagueReset(save, resetAt);

/** Submitting a pre-reset hero would only be told to wait by the server (409): the client does not even try. */
export const shouldHoldSubmission = (save: Pick<SaveData, 'league'>, resetAt: number | null | undefined): boolean => needsLeagueReset(save, resetAt);

const withPioneer = (cosmetics: string[]): string[] => (cosmetics.includes(PIONEER_TITLE_ID) ? cosmetics : [...cosmetics, PIONEER_TITLE_ID]);

/**
 * The fresh hero. Kept from the old one: only its name. The Pass entitlement is applied by the caller (applyServerPass), as for every save entering the game. `pioneer` null = the
 * question could not be asked (it is asked again later); true grants the title.
 */
export function buildLeagueHero(old: Pick<SaveData, 'heroName'>, resetAt: number, pioneer: boolean | null): SaveData {
  const fresh = defaultSave();
  const mark: LeagueMark = { epoch: resetAt, noticeSeen: false, pioneerChecked: pioneer !== null };
  return { ...fresh, heroName: old.heroName || fresh.heroName, cosmetics: pioneer ? withPioneer(fresh.cosmetics) : fresh.cosmetics, league: mark };
}

/** A hero created after the reset (a new account): already part of it, nothing to explain, nothing to ask. */
export function buildNewLeagueHero(resetAt: number | null | undefined): SaveData {
  const fresh = defaultSave();
  return typeof resetAt === 'number' ? { ...fresh, league: { epoch: resetAt, noticeSeen: true, pioneerChecked: true } } : fresh;
}

/** The Pioneer title for a hero that belongs to the reset and was never asked. Returns the same object when nothing changes. */
export function applyPioneerAnswer(save: SaveData, pioneer: boolean): SaveData {
  if (!save.league) return save;
  return { ...save, cosmetics: pioneer ? withPioneer(save.cosmetics) : save.cosmetics, league: { ...save.league, pioneerChecked: true } };
}

// ---- the one-time local memory of the old hero -----------------------------------------------------------------------------------------------------

/**
 * Keeps the pre-League hero on THIS device, once per account and reset. Labelled as a memory; nothing reads it back. Returns true when a copy exists afterwards
 * (written now or already there), false when the device refused it (the reset still goes on: the player was warned and the old hero was online-only data anyway).
 */
export function writePreLeagueMemory(old: SaveData, accountId: string, resetAt: number, now: number, storage: StorageLike | null = defaultStorage()): boolean {
  const key = `${PRE_LEAGUE_BACKUP_PREFIX}${accountId}.${resetAt}`;
  try {
    if (!storage) return false;
    if (storage.getItem(key) !== null) return true; // one-time: a second tab or a retry never overwrites the first copy
    storage.setItem(
      key,
      JSON.stringify({
        label: 'Arena Idle - hero from before the first League. A memory kept on this device only: it can never be imported into the online game.',
        accountId,
        resetAt,
        savedAt: now,
        save: old,
      }),
    );
    return storage.getItem(key) !== null;
  } catch {
    return false;
  }
}

// ---- settling the League for a loaded save ---------------------------------------------------------------------------------------------------

export interface SettleDeps {
  accountId: string;
  resetAt: number;
  /** The save entering the game agrees with the server's Pass answer (passServer.applyServerPass). */
  applyPass: (save: SaveData) => SaveData;
  fetchPioneer?: () => Promise<boolean>;
  now?: () => number;
  storage?: StorageLike | null;
}

export interface SettleOutcome {
  save: SaveData;
  revision: number;
  /** This call replaced the hero with a fresh one. */
  reset: boolean;
  /** The save differs from what the server held (reset, or the Pioneer answer): it was uploaded unless `persisted` is false. */
  changed: boolean;
  /** false when the upload failed for a non-conflict reason: the game carries on with `save` and its autosave retries at `revision`. */
  persisted: boolean;
}

/**
 * Brings the server's save up to date with the League and returns what the game should now play with. `loaded` is the server's current save and revision (read just before).
 * Idempotent: a save that already belongs to the reset comes back untouched. Two tabs: the loser of the optimistic-concurrency save adopts the winner's save instead.
 */
export async function settleLeague(repo: Pick<SaveRepository, 'load' | 'save'>, loaded: { save: SaveData; revision: number }, deps: SettleDeps, attempt = 1): Promise<SettleOutcome> {
  const { save, revision } = loaded;
  const untouched: SettleOutcome = { save, revision, reset: false, changed: false, persisted: true };
  const reset = needsLeagueReset(save, deps.resetAt);
  if (!reset && !needsPioneerCheck(save, deps.resetAt)) return untouched;

  const ask = async (): Promise<boolean | null> => {
    try {
      return await (deps.fetchPioneer ?? fetchIsPioneer)();
    } catch {
      return null;
    }
  };

  let next: SaveData;
  if (reset) {
    writePreLeagueMemory(save, deps.accountId, deps.resetAt, (deps.now ?? Date.now)(), deps.storage);
    next = deps.applyPass(buildLeagueHero(save, deps.resetAt, await ask()));
  } else {
    const answer = await ask();
    if (answer === null) return untouched; // asked again at the next login or resume
    next = applyPioneerAnswer(save, answer);
  }

  try {
    const saved = await repo.save(next, revision);
    return { save: next, revision: saved.revision, reset, changed: true, persisted: true };
  } catch (err) {
    if (err instanceof SaveConflictError) {
      // Another tab or device saved first (possibly an old hero that was still being autosaved): the server wins. If its save already belongs to the reset (the usual case) it comes
      // back untouched; if it is still an old hero, settle that one (a few tries, then the next login or resume check finishes the job).
      const current = await repo.load();
      if (current) {
        if (attempt < 3) return settleLeague(repo, current, deps, attempt + 1);
        return { save: current.save, revision: current.revision, reset: false, changed: true, persisted: true };
      }
    }
    return { save: next, revision, reset, changed: true, persisted: false };
  }
}
