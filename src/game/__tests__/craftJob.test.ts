import { describe, expect, it } from 'vitest';
import { defaultSave, normalizeSave, SaveData } from '../engine';
import { cancelCraftJob, clampCraftQty, craftBlock, craftUnitsDue, maxCraftQty, prepaidForgeSave, resolveCraftJob, settleForgeUnit, startCraftJob } from '../craftJob';
import { forgeAction } from '../itemActions';
import { createItemApi } from '../itemServer';
import { getGear } from '../gear';
import { emptyMaterials } from '../materials';
import { CRAFT_SECONDS_OVERRIDES } from '../tunables';
import { recipeStock } from './recipeStock';

const T0 = 1_800_000_000_000;
const base = (over: Partial<SaveData> = {}): SaveData => ({ ...defaultSave(), gold: 10_000, ...over });
const withMats = (s: SaveData, m: Record<string, number>): SaveData => ({ ...s, materials: { ...emptyMaterials(), ...s.materials, ...m } });

describe('batch production: refining', () => {
  it('takes the whole cost at the start and delivers one unit per second', () => {
    const s0 = withMats(base(), { copper: 20 });
    const started = startCraftJob(s0, 'refine', 'smelt_copper', 3, T0);
    expect(started.ok).toBe(true);
    const s1 = started.save!;
    expect(s1.materials.copper).toBe(5);
    expect(s1.gold).toBe(10_000 - 3 * 35);
    expect(s1.craftJob).toMatchObject({ qty: 3, done: 0, unitMs: 1000 });
    expect(resolveCraftJob(s1, T0 + 900)).toBe(s1); // nothing yet
    const s2 = resolveCraftJob(s1, T0 + 1500);
    expect(s2.materials.copper_bar ?? 0).toBe(1);
    expect(s2.craftJob?.done).toBe(1);
    const s3 = resolveCraftJob(s2, T0 + 3000);
    expect(s3.materials.copper_bar).toBe(3);
    expect(s3.craftJob).toBeUndefined();
    expect(s3.quests.daily.forge).toBe(3);
  });

  it('finishes units while the game was closed (resolved on load from the timestamps)', () => {
    const s1 = startCraftJob(withMats(base(), { copper: 20 }), 'refine', 'smelt_copper', 4, T0).save!;
    const reloaded = normalizeSave(JSON.parse(JSON.stringify(s1)));
    expect(reloaded.craftJob?.qty).toBe(4);
    const later = resolveCraftJob(reloaded, T0 + 60 * 60 * 1000);
    expect(later.materials.copper_bar).toBe(4);
    expect(later.craftJob).toBeUndefined();
  });

  it('cancel refunds the units not made yet; the made ones stay', () => {
    const s1 = startCraftJob(withMats(base(), { copper: 20 }), 'refine', 'smelt_copper', 4, T0).save!;
    const s2 = resolveCraftJob(s1, T0 + 1000); // 1 made
    const { save: s3, refundedUnits } = cancelCraftJob(s2);
    expect(refundedUnits).toBe(3);
    expect(s3.craftJob).toBeUndefined();
    expect(s3.materials.copper_bar).toBe(1);
    expect(s3.materials.copper).toBe(20 - 5);
    expect(s3.gold).toBe(10_000 - 35);
  });

  it('Max is what the materials, gold and room allow', () => {
    expect(maxCraftQty(withMats(base(), { copper: 23 }), 'refine', 'smelt_copper')).toBe(4); // materials: 23 / 5
    expect(maxCraftQty(withMats(base({ gold: 70 }), { copper: 500 }), 'refine', 'smelt_copper')).toBe(2); // gold: 70 / 35
    expect(maxCraftQty(withMats(base(), { copper: 2 }), 'refine', 'smelt_copper')).toBe(0);
  });

  it('a stale picker value (13) is held to what the hero can afford now (6): the label, the action and the start agree', () => {
    // the picker once held 13; the materials have since shrunk to 6 units' worth
    const s = withMats(base(), { copper: 30 });
    expect(maxCraftQty(s, 'refine', 'smelt_copper')).toBe(6);
    const n = clampCraftQty(s, 'refine', 'smelt_copper', 13);
    expect(n).toBe(6);
    expect(craftBlock(s, 'refine', 'smelt_copper', n)).toBeNull();
    expect(startCraftJob(s, 'refine', 'smelt_copper', n, T0).ok).toBe(true);
    // the raw value would have been refused, producing nothing: that is the bug the clamp prevents
    expect(startCraftJob(s, 'refine', 'smelt_copper', 13, T0).ok).toBe(false);
    expect(craftBlock(s, 'refine', 'smelt_copper', 13)).not.toBeNull();
  });

  it('clampCraftQty keeps the value in 1..max, and 1 when nothing is affordable', () => {
    const s = withMats(base(), { copper: 23 });
    expect(clampCraftQty(s, 'refine', 'smelt_copper', 0)).toBe(1);
    expect(clampCraftQty(s, 'refine', 'smelt_copper', 3)).toBe(3);
    expect(clampCraftQty(s, 'refine', 'smelt_copper', 99)).toBe(4);
    expect(clampCraftQty(s, 'refine', 'smelt_copper', Number.NaN)).toBe(1);
    expect(clampCraftQty(withMats(base(), { copper: 2 }), 'refine', 'smelt_copper', 5)).toBe(1);
  });

  it('a per-recipe override changes the time of one recipe only', () => {
    CRAFT_SECONDS_OVERRIDES.smelt_copper = 5;
    try {
      expect(startCraftJob(withMats(base(), { copper: 5 }), 'refine', 'smelt_copper', 1, T0).save!.craftJob!.unitMs).toBe(5000);
      expect(startCraftJob(withMats(base(), { leather_scrap: 3 }), 'refine', 'tan_leather', 1, T0).save!.craftJob!.unitMs).toBe(1000);
    } finally {
      delete CRAFT_SECONDS_OVERRIDES.smelt_copper;
    }
  });
});

