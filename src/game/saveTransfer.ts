import { normalizeSave, playerLevel, defaultSave, SaveData } from './engine';
import { isPreResetSave } from './leagueReset';

// Save export / import / reset (Settings). All three are pure except the backup, which writes to this device's storage.
//
// - Export: the hero as a JSON file. Only the SaveData goes in (the game save holds no credentials or account data; the account e-mail lives in the auth
//   session and never in the save), and as a belt-and-braces rule any key that looks like one is dropped from the file anyway.
// - Import: the file goes through the very same normalizeSave as every load (migrations, clamps, unknown ids dropped), and is refused when it is not a save at
//   all. The Adventurer Pass is an entitlement of the account, not of the hero, so an imported (or reset) hero keeps the Pass status of the current one.
// - Reset: a brand new hero, behind a typed confirmation word (the screen checks it with resetWordMatches).
// Both replacing actions first keep the current hero as a backup in this device's storage (two slots: the latest and the one before).

export const SAVE_EXPORT_FORMAT = 'arena-duel-save';
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export interface SaveExportFile {
  format: typeof SAVE_EXPORT_FORMAT;
  version: 1;
  exportedAt: string;
  save: SaveData;
}

const FORBIDDEN_KEY = /(e-?mail|token|password|passwd|secret|session_?id|auth|credential|api_?key)/i;

function stripSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSensitive);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (!FORBIDDEN_KEY.test(k)) out[k] = stripSensitive(v);
    return out;
  }
  return value;
}

export function buildSaveExport(save: SaveData, now: number): { text: string; filename: string } {
  const file: SaveExportFile = { format: SAVE_EXPORT_FORMAT, version: 1, exportedAt: new Date(now).toISOString(), save: stripSensitive(save) as SaveData };
  // 2026-10-12T10:20:30 -> 20261012102030 (digits only: a dash-colon character class in the source trips Tailwind's class scanner into emitting broken CSS)
  const stamp = new Date(now).toISOString().slice(0, 19).replace(/\D/g, '');
  return { text: JSON.stringify(file), filename: `arena-duel-save-${stamp}.json` };
}

// 'pre_reset': online, after the first League reset every hero, a save from before it (a missing marker counts as before) cannot enter the game.
export type ImportFailure = 'empty' | 'too_big' | 'not_json' | 'not_a_save' | 'pre_reset';
export type ImportResult = { ok: true; save: SaveData; level: number; floor: number } | { ok: false; reason: ImportFailure };

// The text of a file the player picked -> the save it would load, or why not. `current` supplies the Pass entitlement the imported hero keeps. `onlineResetAt` is the server's
// first-League reset moment (ms) when the game runs online and the League has opened; omit it (offline / desktop, or the League not open yet) and every save may be imported as before.
export function parseSaveImport(text: string, current: Pick<SaveData, 'hasBattlePass'>, onlineResetAt?: number | null): ImportResult {
  if (typeof text !== 'string' || text.trim() === '') return { ok: false, reason: 'empty' };
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, reason: 'too_big' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not_json' };
  }
  const raw = parsed && typeof parsed === 'object' && (parsed as { format?: unknown }).format === SAVE_EXPORT_FORMAT ? (parsed as { save?: unknown }).save : parsed;
  const r = raw as Partial<Record<keyof SaveData, unknown>> | null;
  if (!r || typeof r !== 'object' || Array.isArray(r) || typeof r.gold !== 'number' || typeof r.xp !== 'number' || !Number.isFinite(r.gold) || !Number.isFinite(r.xp)) {
    return { ok: false, reason: 'not_a_save' };
  }
  const save = { ...normalizeSave(raw), hasBattlePass: !!current.hasBattlePass };
  if (isPreResetSave(save, onlineResetAt)) return { ok: false, reason: 'pre_reset' };
  return { ok: true, save, level: playerLevel(save.xp), floor: save.highestDungeonFloor };
}

// A new hero that keeps only the Pass entitlement of the current one.
// (and its League marker: a hero the player starts over by hand is still part of the reset it belongs to, so it is never reset a second time.)
export function resetSave(current: Pick<SaveData, 'hasBattlePass' | 'league'>): SaveData {
  return { ...defaultSave(), hasBattlePass: !!current.hasBattlePass, league: current.league };
}

// The word typed to confirm a reset (case and surrounding spaces do not matter).
export const resetWordMatches = (typed: string, word: string): boolean => typed.trim().toLowerCase() === word.trim().toLowerCase();

const BACKUP_LATEST = 'arena-rpg-save-backup';
const BACKUP_PREVIOUS = 'arena-rpg-save-backup.prev';

// Keeps `save` as the latest backup (the one before it moves to the second slot). false when the device refused the write: the caller must then not replace anything.
export function writeBackup(save: SaveData, now: number): boolean {
  try {
    const latest = localStorage.getItem(BACKUP_LATEST);
    if (latest !== null) localStorage.setItem(BACKUP_PREVIOUS, latest);
    localStorage.setItem(BACKUP_LATEST, JSON.stringify({ at: now, save }));
    return localStorage.getItem(BACKUP_LATEST) !== null;
  } catch {
    return false;
  }
}

export function readBackup(slot: 'latest' | 'previous' = 'latest'): { at: number; save: SaveData } | null {
  try {
    const raw = localStorage.getItem(slot === 'latest' ? BACKUP_LATEST : BACKUP_PREVIOUS);
    if (!raw) return null;
    const p = JSON.parse(raw) as { at?: unknown; save?: unknown };
    return { at: Number(p.at) || 0, save: normalizeSave(p.save) };
  } catch {
    return null;
  }
}
