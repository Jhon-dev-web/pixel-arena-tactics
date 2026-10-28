import { getGear, maxRefineFor } from './gear';
import type { EquippedGear } from './gear';
import type { GearInstance } from './gearInstances';
import type { Rarity } from './rarity';

// THE EQUIPMENT INDEX (classes reform, phase 8, 28/10/2026): a DECLARED number that says how well equipped a hero is, used where the question is about equipment and not about power, today the Hunting sub-level gate
// (huntingZones.ts subLevelGearRequired). It reads only what the player forged, refined and rolled: the tier of each worn piece, its refine level and its rarity. It does not read the line of the weapon, the
// weight of the armor, a stat or an ability, so a mage, an archer and a warrior in gear of the same tier, refine and rarity have the SAME index, and no change to combat, abilities or classes can move it.
// (The CP is the opposite: measured from the stats, it moves every time combat changes, which is how the old gate went stale; it stays where it is useful - recommended CP, the Dungeon advice, the market.)
//
//   index = (sum over the 7 slots of  tier + REFINE_PER_LEVEL x refine + RARITY_BONUS[rarity]) / 7
//
// The divisor is ALWAYS 7 and an EMPTY slot counts 0: otherwise taking off the worst piece would raise the average and unlock more with less (gearIndex.test.ts takes a piece off and checks the index falls).
// The weights were read off the CP of the plate / sword ladder (scripts/sim/classReach.sim.ts, regression of ln CP on tier, refine and rarity: per tier 0.553, per refine level 0.056, rare 0.135, epic 0.322 (declared 0.65: the Rodada 26 promise of two sub-levels, itemBalance.test.ts),
// legendary 0.795, i.e. in tiers 0.10 / 0.24 / 0.58 / 1.44) and rounded; they are declared here and no longer follow the CP. The best gear in the game (tier 6 +12, every piece legendary) is BEST_GEAR_INDEX.
export const INDEX_SLOTS = ['weapon', 'armor', 'helmet', 'gloves', 'boots', 'shield', 'ring'] as const satisfies readonly (keyof EquippedGear)[];
export const REFINE_PER_LEVEL = 0.1;
export const RARITY_BONUS: Record<Rarity, number> = { common: 0, rare: 0.25, epic: 0.65, legendary: 1.4 };
export const TOP_TIER = 6;
export const TOP_REFINE = 12;
export const BEST_GEAR_INDEX = TOP_TIER + REFINE_PER_LEVEL * TOP_REFINE + RARITY_BONUS.legendary;

export interface IndexSave {
  equipped: EquippedGear;
  gearInstances: Record<string, GearInstance>;
}

export function pieceIndex(inst: GearInstance | undefined): number {
  if (!inst) return 0;
  return (getGear(inst.templateId)?.tier ?? 0) + REFINE_PER_LEVEL * Math.max(0, inst.upgrade) + (RARITY_BONUS[inst.rarity] ?? 0);
}

export function equipmentIndex(save: IndexSave): number {
  let sum = 0;
  for (const slot of INDEX_SLOTS) {
    const id = save.equipped[slot];
    sum += id ? pieceIndex(save.gearInstances[id]) : 0;
  }
  return Math.round((sum / INDEX_SLOTS.length) * 1000) / 1000;
}

// What a requirement means to a player: the smallest full set, of one tier, refine level and rarity, whose index reaches it. Common first; past what a common set can reach (tier 6 +12 = 7.2) the same set in a
// better rarity. (A mixed set with the same average passes too: the text says "must match".)
export interface GearSetLabel {
  tier: number;
  refine: number;
  rarity: Rarity;
}
export function gearSetFor(required: number): GearSetLabel {
  for (const rarity of ['common', 'rare', 'epic', 'legendary'] as Rarity[]) {
    for (let tier = 1; tier <= TOP_TIER; tier++) {
      const refine = Math.max(0, Math.ceil((required - tier - RARITY_BONUS[rarity]) / REFINE_PER_LEVEL - 1e-9));
      if (refine <= maxRefineFor({ tier })) return { tier, refine, rarity };
    }
  }
  return { tier: TOP_TIER, refine: TOP_REFINE, rarity: 'legendary' };
}
