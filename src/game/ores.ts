import { MaterialId } from './materials';

export interface OreTierDef {
  id: MaterialId;
  nameKey: string;
  // Mining SKILL level required (see skills.ts) — not character level. Profession tools don't exist
  // as a mechanic; gathering power scales purely with this skill level.
  requiredLevel: number;
}

export const ORE_TIERS: OreTierDef[] = [
  { id: 'copper', nameKey: 'ore_copper', requiredLevel: 1 },
  { id: 'iron', nameKey: 'ore_iron', requiredLevel: 10 },
  { id: 'silver', nameKey: 'ore_silver', requiredLevel: 25 },
  { id: 'gold_ore', nameKey: 'ore_gold', requiredLevel: 50 },
  // Was 75 (= the profession cap itself): under the recalibrated 45-day curve (see skills.ts) that made
  // the Tier 5 weapon/armor recipe (gear.ts voidsteel_blade/voidsteel_plate, which need obsidian) require
  // BOTH Mining and Woodcutting fully maxed at once — unreachable within a 45-day season, so Tier 5 gear,
  // CP and Dungeon progress all stalled around Day 13 (see CHAMPIONSHIP_45_DAY_DAY13_WALL_DIAGNOSIS.md).
  // 55 keeps Obsidian a late, deliberate unlock without requiring the profession cap to get there.
  { id: 'obsidian', nameKey: 'ore_obsidian', requiredLevel: 55 },
];

export const DEFAULT_ORE_TIER = ORE_TIERS[0].id;

export function getOreTier(id: string): OreTierDef | undefined {
  return ORE_TIERS.find((t) => t.id === id);
}

export function isOreTierUnlocked(tier: OreTierDef, miningSkillLevel: number): boolean {
  return miningSkillLevel >= tier.requiredLevel;
}
