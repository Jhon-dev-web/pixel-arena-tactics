import { describe, expect, it } from 'vitest';
import { defaultSave, SaveData } from '../engine';
import { heroActivity } from '../activity';
import { startCraftJob } from '../craftJob';
import { sanitizeCraftJob } from '../craftJobTypes';
import { applyHuntStart } from '../huntLifecycle';
import { applyStartGathering } from '../gathering';
import { emptyMaterials } from '../materials';

const T0 = 1_800_000_000_000;
const base = (over: Partial<SaveData> = {}): SaveData => ({ ...defaultSave(), gold: 10_000, ...over });
const withMats = (s: SaveData, m: Record<string, number>): SaveData => ({ ...s, materials: { ...emptyMaterials(), ...s.materials, ...m } });

describe('the hero does one task at a time', () => {
  it('a running job makes the hero busy, and blocks hunting, mining and woodcutting', () => {
    const s1 = startCraftJob(withMats(base(), { copper: 5 }), 'refine', 'smelt_copper', 1, T0).save!;
    expect(heroActivity(s1)).toBe('craft');
    expect(applyHuntStart(base(), 'demon_glade', 'shallow', T0)).not.toBeNull(); // (the same start works for an idle hero)
    expect(applyStartGathering(base(), 'mining', 'copper', T0)).not.toBeNull();
    expect(applyHuntStart(s1, 'demon_glade', 'shallow', T0)).toBeNull();
    expect(applyStartGathering(s1, 'mining', 'copper', T0)).toBeNull();
    expect(applyStartGathering(s1, 'woodcutting', 'common_wood', T0)).toBeNull();
  });

  it('a hero who is hunting or mining cannot start a job and is told what he is doing', () => {
    const hunting = withMats(base({ activeHuntingZone: 'demon_glade' }), { copper: 5 });
    const r = startCraftJob(hunting, 'refine', 'smelt_copper', 1, T0);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('busy');
    expect(r.busyWith).toBe('hunt');
    expect(startCraftJob(withMats(base({ activeOreId: 'copper' }), { copper: 5 }), 'refine', 'smelt_copper', 1, T0).busyWith).toBe('mining');
  });

  it('only one job at a time', () => {
    const s1 = startCraftJob(withMats(base(), { copper: 10 }), 'refine', 'smelt_copper', 1, T0).save!;
    expect(startCraftJob(s1, 'refine', 'smelt_copper', 1, T0).busyWith).toBe('craft');
  });

  it('an idle hero is not busy (the Garden is not a task)', () => {
    expect(heroActivity(base())).toBeNull();
  });

  it('a damaged job in a save is dropped on load', () => {
    expect(sanitizeCraftJob({ kind: 'refine', recipeId: 'x', qty: 0, done: 0, startedAt: T0, unitMs: 1000 })).toBeNull();
    expect(sanitizeCraftJob({ kind: 'nope', recipeId: 'x', qty: 1, done: 0, startedAt: T0, unitMs: 1000 })).toBeNull();
    expect(sanitizeCraftJob({ kind: 'refine', recipeId: 'smelt_copper', qty: 2, done: 1, startedAt: T0, unitMs: 1000 })).not.toBeNull();
  });
});
