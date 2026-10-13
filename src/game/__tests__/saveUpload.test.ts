import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SaveData, defaultSave, normalizeSave } from '../engine';
import { GEAR, isInstancedSlot } from '../gear';
import { GEAR_SCHEMA_VERSION, createGearInstance } from '../gearInstances';
import { emptyMaterials, MATERIALS } from '../materials';
import { MAX_INVENTORY_CAPACITY } from '../inventory';
import { SaveConflictError, SaveTooLargeError, SupabaseSaveRepository } from '../saveRepository';
import { MAX_SAVE_UPLOAD_BYTES, fromUploadBlob, jsonBytes, toUploadBlob } from '../saveUpload';
import { buildHero } from '../../../scripts/sim/ladder';

const NOW = new Date('2026-10-10T12:00:00Z').getTime();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

// A one-table, one-row stand-in for the slice of the Supabase client the repository uses (insert / update / select, filtered by .eq, optimistic revision).
function fakeClient() {
  const state = { row: null as null | Record<string, unknown>, calls: 0 };
  const client = {
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        state.calls++;
        state.row = { ...row };
        return { select: () => ({ single: async () => ({ data: { revision: row.revision }, error: null }) }) };
      },
      update: (patch: Record<string, unknown>) => {
        state.calls++;
        const filters: Record<string, unknown> = {};
        const q = {
          eq: (col: string, val: unknown) => ((filters[col] = val), q),
          select: () => q,
          maybeSingle: async () => {
            if (!state.row || state.row.revision !== filters.revision) return { data: null, error: null };
            state.row = { ...state.row, ...patch };
            return { data: { revision: state.row.revision }, error: null };
          },
        };
        return q;
      },
      select: () => {
        const q = { eq: () => q, maybeSingle: async () => ({ data: state.row, error: null }) };
        return q;
      },
    }),
  };
  return { client: client as unknown as SupabaseClient, state };
}

// The biggest save we can build on purpose (the number the upload limit is derived from, see saveUpload.ts).
function stressedSave(): SaveData {
  const hero = buildHero(100, 6, 8, 100);
  const materials = emptyMaterials();
  for (const m of MATERIALS) materials[m.id] = 99_999;
  const templates = GEAR.filter((g) => isInstancedSlot(g.slot));
  const gearInstances = { ...hero.gearInstances };
  for (let i = 0; Object.keys(gearInstances).length < MAX_INVENTORY_CAPACITY * 2; i++) {
    const g = createGearInstance(templates[i % templates.length].id, { origin: 'drop', rarity: 'legendary', createdAt: NOW });
    gearInstances[g.id] = g;
  }
  return { ...hero, materials, gearInstances };
}

describe('save upload: size limit and versioning', () => {
  it('the limit is about 4x the largest save we can build, which itself is far below it', () => {
    const fresh = jsonBytes(toUploadBlob(defaultSave()));
    const endGame = jsonBytes(toUploadBlob(buildHero(100, 6, 8, 100)));
    const stressed = jsonBytes(toUploadBlob(stressedSave()));
    expect(fresh).toBeLessThan(endGame);
    expect(endGame).toBeLessThan(stressed);
    expect(stressed * 3).toBeLessThan(MAX_SAVE_UPLOAD_BYTES);
    expect(stressed * 5).toBeGreaterThan(MAX_SAVE_UPLOAD_BYTES);
  });

  it('the uploaded blob carries schemaVersion and the app version', () => {
    const blob = toUploadBlob(defaultSave());
    expect(blob.schemaVersion).toBe(GEAR_SCHEMA_VERSION);
    expect(typeof blob.appVersion).toBe('string');
    expect(blob.appVersion.length).toBeGreaterThan(0);
  });

  it('a save from the newest code survives create -> save -> load through the repository', async () => {
    const { client, state } = fakeClient();
    const repo = new SupabaseSaveRepository('user-1', client);
    const played: SaveData = { ...stressedSave(), gold: 123_456, heroName: 'Roundtrip' };
    await repo.create(played, false);
    const next = await repo.save({ ...played, gold: 123_999 }, 1);
    expect(next.revision).toBe(2);

    expect(state.row?.save_schema_version).toBe(GEAR_SCHEMA_VERSION);
    expect((state.row?.save_data as { appVersion?: string }).appVersion).toBeTruthy();

    const loaded = await repo.load();
    expect(loaded?.revision).toBe(2);
    expect(loaded?.save).toEqual(normalizeSave(JSON.parse(JSON.stringify({ ...played, gold: 123_999 }))));
    expect('appVersion' in (loaded?.save ?? {})).toBe(false);
  });

  it('an old revision is still a conflict, not a size error', async () => {
    const { client } = fakeClient();
    const repo = new SupabaseSaveRepository('user-1', client);
    await repo.create(defaultSave(), false);
    await expect(repo.save(defaultSave(), 7)).rejects.toBeInstanceOf(SaveConflictError);
  });

  it('refuses an oversized save before any request is made', async () => {
    const { client, state } = fakeClient();
    const repo = new SupabaseSaveRepository('user-1', client);
    const bloated = { ...defaultSave(), seenTooltips: Array.from({ length: 40_000 }, (_, i) => `tip_${i}_padding_padding`) };
    expect(jsonBytes(bloated)).toBeGreaterThan(MAX_SAVE_UPLOAD_BYTES);
    await expect(repo.create(bloated, false)).rejects.toBeInstanceOf(SaveTooLargeError);
    await expect(repo.save(bloated, 1)).rejects.toBeInstanceOf(SaveTooLargeError);
    expect(state.calls).toBe(0);
  });

  it('fromUploadBlob removes the appVersion field before the save is normalized', () => {
    const wire = JSON.parse(JSON.stringify(toUploadBlob(defaultSave())));
    expect('appVersion' in normalizeSave(fromUploadBlob(wire))).toBe(false);
  });
});
