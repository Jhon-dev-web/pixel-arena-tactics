import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSave, normalizeSave, playerLevel, SaveData } from '../engine';
import { applyClaimGathering, applyStartGathering } from '../gathering';
import { applyHarvest, applyPlant } from '../gardenActions';
import { applyCraftPotion } from '../craftActions';
import { POTION_RECIPES } from '../potions';
import { skillLevel, skillXpToReachLevel } from '../skills';
import { MAX_GARDEN_PLOTS, PLANTS } from '../garden';
import { ORE_TIERS } from '../ores';
import { WOOD_TIERS } from '../woodcutting';
import { emptyMaterials } from '../materials';
import { toUploadBlob } from '../saveUpload';
import { extractMetrics, professionScores } from '../../../supabase/functions/_shared/progress/metrics';
import { BOUNDS, professionXpPerHour } from '../../../supabase/functions/_shared/progress/bounds';
import T from '../tunables';

// Rodada 20 (the League ranks Mining, Woodcutting and Gardening apart, by TOTAL profession XP): the score never ties at the cap, nobody reaches the cap in 60 days, and a specialist is
// never held back by his HERO level.
const HOUR = 3600 * 1000;
const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();
const MAX = T.skills.maxLevel;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('profession XP keeps counting past the level cap, so the ranking never ties there', () => {
  it('a gathering session at the cap still adds its XP and the level stays at the cap', () => {
    for (const [kind, id] of [['mining', 'obsidian'], ['woodcutting', 'ancient_wood']] as const) {
      const xp0 = skillXpToReachLevel(MAX, kind) + 500;
      const base: SaveData = { ...defaultSave(), skillXp: { ...defaultSave().skillXp, [kind]: xp0 } };
      const started = applyStartGathering(base, kind, id, NOW - 6 * HOUR)!.save;
      const claimed = applyClaimGathering(started, kind, NOW)!;
      expect(claimed.units).toBeGreaterThan(100);
      expect(claimed.save.skillXp[kind]).toBe(xp0 + claimed.units * T.skills.xpPerUnit);
      expect(skillLevel(claimed.save.skillXp[kind], kind)).toBe(MAX);
    }
  });

  it('a Garden harvest at the cap still adds its XP', () => {
    const xp0 = skillXpToReachLevel(MAX, 'gardening') + 10;
    let s: SaveData = { ...defaultSave(), skillXp: { ...defaultSave().skillXp, gardening: xp0 } };
    s = applyPlant(s, 'common_herb', [0], NOW - 3 * HOUR)!;
    const res = applyHarvest(s, [0], NOW)!;
    expect(res.save.skillXp.gardening).toBeGreaterThan(xp0);
    expect(skillLevel(res.save.skillXp.gardening, 'gardening')).toBe(MAX);
  });

  it('the server reads two heroes at the cap with different XP as different scores (level 75 for both)', () => {
    const at = (xp: number) => normalizeSave({ ...defaultSave(), skillXp: { mining: xp, woodcutting: 0, gardening: 0 } });
    const a = extractMetrics(toUploadBlob(at(skillXpToReachLevel(MAX, 'mining') + 1_000)))!;
    const b = extractMetrics(toUploadBlob(at(skillXpToReachLevel(MAX, 'mining') + 2_000)))!;
    expect(a.miningLevel).toBe(MAX);
    expect(b.miningLevel).toBe(MAX);
    const [sa] = professionScores(a);
    const [sb] = professionScores(b);
    expect(sb.xp).toBeGreaterThan(sa.xp);
  });
});

