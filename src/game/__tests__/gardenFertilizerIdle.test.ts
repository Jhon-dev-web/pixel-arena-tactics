import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeGardenSlotStatus, defaultSave, SaveData } from '../engine';
import { getPlant, plantHarvestXp } from '../garden';
import { applyFertilizer, applyHarvest, applyPlant } from '../gardenActions';
import { skillXpToReachLevel } from '../skills';

// The Fertilizer is a TIME saving. A visitor who comes back after the plant's normal time anyway (every 12 h or 24 h, the two-visits-a-day player) has nothing to save, and used to pay a unit for nothing
// (measured on 29/10: +0%, the item looked fine and did nothing). Nothing on screen lights up when a consumable is a no-op, so this pins it: at those gaps it must pay, and for the frequent
// visitor (the saving did help) it must pay exactly what it always did.

const HOUR = 3600 * 1000;
const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const FLOWER_XP = plantHarvestXp(getPlant('rare_flower')!); // 12 h plant

// A Gardening-45 player with six open plots plants a rare flower in every plot at each visit `gapH` hours apart, with or without a Fertilizer on every planting; returns the Gardening XP gained in `days` days.
function xpGained(gapH: number, days: number, fertilize: boolean): number {
  let s: SaveData = { ...defaultSave(), skillXp: { mining: 0, woodcutting: 0, gardening: skillXpToReachLevel(45, 'gardening') } };
  const start = s.skillXp.gardening;
  for (let step = 0; step * gapH < days * 24; step++) {
    const at = NOW + step * gapH * HOUR;
    const ready = s.gardenSlots.map((_, i) => i).filter((i) => computeGardenSlotStatus(s, at, i).ready);
    const res = ready.length ? applyHarvest(s, ready, at) : null;
    if (res) s = { ...res.save, materials: Object.fromEntries(Object.keys(res.save.materials).map((m) => [m, 0])) as SaveData['materials'] }; // empty bag: the test measures the plots, not the inventory
    s = applyPlant(s, 'rare_flower', s.gardenSlots.map((_, i) => i), at) ?? s;
    if (fertilize) for (let i = 0; i < s.gardenSlots.length; i++) s = applyFertilizer({ ...s, consumables: { ...s.consumables, fertilizer: 1 } }, i, at) ?? s;
  }
  return s.skillXp.gardening - start;
}

describe('Fertilizer for a visitor who comes back after the plant is already done', () => {
  it.each([12, 24])('a visit every %i h gets more Gardening XP out of a fertilized planting than out of a plain one, and by less than the +40% the old guard allows', (gap) => {
    const plain = xpGained(gap, 14, false);
    const fertilized = xpGained(gap, 14, true);
    expect(plain).toBeGreaterThan(0);
    expect(fertilized).toBeGreaterThan(plain);
    expect(fertilized / plain).toBeLessThan(1.4);
  });

  it('pays the extra on the harvest itself, and only on a plot that was fertilized', () => {
    let s: SaveData = { ...defaultSave(), skillXp: { mining: 0, woodcutting: 0, gardening: skillXpToReachLevel(45, 'gardening') } };
    s = applyPlant(s, 'rare_flower', [0, 1], NOW)!;
    s = applyFertilizer({ ...s, consumables: { ...s.consumables, fertilizer: 1 } }, 0, NOW)!; // plot 0 only
    const res = applyHarvest(s, [0, 1], NOW + 12 * HOUR)!;
    const xp = (slot: number) => res.harvested.find((h) => h.slot === slot)!.xp;
    expect(xp(1)).toBe(FLOWER_XP);
    expect(xp(0)).toBeGreaterThan(FLOWER_XP);
  });

  it('a visitor the saving DID help (the plant would still be growing without it) gets exactly the plant\'s own XP: the frequent visitors do not move', () => {
    for (const hoursLater of [6, 8, 11]) { // harvested 6 h (the Fertilizer's ready time), 8 h or 11 h after planting a 12 h plant: every one of them is before the plant's own 12th hour
      let s: SaveData = { ...defaultSave(), skillXp: { mining: 0, woodcutting: 0, gardening: skillXpToReachLevel(45, 'gardening') } };
      s = applyPlant(s, 'rare_flower', [0], NOW)!; // 12 h plant, 6 h with the Fertilizer
      s = applyFertilizer({ ...s, consumables: { ...s.consumables, fertilizer: 1 } }, 0, NOW)!;
      const at = NOW + hoursLater * HOUR;
      const res = applyHarvest(s, [0], at)!;
      expect(res.harvested[0].xp).toBe(FLOWER_XP);
    }
  });
});