describe('batch production: potions', () => {
  it('makes the consumable per unit', () => {
    const s1 = startCraftJob(withMats(base(), { common_herb: 9 }), 'potion', 'small_hp', 3, T0).save!;
    expect(s1.materials.common_herb).toBe(0);
    const s2 = resolveCraftJob(s1, T0 + 3000);
    expect(s2.consumables.small_hp).toBe(3);
    expect(s2.craftJob).toBeUndefined();
  });
});

describe('batch production: the forge (one roll per finished unit)', () => {
  it('pays the batch once, makes one separate piece per unit, and cancelling refunds the rest', async () => {
    const item = getGear('bronze_dagger');
    const s0 = withMats(base({ gold: 1000 }), recipeStock('bronze_dagger', 3));
    const s1 = startCraftJob(s0, 'forge', 'bronze_dagger', 3, T0).save!;
    expect(s1.gold).toBe(1000 - 3 * item.cost);
    let cur = s1;
    const api = createItemApi();
    // offline build: the device rolls (no server authority), exactly as a single forge does
    const deliver = async (): Promise<void> => {
      const r = await forgeAction(api, () => prepaidForgeSave(cur), 'bronze_dagger', { level: 1 });
      expect(r.ok).toBe(true);
      cur = settleForgeUnit((r as { save: SaveData }).save);
    };
    expect(craftUnitsDue(cur.craftJob!, T0 + 1000)).toBe(1);
    await deliver();
    expect(Object.values(cur.gearInstances).filter((i) => i.templateId === 'bronze_dagger').length).toBeGreaterThanOrEqual(1);
    expect(cur.gold).toBe(1000 - 3 * item.cost); // the unit was not charged twice
    expect(cur.craftJob?.done).toBe(1);
    const { save: cancelled, refundedUnits } = cancelCraftJob(cur);
    expect(refundedUnits).toBe(2);
    expect(cancelled.gold).toBe(1000 - item.cost);
    expect(cancelled.craftJob).toBeUndefined();
  });
});
