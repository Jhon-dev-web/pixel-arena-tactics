import { GearItem } from './gear';
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

export function hasSalvageValue(item: GearItem): boolean {
  return !!item.recipe && Object.keys(item.recipe.materials ?? {}).length > 0;
}
