import { GearItem, getGear } from './gear';
import T from './tunables';
import { MaterialId } from './materials';
import { Rarity } from './rarity';

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

// A piece without a recipe of its own (a unique) is salvaged like its forged twin (`salvageLike`).
const salvageSource = (item: GearItem): GearItem => (item.salvageLike ? getGear(item.salvageLike) ?? item : item);

export function getSalvageReturn(item: GearItem): SalvageReturn {
  const materials: Partial<Record<MaterialId, number>> = {};
  // Never the full recipe cost back (no infinite refund loop): floor(quantity x T.economySinks.salvageRecoveryRate)
  // per recipe material, with NO minimum. Small quantities can therefore return nothing (1 or 2 -> 0 at 45%);
  // materials that round to 0 are simply left out. Based on the recipe/template, whichever instance is salvaged.
  for (const [mid, qty] of Object.entries(salvageSource(item).recipe?.materials ?? {})) {
    const back = Math.floor((qty as number) * T.economySinks.salvageRecoveryRate);
    if (back > 0) materials[mid as MaterialId] = back;
  }
  return { materials };
}

export function hasSalvageValue(item: GearItem): boolean {
  const src = salvageSource(item);
  return !!src.recipe && Object.keys(src.recipe.materials ?? {}).length > 0;
}
