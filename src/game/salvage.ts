import { EquippedGear, GearItem, gearBySlot } from './gear';
import { MaterialId } from './materials';
import { Rarity } from './rarity';

// Salvage never returns the full recipe cost back — only a fraction — to avoid an infinite refund loop.
export const SALVAGE_RATE = 0.45;

// Higher-rarity gear has a modest chance of also returning a pinch of essence or a refining gem.
export const SALVAGE_BONUS_CHANCE: Partial<Record<Rarity, number>> = {
  rare: 0.15,
  epic: 0.3,
  legendary: 0.5,
};

const TOOL_SLOTS = new Set(['pickaxe', 'axe', 'rod']);

export interface SalvageReturn {
  materials: Partial<Record<MaterialId, number>>;
  gold?: number;
}

export function getSalvageReturn(item: GearItem): SalvageReturn {
  const materials: Partial<Record<MaterialId, number>> = {};
  for (const [mid, qty] of Object.entries(item.recipe?.materials ?? {})) {
    materials[mid as MaterialId] = Math.max(1, Math.floor((qty as number) * SALVAGE_RATE));
  }
  return { materials };
}

export function isGearEquipped(equipped: EquippedGear, itemId: string): boolean {
  return Object.values(equipped).includes(itemId);
}

export type SalvageBlockReason = 'equipped' | 'onlyTool' | null;

export function salvageBlockReason(item: GearItem, equipped: EquippedGear, inventory: Record<string, number>): SalvageBlockReason {
  if (isGearEquipped(equipped, item.id)) return 'equipped';
  if (TOOL_SLOTS.has(item.slot)) {
    const totalOwned = gearBySlot(item.slot).reduce((sum, g) => sum + (inventory[g.id] ?? 0), 0);
    if (totalOwned <= 1) return 'onlyTool';
  }
  return null;
}

export function hasSalvageValue(item: GearItem): boolean {
  return !!item.recipe && Object.keys(item.recipe.materials ?? {}).length > 0;
}

export function canSalvage(item: GearItem, equipped: EquippedGear, inventory: Record<string, number>): boolean {
  if (!hasSalvageValue(item)) return false;
  if ((inventory[item.id] ?? 0) <= 0) return false;
  return salvageBlockReason(item, equipped, inventory) === null;
}
