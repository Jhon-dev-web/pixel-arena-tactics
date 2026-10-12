import { getGear } from '../gear';

// Enough of every material the recipe of `templateId` asks for (times `times`, plus a margin), so a forge test does not depend on the quantities of a recipe.
export function recipeStock(templateId: string, times = 1): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [m, n] of Object.entries(getGear(templateId)?.recipe?.materials ?? {})) out[m] = (n as number) * times + 5;
  return out;
}
