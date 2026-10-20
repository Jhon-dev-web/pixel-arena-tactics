import { SaveData, loadSave, normalizeSave, persistSave } from './engine';
import { supabase } from '../lib/supabaseClient';
import type { SupabaseClient } from '@supabase/supabase-js';
import { assertUploadSize, fromUploadBlob, toUploadBlob } from './saveUpload';
import { withKeepalive } from '../lib/supabaseFetch';

// Phase 1 boundary: this file only decides WHERE SaveData is stored (localStorage vs Supabase). It does
// NOT change who is trusted to compute gold/gear/RNG/timers — the server just stores whatever SaveData
// the client hands it, unvalidated, exactly like localStorage did. See docs/backend-phase1.md
// ("Phase 1 = identity + persistence, Phase 2+ = economic authority") — do not read the existence of
// this repository as a claim that the economy is now server-authoritative.

export { SaveTooLargeError, MAX_SAVE_UPLOAD_BYTES } from './saveUpload';

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
  /** True when the save goes to a server: its uploads are batched (saveScheduler.ts) and the device keeps a journal in between (pendingCloudSave.ts). Absent / false = the device itself (localStorage). */
  readonly remote?: boolean;
  /** The server character row this repository last loaded or created (remote only); the device journal is bound to it. */
  readonly characterId?: string;
  load(): Promise<LoadResult>;
  /** `keepalive` marks an upload made while the page is going away: the request may outlive it (when the client supports that and the body is small enough). */
  save(data: SaveData, expectedRevision: number, opts?: { keepalive?: boolean }): Promise<{ revision: number }>;
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
  id?: string;
  save_data: unknown;
  revision: number;
}

export class SupabaseSaveRepository implements SaveRepository {
  readonly remote = true;
  characterId: string | undefined;
  // `client` defaults to the app client; tests pass a fake one.
  constructor(
    private readonly userId: string,
    private readonly client: SupabaseClient | null = supabase,
  ) {}

  async load(): Promise<LoadResult | null> {
    const supabase = this.client;
    if (!supabase) throw new Error('supabase_not_configured');
    const { data, error } = await supabase
      .from('characters')
      .select('id, save_data, revision')
      .eq('user_id', this.userId)
      .maybeSingle<CharacterRow>();
    if (error) throw error;
    if (!data) return null;
    this.characterId = data.id;
    return { save: normalizeSave(fromUploadBlob(data.save_data)), revision: data.revision };
  }

  // Creates the server character for this user for the first time (new hero, or a one-time legacy
  // import — see LegacyImportPrompt). Fails if a character already exists (unique(user_id) — see
  // migration) so this can never silently overwrite one.
  async create(save: SaveData, importedFromLegacy: boolean): Promise<{ revision: number }> {
    const supabase = this.client;
    if (!supabase) throw new Error('supabase_not_configured');
    const blob = assertUploadSize(toUploadBlob(save)); // refuses oversized saves before any request
    const { data, error } = await supabase
      .from('characters')
      .insert({
        user_id: this.userId,
        hero_name: save.heroName,
        save_data: blob,
        save_schema_version: save.schemaVersion,
        revision: 1,
        imported_from_legacy: importedFromLegacy,
      })
      .select('id, revision')
      .single<{ id?: string; revision: number }>();
    if (error) throw error;
    this.characterId = data.id;
    return { revision: data.revision };
  }

  async save(data: SaveData, expectedRevision: number, opts: { keepalive?: boolean } = {}): Promise<{ revision: number }> {
    const supabase = this.client;
    if (!supabase) throw new Error('supabase_not_configured');
    const blob = assertUploadSize(toUploadBlob(data));
    const nextRevision = expectedRevision + 1;
    const request = () =>
      supabase
        .from('characters')
        .update({
          hero_name: data.heroName,
          save_data: blob,
          save_schema_version: data.schemaVersion,
          revision: nextRevision,
        })
        .eq('user_id', this.userId)
        .eq('revision', expectedRevision)
        .select('revision')
        .maybeSingle<{ revision: number }>();
    const { data: row, error } = await (opts.keepalive ? withKeepalive(request) : request());
    if (error) throw error;
    // No row matched user_id+revision: someone else (another tab/device) saved first. The caller must
    // reload the server's current state rather than retry blindly — server always wins (see §18/§21).
    if (!row) throw new SaveConflictError();
    return { revision: row.revision };
  }
}
