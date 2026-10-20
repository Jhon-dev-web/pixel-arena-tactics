import { isSupabaseConfigured } from './supabaseClient';

// The ONLY door to the browser's storage for game data and preferences.
//
// ONLINE build (Supabase configured): nothing the game knows is written to the browser. Everything lives in memory while the tab is open and on the server (the save carries the player's
// preferences, see `prefs` in engine.ts). The one browser storage still in use online is what Supabase Auth keeps for the login session (`sb-*` keys), which this file never touches.
// OFFLINE / desktop build (no backend): the device is the only place there is, so it keeps using localStorage exactly as before.
//
// Because every module goes through `deviceStorage`, the online mode is one switch here, not a rule each module must remember.

type Backend = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

let online = isSupabaseConfigured;
const memory = new Map<string, string>();
const listeners = new Set<() => void>();
const notify = (): void => listeners.forEach((l) => l());

/** Keys whose value is a player preference worth carrying in the server save (`SaveData.prefs`). Everything else held here is a convenience that lives in memory only. */
export const isPrefKey = (key: string): boolean =>
  key === 'arena-rpg-audio' || key === 'locale' || key === 'arena-rpg-notify' || key === 'arena.reduceMotion.v1' || key.startsWith('arena-last-seen');

function browser(): Backend | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export const deviceStorage: Backend = {
  getItem(key) {
    if (online) return memory.has(key) ? (memory.get(key) as string) : null;
    return browser()?.getItem(key) ?? null;
  },
  setItem(key, value) {
    if (online) {
      memory.set(key, String(value));
      if (isPrefKey(key)) notify();
      return;
    }
    browser()?.setItem(key, value);
  },
  removeItem(key) {
    if (online) {
      if (memory.delete(key) && isPrefKey(key)) notify();
      return;
    }
    browser()?.removeItem(key);
  },
};

export const isOnlineStorage = (): boolean => online;

/** Test helper: force a mode and forget everything held in memory. */
export function setStorageMode(mode: 'online' | 'device'): void {
  online = mode === 'online';
  memory.clear();
}

/** Sign-out / account change: nothing of the previous account stays in memory. */
export function clearMemoryStore(): void {
  memory.clear();
  notify();
}

/** The preferences currently held (online: in memory), as they go into the server save. */
export function snapshotPrefs(): Record<string, string> {
  const out: Record<string, string> = {};
  memory.forEach((v, k) => {
    if (isPrefKey(k)) out[k] = v;
  });
  return out;
}

/** Puts the preferences of the loaded server save into memory (replacing any held), without announcing them as a change. */
export function hydratePrefs(prefs: Record<string, string> | undefined): void {
  [...memory.keys()].filter(isPrefKey).forEach((k) => memory.delete(k));
  for (const [k, v] of Object.entries(prefs ?? {})) if (isPrefKey(k) && typeof v === 'string') memory.set(k, v);
}

/** Called when a preference changes (online only). */
export function subscribePrefs(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const GAME_KEY_PREFIXES = [
  'arena-rpg-', // save (+ .pre-instances, .pre-server), backups, pending-cloud journal, audio, mute, notify
  'arena-last-seen',
  'arena-legacy-local-claimed',
  'arena-pre-league', // the memory of the old hero before the first League
  'arena-error-log',
  'arena.passEntitlement',
  'arena.mintIntents',
  'arena.leagueResetAt',
  'arena.reduceMotion',
];
/** Exact keys not covered by a prefix above (the language). */
const GAME_KEYS = ['locale'];

/**
 * One-time cleanup of the game keys older versions left in the browser. They are DELETED, never read: an old hero on a shared device must not be able to reach any account.
 * Supabase Auth's own keys (`sb-*`) are left alone. Returns how many were removed.
 */
export function purgeLegacyBrowserGameData(storage: (Backend & { length: number; key(i: number): string | null }) | null = (browser() as never)): number {
  if (!storage) return 0;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && (GAME_KEYS.includes(k) || GAME_KEY_PREFIXES.some((p) => k.startsWith(p)))) doomed.push(k);
    }
    doomed.forEach((k) => storage.removeItem(k));
    return doomed.length;
  } catch {
    return 0;
  }
}
