import { SaveData, loadSave, normalizeSave, persistSave } from './engine';
import { supabase } from '../lib/supabaseClient';

// Phase 1 boundary: this file only decides WHERE SaveData is stored (localStorage vs Supabase). It does
// NOT change who is trusted to compute gold/gear/RNG/timers — the server just stores whatever SaveData
// the client hands it, unvalidated, exactly like localStorage did. See docs/backend-phase1.md
// ("Phase 1 = identity + persistence, Phase 2+ = economic authority") — do not read the existence of
// this repository as a claim that the economy is now server-authoritative.

export const LEGACY_LOCAL_SAVE_KEY = 'arena-rpg-save-v1';

export class SaveConflictError extends Error {
  constructor() {
    super('save_conflict');
    this.name = 'SaveConflictError';
  }
}

export interface LoadResult {
  save: SaveData;
  // Optimistic-concurrency counter. Always 0 for the local repository (no cross-tab/cross-device
  // conflict concept for a single browser's localStorage).
  revision: number;
}

export interface SaveRepository {
  load(): Promise<LoadResult>;
  save(data: SaveData, expectedRevision: number): Promise<{ revision: number }>;
}

// ---- Local (pre-auth / offline fallback) ----------------------------------------------------------

export class LocalSaveRepository implements SaveRepository {
  async load(): Promise<LoadResult> {
    return { save: loadSave(), revision: 0 };
  }

  async save(data: SaveData): Promise<{ revision: number }> {
    persistSave(data);
    return { revision: 0 };
  }
}

// ---- Supabase (authenticated) ----------------------------------------------------------------------

interface CharacterRow {
  save_data: unknown;
  revision: number;
}

export class SupabaseSaveRepository implements SaveRepository {
  constructor(private readonly userId: string) {}

  async load(): Promise<LoadResult | null> {
    if (!supabase) throw new Error('supabase_not_configured');
    const { data, error } = await supabase
      .from('characters')
      .select('save_data, revision')
      .eq('user_id', this.userId)
      .maybeSingle<CharacterRow>();
    if (error) throw error;
    if (!data) return null;
    return { save: normalizeSave(data.save_data), revision: data.revision };
  }

  // Creates the server character for this user for the first time (new hero, or a one-time legacy
  // import — see LegacyImportPrompt). Fails if a character already exists (unique(user_id) — see
  // migration) so this can never silently overwrite one.
  async create(save: SaveData, importedFromLegacy: boolean): Promise<{ revision: number }> {
    if (!supabase) throw new Error('supabase_not_configured');
    const { data, error } = await supabase
      .from('characters')
      .insert({
        user_id: this.userId,
        hero_name: save.heroName,
        save_data: save,
        save_schema_version: save.schemaVersion,
        revision: 1,
        imported_from_legacy: importedFromLegacy,
      })
      .select('revision')
      .single<{ revision: number }>();
    if (error) throw error;
    return { revision: data.revision };
  }

  async save(data: SaveData, expectedRevision: number): Promise<{ revision: number }> {
    if (!supabase) throw new Error('supabase_not_configured');
    const nextRevision = expectedRevision + 1;
    const { data: row, error } = await supabase
      .from('characters')
      .update({
        hero_name: data.heroName,
        save_data: data,
        save_schema_version: data.schemaVersion,
        revision: nextRevision,
      })
      .eq('user_id', this.userId)
      .eq('revision', expectedRevision)
      .select('revision')
      .maybeSingle<{ revision: number }>();
    if (error) throw error;
    // No row matched user_id+revision: someone else (another tab/device) saved first. The caller must
    // reload the server's current state rather than retry blindly — server always wins (see §18/§21).
    if (!row) throw new SaveConflictError();
    return { revision: row.revision };
  }
}

// ---- Legacy local-save detection/import helpers ------------------------------------------------------

export function hasLegacyLocalSave(): boolean {
  try {
    return localStorage.getItem(LEGACY_LOCAL_SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function readLegacyLocalSave(): SaveData {
  return loadSave();
}

// Back up the local save exactly as it existed the moment a player chose to import it into (or replace
// it with) a server character — belt-and-suspenders alongside engine.ts's own v1->v2 migration backup,
// kept under a distinct key so it's never confused with that one.
const PRE_SERVER_BACKUP_KEY = 'arena-rpg-save-v1.pre-server';

export function backupLegacyLocalSaveOnce(): void {
  try {
    const raw = localStorage.getItem(LEGACY_LOCAL_SAVE_KEY);
    if (raw && localStorage.getItem(PRE_SERVER_BACKUP_KEY) === null) {
      localStorage.setItem(PRE_SERVER_BACKUP_KEY, raw);
    }
  } catch {
    /* ignore */
  }
}
