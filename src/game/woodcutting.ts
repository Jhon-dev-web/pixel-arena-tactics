import { MaterialId } from './materials';

export interface WoodTierDef {
  id: MaterialId;
  nameKey: string;
  // Woodcutting SKILL level required (see skills.ts) — not character level. Profession tools don't
  // exist as a mechanic; gathering power scales purely with this skill level.
  requiredLevel: number;
}

// Mirrors ores.ts exactly — same tier count, same level gates.
export const WOOD_TIERS: WoodTierDef[] = [
  { id: 'common_wood', nameKey: 'wood_common', requiredLevel: 1 },
  { id: 'oak_wood', nameKey: 'wood_oak', requiredLevel: 10 },
  { id: 'ebony_wood', nameKey: 'wood_ebony', requiredLevel: 25 },
  { id: 'elven_wood', nameKey: 'wood_elven', requiredLevel: 50 },
  // See ores.ts's obsidian comment — same reasoning, kept in sync (was 75, the profession cap itself).
  { id: 'ancient_wood', nameKey: 'wood_ancient', requiredLevel: 55 },
];

export const DEFAULT_WOOD_TIER = WOOD_TIERS[0].id;

export function getWoodTier(id: string): WoodTierDef | undefined {
  return WOOD_TIERS.find((t) => t.id === id);
}

export function isWoodTierUnlocked(tier: WoodTierDef, woodcuttingSkillLevel: number): boolean {
  return woodcuttingSkillLevel >= tier.requiredLevel;
}
