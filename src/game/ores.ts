import { MaterialId } from './materials';

export interface OreTierDef {
  id: MaterialId;
  nameKey: string;
  // Mining SKILL level required (see skills.ts) — not character level, and no tool check anymore:
  // there is exactly one pickaxe, rusty_pickaxe, owned from the very start, forever.
  requiredLevel: number;
}

export const ORE_TIERS: OreTierDef[] = [
  { id: 'copper', nameKey: 'ore_copper', requiredLevel: 1 },
  { id: 'iron', nameKey: 'ore_iron', requiredLevel: 10 },
  { id: 'silver', nameKey: 'ore_silver', requiredLevel: 25 },
  { id: 'gold_ore', nameKey: 'ore_gold', requiredLevel: 50 },
  { id: 'obsidian', nameKey: 'ore_obsidian', requiredLevel: 75 },
];

export const DEFAULT_ORE_TIER = ORE_TIERS[0].id;

export function getOreTier(id: string): OreTierDef | undefined {
  return ORE_TIERS.find((t) => t.id === id);
}

export function isOreTierUnlocked(tier: OreTierDef, miningSkillLevel: number): boolean {
  return miningSkillLevel >= tier.requiredLevel;
}
