import type { SaveData } from '../game/engine';
import { GEAR, GearItem } from '../game/gear';

// The Forge list folds the recipes the hero has moved past into "Anteriores (n)" so the list opens on what is worth forging now (a level 40 hero used to scroll 31 weapons from tier 1). It is a VIEW: nothing is
// removed, the fold is one tap away, and a recipe the hero still needs never goes in it.
//
// A recipe is a candidate for the fold when the hero's level already passes its requirement (`recipe.requiredLevel`) AND it is not needed. "Needed" means, per chain of pieces (each tier takes the piece of the tier
// before as an ingredient, `recipe.items`):
//   - the top recipe the hero's level opens (no other open recipe takes it as an ingredient) is the target of its chain and always stays on the list;
//   - when the hero does not own the target yet, its ingredients stay too, and so on down the chain for as long as the hero does not hold enough copies of the ingredient (worn copies count: the Forge
//     tells the hero to take it off, forgeWornHint.ts);
//   - a recipe the level does not open yet is never folded.
// So a hero with nothing in hand sees every tier of every line (a class change shows the whole other line), and the fold only grows as the hero climbs a chain.

type SaveShape = Pick<SaveData, 'gearInstances'>;

export function forgeableRecipes(): GearItem[] {
  return GEAR.filter((g) => g.recipe && !g.unique);
}

/** The ids of the recipes the list keeps behind the "Anteriores" fold for this hero. Pure; `recipes` defaults to every forgeable recipe (the fold is decided over all of them, never over a filtered view). */
export function earlierRecipeIds(save: SaveShape, level: number, recipes: GearItem[] = forgeableRecipes()): Set<string> {
  const byId = new Map(recipes.map((g) => [g.id, g]));
  const open = (g: GearItem): boolean => (g.recipe?.requiredLevel ?? 0) <= level;
  const owned = new Map<string, number>();
  for (const inst of Object.values(save.gearInstances ?? {})) owned.set(inst.templateId, (owned.get(inst.templateId) ?? 0) + 1);
  const have = (id: string): number => owned.get(id) ?? 0;

  // which open recipes take a piece as an ingredient
  const takenByOpen = new Set<string>();
  for (const g of recipes) {
    if (!open(g)) continue;
    for (const id of Object.keys(g.recipe?.items ?? {})) takenByOpen.add(id);
  }

  const needed = new Set<string>();
  const walked = new Set<string>();
  const walk = (g: GearItem): void => {
    walked.add(g.id);
    for (const [id, need] of Object.entries(g.recipe?.items ?? {})) {
      const ing = byId.get(id);
      if (!ing) continue;
      needed.add(id);
      if (have(id) < need && !walked.has(id)) walk(ing);
    }
  };
  for (const g of recipes) {
    if (!open(g) || takenByOpen.has(g.id)) continue; // not the top of its chain
    needed.add(g.id);
    if (have(g.id) === 0) walk(g);
  }

  const earlier = new Set<string>();
  for (const g of recipes) if (open(g) && !needed.has(g.id)) earlier.add(g.id);
  return earlier;
}
