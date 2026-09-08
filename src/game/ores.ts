import { MaterialId } from './materials';
import { getGear } from './gear';

export interface OreTierDef {
  id: MaterialId;
  nameKey: string;
  requiredLevel: number;
  pickaxeId: string;
}

export const ORE_TIERS: OreTierDef[] = [
  { id: 'copper', nameKey: 'ore_copper', requiredLevel: 1, pickaxeId: 'rusty_pickaxe' },
  { id: 'iron', nameKey: 'ore_iron', requiredLevel: 10, pickaxeId: 'iron_pickaxe' },
  { id: 'silver', nameKey: 'ore_silver', requiredLevel: 25, pickaxeId: 'steel_pickaxe' },
  { id: 'gold_ore', nameKey: 'ore_gold', requiredLevel: 50, pickaxeId: 'mithril_pickaxe' },
  { id: 'obsidian', nameKey: 'ore_obsidian', requiredLevel: 75, pickaxeId: 'runic_pickaxe' },
];

export const DEFAULT_ORE_TIER = ORE_TIERS[0].id;

export function getOreTier(id: string): OreTierDef | undefined {
  return ORE_TIERS.find((t) => t.id === id);
}

export function isOreTierUnlocked(tier: OreTierDef, level: number, inventory: Record<string, number>): boolean {
  if (level < tier.requiredLevel) return false;
  const pickaxe = getGear(tier.pickaxeId);
  if (pickaxe?.recipe) return (inventory[tier.pickaxeId] ?? 0) > 0;
  return true;
}

export function oreTierMissingPickaxe(tier: OreTierDef, level: number, inventory: Record<string, number>): boolean {
  if (level < tier.requiredLevel) return false;
  const pickaxe = getGear(tier.pickaxeId);
  return !!pickaxe?.recipe && (inventory[tier.pickaxeId] ?? 0) <= 0;
}
