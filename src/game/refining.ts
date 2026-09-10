import { MaterialId } from './materials';

export type RefiningStation = 'furnace' | 'tannery' | 'alchemy';

export interface RefiningRecipe {
  id: string;
  station: RefiningStation;
  output: MaterialId;
  outputQty: number;
  input: Partial<Record<MaterialId, number>>;
  cost: number;
  requiredLevel: number;
}

// Converts renewable raw materials (Mining ore, Hunting drops) into materials that higher-tier gear
// recipes need but that otherwise have no in-game source — closes the Battle Pass-only, one-time
// supply of steel/essence/dragon_scales, and gives leather_scrap a processing step into leather.
// Every input here is itself a renewable Mining/Hunting drop, so these stay repeatable indefinitely.
//
// Furnace gold costs are deliberately NOT scaled up per tier in proportion to raw-ore value. Mining
// Power (and so ore volume/hour) grows ~5x from iron to obsidian pickaxes, while Expedition gold/hour
// stays flat for the whole game (no level gating on EXPEDITIONS) — so a rising per-conversion price
// tracking raw-ore value would make higher tiers cost several hours of Expedition just to convert one
// mining session's haul. These costs instead keep hourly Furnace spend to a roughly flat ~25-42% of
// average Expedition income (see the App audit) — nominal cost per conversion falls as tier rises
// because conversions/hour rises faster, but the gold *burden* still climbs mildly with tier.
export const REFINING_RECIPES: RefiningRecipe[] = [
  { id: 'smelt_steel', station: 'furnace', output: 'steel', outputQty: 1, input: { iron: 5 }, cost: 30, requiredLevel: 25 },
  { id: 'smelt_silver', station: 'furnace', output: 'silver_ingot', outputQty: 1, input: { silver: 5 }, cost: 25, requiredLevel: 25 },
  { id: 'smelt_gold', station: 'furnace', output: 'gold_bar', outputQty: 1, input: { gold_ore: 5 }, cost: 15, requiredLevel: 50 },
  { id: 'smelt_obsidian', station: 'furnace', output: 'refined_obsidian', outputQty: 1, input: { obsidian: 5 }, cost: 10, requiredLevel: 75 },
  { id: 'tan_leather', station: 'tannery', output: 'leather', outputQty: 1, input: { leather_scrap: 3 }, cost: 20, requiredLevel: 1 },
  {
    id: 'synth_essence',
    station: 'alchemy',
    output: 'essence',
    outputQty: 1,
    input: { demon_core: 1, corrupted_crystal: 1 },
    cost: 150,
    requiredLevel: 20,
  },
  {
    id: 'synth_dragon_scales',
    station: 'alchemy',
    output: 'dragon_scales',
    outputQty: 1,
    input: { demon_core: 2, corrupted_crystal: 2 },
    cost: 400,
    requiredLevel: 45,
  },
];

export function getRefiningRecipe(id: string): RefiningRecipe | undefined {
  return REFINING_RECIPES.find((r) => r.id === id);
}

export function refiningRecipesForStation(station: RefiningStation): RefiningRecipe[] {
  return REFINING_RECIPES.filter((r) => r.station === station);
}