describe('nobody reaches the cap within 60 days, even at the theoretical rate', () => {
  it('Mining / Woodcutting: 24 hours a day for 60 days at the best XP per hour the bounds allow stops short of level 75', () => {
    let xp = 0;
    for (let h = 0; h < 60 * 24; h++) xp += professionXpPerHour('mining', skillLevel(xp, 'mining'));
    expect(skillLevel(xp, 'mining')).toBeLessThan(MAX);
    xp = 0;
    for (let h = 0; h < 60 * 24; h++) xp += professionXpPerHour('woodcutting', skillLevel(xp, 'woodcutting'));
    expect(skillLevel(xp, 'woodcutting')).toBeLessThan(MAX);
  });

  it('Gardening: six plots grown 24 hours a day for 60 days with the speed perks and no Fertilizer stop short of level 75; only a Fertilizer on EVERY planting could', () => {
    const noFertilizer = MAX_GARDEN_PLOTS * BOUNDS.gardenXpPerPlotHour * (BOUNDS.gardenSpeedFactor / 2);
    expect(noFertilizer * 60 * 24).toBeLessThan(skillXpToReachLevel(MAX, 'gardening'));
    const everyPlanting = MAX_GARDEN_PLOTS * BOUNDS.gardenXpPerPlotHour * BOUNDS.gardenSpeedFactor;
    expect(everyPlanting * 60 * 24).toBeGreaterThan(skillXpToReachLevel(MAX, 'gardening'));
  });

  it('the fastest specialist of the simulation (docs/BALANCE_CHANGES.md Rodada 20) is level 65 to 72 on day 60: the XP it reaches sits inside those levels', () => {
    // Mining owner 75 thousand XP, Gardening 31 thousand XP at day 60 (npm run sim:long, specialists)
    expect(skillLevel(75_000, 'mining')).toBeGreaterThanOrEqual(65);
    expect(skillLevel(75_000, 'mining')).toBeLessThanOrEqual(72);
    expect(skillLevel(31_000, 'gardening')).toBeGreaterThanOrEqual(65);
    expect(skillLevel(31_000, 'gardening')).toBeLessThanOrEqual(72);
  });

  it('the first 50 levels cost what they always cost (the ore tiers and the plots open when they did), only the top got steeper', () => {
    expect(Math.round(skillXpToReachLevel(50, 'mining'))).toBe(1963);
    expect(Math.round(skillXpToReachLevel(45, 'gardening'))).toBe(1786);
    expect(Math.round(skillXpToReachLevel(60, 'mining'))).toBe(3856); // the obsidian door (60) opens after the same XP as before
    expect(skillXpToReachLevel(75, 'mining')).toBeGreaterThan(150_000);
  });
});

describe('a specialist is never held back by his hero level', () => {
  const lvl1 = (): SaveData => ({ ...defaultSave(), xp: 0 });

  it('every ore tier, wood tier, plant and plot opens on the PROFESSION level; a level-1 hero with the profession level can use all of them', () => {
    expect(playerLevel(lvl1().xp)).toBe(1);
    for (const tier of ORE_TIERS) {
      const s: SaveData = { ...lvl1(), skillXp: { ...lvl1().skillXp, mining: skillXpToReachLevel(tier.requiredLevel, 'mining') } };
      expect(applyStartGathering(s, 'mining', tier.id, NOW), tier.id).not.toBeNull();
    }
    for (const tier of WOOD_TIERS) {
      const s: SaveData = { ...lvl1(), skillXp: { ...lvl1().skillXp, woodcutting: skillXpToReachLevel(tier.requiredLevel, 'woodcutting') } };
      expect(applyStartGathering(s, 'woodcutting', tier.id, NOW), tier.id).not.toBeNull();
    }
    const gardener: SaveData = { ...lvl1(), skillXp: { ...lvl1().skillXp, gardening: skillXpToReachLevel(MAX, 'gardening') } };
    for (const plant of PLANTS) expect(applyPlant(gardener, plant.id, [0], NOW), plant.id).not.toBeNull();
    expect(applyPlant(gardener, 'common_herb', [MAX_GARDEN_PLOTS - 1], NOW)).not.toBeNull(); // the sixth plot
  });

  it('the Fertilizer, the Gatherer Brew and the Prospector\'s Tonic ask for no hero level, and a level-1 hero can make them', () => {
    const mats = { ...emptyMaterials(), bone_fragment: 9, common_herb: 9, swift_grass: 9, silver: 9, oak_wood: 9, iron_thistle: 9, gold_blossom: 9 };
    const s: SaveData = { ...lvl1(), gold: 1000, materials: mats };
    for (const id of ['fertilizer', 'gatherer_brew', 'prospector_tonic']) {
      const r = POTION_RECIPES.find((x) => x.id === id)!;
      expect(r.requiredLevel, id).toBeLessThanOrEqual(1);
      expect(applyCraftPotion(s, id).ok, id).toBe(true);
    }
  });
});
