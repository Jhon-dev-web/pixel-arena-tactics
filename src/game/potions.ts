import { ConsumableId } from './consumables';
import { MaterialId } from './materials';

export interface PotionRecipe {
  id: ConsumableId;
  input: Partial<Record<MaterialId, number>>;
  cost: number;
  requiredLevel: number;
}

// Alchemy consumables — Garden herbs are the primary ingredient, tying the two systems together
// (see garden.ts). Unlike Shop potions (flat gold, always available), these scale with how much
// Garden/Hunting effort the player has put in, matching the "Loja = básico, Forja = melhor" split.
export const POTION_RECIPES: PotionRecipe[] = [
  { id: 'xp_potion', input: { common_herb: 3 }, cost: 30, requiredLevel: 1 },
  { id: 'greater_elixir', input: { uncommon_root: 2 }, cost: 100, requiredLevel: 15 },
  { id: 'strength_elixir', input: { rare_flower: 1, demon_claw: 2 }, cost: 250, requiredLevel: 35 },
];

export function getPotionRecipe(id: string): PotionRecipe | undefined {
  return POTION_RECIPES.find((r) => r.id === id);
}
