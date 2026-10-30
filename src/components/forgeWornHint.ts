import type { SaveData } from '../game/engine';
import type { GearItem } from '../game/gear';
import { isInstanceEquipped } from '../game/gearInstances';

// The forge never consumes a piece the hero is WEARING (gearInstances.selectIngredientInstances skips equipped ones, planForgeIngredients too). A player who wears the previous-tier piece sees the
// ingredient as missing and cannot tell that taking it off is enough. This decides which ingredient rows get the "you are wearing this" note. Pure: no rendering, same data as the plan.

export interface WornIngredientHint {
  templateId: string;
  need: number;
  free: number; // copies in the bag the forge can use
  worn: number; // copies on the hero
}

/** Ingredients of the recipe that are short ONLY because of worn copies: the free copies plus the worn ones would cover the recipe. Empty when nothing is short or taking off would not help. */
export function wornIngredientHints(save: Pick<SaveData, 'gearInstances' | 'equipped'>, item: GearItem): WornIngredientHint[] {
  const out: WornIngredientHint[] = [];
  for (const [templateId, need] of Object.entries(item.recipe?.items ?? {}) as [string, number][]) {
    let free = 0;
    let worn = 0;
    for (const i of Object.values(save.gearInstances ?? {})) {
      if (i.templateId !== templateId) continue;
      if (isInstanceEquipped(save, i.id)) worn++;
      else free++;
    }
    if (free < need && worn > 0 && free + worn >= need) out.push({ templateId, need, free, worn });
  }
  return out;
}
