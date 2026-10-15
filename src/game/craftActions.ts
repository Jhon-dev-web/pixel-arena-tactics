import { playerLevel, SaveData } from './engine';
import { getRefiningRecipe } from './refining';
import { getPotionRecipe, potionRecipeInTier } from './potions';
import { CONSUMABLE_STACK, getConsumable, ConsumableId } from './consumables';
import { MaterialId, hasMaterials } from './materials';
import { addWithOverflow, stockIsEmpty } from './inventory';
import { recordPotion } from './stats';

// The Refining stations, Alchemy and the Shop as pure transitions on the save (the React handlers and the simulator call these very functions).
// Every one is a deliberate player action, so when the result does not fit the inventory it is REFUSED ('bag') and nothing is charged - never a silent
// loss. The inputs are taken out first, so a craft that eats a whole stack to make one item always has room for it.

export type CraftFailure = 'unknown' | 'gold' | 'level' | 'materials' | 'bag' | 'stack' | 'tier';

// Flat on purpose (tsconfig is not strict): ok=false => reason is set, ok=true => save is set.
export interface CraftResult {
  ok: boolean;
  reason?: CraftFailure;
  save?: SaveData;
}

const fail = (reason: CraftFailure): CraftResult => ({ ok: false, reason });

function takeMaterials(save: SaveData, input: Partial<Record<MaterialId, number>>): SaveData {
  const materials = { ...save.materials };
  for (const [mid, count] of Object.entries(input)) materials[mid as MaterialId] = (materials[mid as MaterialId] ?? 0) - (count as number);
  return { ...save, materials };
}

const countForge = (save: SaveData): SaveData['quests'] => ({ ...save.quests, daily: { ...save.quests.daily, forge: (save.quests.daily.forge ?? 0) + 1 } });

// One Furnace / Tannery / Alchemy-station / Dust / Carpentry conversion.
export function applyRefine(save: SaveData, recipeId: string, now?: number): CraftResult {
  const recipe = getRefiningRecipe(recipeId);
  if (!recipe) return fail('unknown');
  if (save.gold < recipe.cost) return fail('gold');
  if (playerLevel(save.xp) < recipe.requiredLevel) return fail('level');
  if (!hasMaterials(save.materials, recipe.input)) return fail('materials');
  const placed = addWithOverflow(takeMaterials(save, recipe.input), { materials: { [recipe.output]: recipe.outputQty } }, { now });
  if (!stockIsEmpty(placed.leftover)) return fail('bag');
  return { ok: true, save: { ...placed.save, gold: save.gold - recipe.cost, quests: countForge(save) } };
}

// One Alchemy craft (gold + plants / drops -> one consumable).
export function applyCraftPotion(save: SaveData, recipeId: string, now?: number): CraftResult {
  const recipe = getPotionRecipe(recipeId);
  if (!recipe) return fail('unknown');
  if (!potionRecipeInTier(recipe, save.highestDungeonFloor)) return fail('tier');
  if (save.gold < recipe.cost) return fail('gold');
  if (playerLevel(save.xp) < recipe.requiredLevel) return fail('level');
  if (!hasMaterials(save.materials, recipe.input)) return fail('materials');
  const placed = addWithOverflow(takeMaterials(save, recipe.input), { consumables: { [recipe.id]: 1 } }, { now });
  if (!stockIsEmpty(placed.leftover)) return fail('bag');
  return { ok: true, save: recordPotion({ ...placed.save, gold: save.gold - recipe.cost, quests: countForge(save) }) };
}

// One Shop purchase. CONSUMABLE_STACK is the Shop's own purchase cap per type (not the slot size).
export function applyBuyConsumable(save: SaveData, id: ConsumableId, now?: number): CraftResult {
  const def = getConsumable(id);
  if (!def || !def.purchasable) return fail('unknown');
  if (save.gold < def.cost) return fail('gold');
  if ((save.consumables[id] ?? 0) >= CONSUMABLE_STACK) return fail('stack');
  const placed = addWithOverflow(save, { consumables: { [id]: 1 } }, { now });
  if (!stockIsEmpty(placed.leftover)) return fail('bag');
  return {
    ok: true,
    save: {
      ...placed.save,
      gold: save.gold - def.cost,
      quests: { ...save.quests, daily: { ...save.quests.daily, purchases: (save.quests.daily.purchases ?? 0) + 1 } },
    },
  };
}
