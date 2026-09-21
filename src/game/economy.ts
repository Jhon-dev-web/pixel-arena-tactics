import { MATERIALS, MaterialId } from './materials';
import { REFINING_RECIPES } from './refining';

// ECONOMIC REFERENCE VALUES (baseGoldValue). One central place, used to AUDIT and VALIDATE the economy (delivery orders,
// crafting, reforge, future P2P analysis). It is a reference, not a price:
//   - nothing here sells, buys, converts or pays anything. No NPC ever buys a material at this value, and no code path
//     may turn it into Gold. It is pure data + pure functions that never receive or return a save.
//   - a future player market is free to trade above or below it.
//
// ANCHOR: 1 Farrapo de Couro = REFERENCE_ANCHOR_GOLD (2). The Farrapo is the most abundant, lowest-tier, most replaceable
// drop (about 53/h) and the base of the cheapest sink (10 -> 1 Dust), so it is the natural unit of account. 2 is a low
// value on purpose: it sits under the legacy catalog sell value of the Farrapo (4) and near what a delivery order
// actually hands out per unit of cargo weight (about 2 to 2.6 Gold per scrap-equivalent).
//
// RAW materials: value = ANCHOR * sqrt(S * D), rounded to 0.5 Gold, where
//   S = how scarce it is relative to the Farrapo, measured from units/day of a dedicated active day (Hunting emission per
//       hour, Garden 4 plots x 2 harvests, Mining/Woodcutting at the power of the level that unlocks the tier);
//   D = the designed rarity ratio (the legacy catalog sellValue over the Farrapo's, used ONLY as a ratio; that field is not
//       wired to any sale).
//   The geometric mean keeps either lens from dominating. Ore and wood ladders are kept non-decreasing by tier.
//   Garden ingredients are then capped by the only REAL Gold prices in the game: the Shop sells small_hp for 30 and large_hp
//   for 80, and the craft of the same potion costs 18 / 48 Gold plus 3 herbs / 2 mushrooms, so an herb cannot be worth more
//   than (30-18)/3 = 4 and a mushroom more than (80-48)/2 = 16 without the craft costing more than buying it. The Root shares
//   the mushroom's value (same scarcity and rarity class); the Energy Herb keeps its measured ratio to the Herb.
// PROCESSED materials are NOT in this table: they are derived from their cheapest real recipe, so they can never fall
// below their ingredients plus the Gold the recipe makes you spend:
//   processedValue = (sum of ingredient values + recipe Gold fee) * (1 + PROCESSING_PREMIUM), per unit produced.
// docs/ECONOMIC_REFERENCE.md has the derivation table.

export const REFERENCE_ANCHOR_GOLD = 2;
export const PROCESSING_PREMIUM = 0.1;

export const RAW_REFERENCE_GOLD: Partial<Record<MaterialId, number>> = {
  // Hunting
  leather_scrap: 2,
  bone_fragment: 2,
  demon_claw: 4.5,
  concentrated_blood: 4.5,
  demon_core: 25,
  corrupted_crystal: 24.5,
  // Garden
  common_herb: 4,
  energy_herb: 3,
  uncommon_root: 16,
  crimson_mushroom: 16,
  rare_flower: 41.5,
  // Mining
  copper: 3.5,
  iron: 3.5,
  silver: 4,
  gold_ore: 5.5,
  obsidian: 7,
  // Woodcutting
  common_wood: 3.5,
  oak_wood: 4,
  ebony_wood: 4.5,
  elven_wood: 5.5,
  ancient_wood: 6,
};

const cache = new Map<MaterialId, number>();
const roundUpHalf = (n: number): number => Math.ceil(n * 2 - 1e-9) / 2;

// Cheapest way to make one unit of a processed material, in reference Gold: ingredients + the Gold the recipe charges.
export function processedFloor(id: MaterialId): number | null {
  const recipes = REFINING_RECIPES.filter((r) => r.output === id);
  if (recipes.length === 0) return null;
  let best = Infinity;
  for (const r of recipes) {
    let ingredients = 0;
    for (const [m, q] of Object.entries(r.input) as [MaterialId, number][]) ingredients += q * baseGoldValue(m);
    best = Math.min(best, (ingredients + r.cost) / r.outputQty);
  }
  return best;
}

export function baseGoldValue(id: MaterialId): number {
  const hit = cache.get(id);
  if (hit !== undefined) return hit;
  const raw = RAW_REFERENCE_GOLD[id];
  let v: number;
  if (raw !== undefined) v = raw;
  else {
    const floor = processedFloor(id);
    if (floor === null) throw new Error(`no reference value for ${id}`);
    v = roundUpHalf(floor * (1 + PROCESSING_PREMIUM));
  }
  cache.set(id, v);
  return v;
}

export const ECONOMIC_MATERIALS: MaterialId[] = MATERIALS.map((m) => m.id);

// Reference value of a bundle of materials (a delivery's cargo, a reforge, a recipe's ingredients).
export function cargoReferenceValue(items: Partial<Record<MaterialId, number>>): number {
  let total = 0;
  for (const [m, q] of Object.entries(items) as [MaterialId, number][]) total += q * baseGoldValue(m);
  return total;
}
