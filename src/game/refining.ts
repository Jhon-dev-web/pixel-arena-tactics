import { MaterialId } from './materials';

export type RefiningStation = 'furnace' | 'tannery' | 'alchemy' | 'dust' | 'carpentry';

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
  // Refining Dust: an outlet for the low-value common materials that pile up with nowhere to go now
  // that selling for Gold is gone (Discard is the only other option, and it returns nothing). Each
  // recipe converts ONE surplus material type at a flat 10:1 — accepting several different inputs for
  // the same output means whichever material a player happens to be drowning in works, instead of
  // forcing them to farm a specific one. Deliberately excludes refined materials (silver_ingot, steel,
  // etc.) and mid/high-tier drops (demon_claw, concentrated_blood, corrupted_crystal, demon_core) —
  // those still have real recipe demand; only each source's single lowest-value, highest-volume
  // material is here (copper: cheapest ore; leather_scrap/bone_fragment: the "common"-rarity,
  // highest-drop-chance Hunting tier; common_herb: the cheapest, fastest Garden harvest). Gold cost is
  // 0 on purpose — this is a sink for junk material, not something that should also compete for scarce
  // Gold. Consumed by gear refine +5..+8 (see gear.ts upgradeCost).
  { id: 'dust_from_copper', station: 'dust', output: 'refining_dust', outputQty: 1, input: { copper: 10 }, cost: 0, requiredLevel: 1 },
  { id: 'dust_from_leather_scrap', station: 'dust', output: 'refining_dust', outputQty: 1, input: { leather_scrap: 10 }, cost: 0, requiredLevel: 1 },
  { id: 'dust_from_bone_fragment', station: 'dust', output: 'refining_dust', outputQty: 1, input: { bone_fragment: 10 }, cost: 0, requiredLevel: 1 },
  { id: 'dust_from_common_herb', station: 'dust', output: 'refining_dust', outputQty: 1, input: { common_herb: 10 }, cost: 0, requiredLevel: 1 },
  // Carpentry: Woodcutting's Furnace equivalent — same 5:1 raw-to-refined ratio, same declining-per-tier
  // gold cost logic (higher tiers convert faster per hour of chopping, so the nominal per-conversion
  // price falls even as the real gold *burden* per hour stays proportional). Costs are pinned low in
  // absolute terms on purpose: Gold was just recalibrated down to a 2-5k/day budget (see App.tsx
  // enterDungeon / expedition.ts / dungeon.ts DUNGEON_BIOMES), and these five conversions together would
  // otherwise reopen a chunk of the gap that recalibration closed.
  { id: 'craft_handle_common', station: 'carpentry', output: 'wood_handle_common', outputQty: 1, input: { common_wood: 5 }, cost: 10, requiredLevel: 1 },
  { id: 'craft_handle_oak', station: 'carpentry', output: 'wood_handle_oak', outputQty: 1, input: { oak_wood: 5 }, cost: 8, requiredLevel: 10 },
  { id: 'craft_handle_ebony', station: 'carpentry', output: 'wood_handle_ebony', outputQty: 1, input: { ebony_wood: 5 }, cost: 5, requiredLevel: 25 },
  { id: 'craft_handle_elven', station: 'carpentry', output: 'wood_handle_elven', outputQty: 1, input: { elven_wood: 5 }, cost: 3, requiredLevel: 50 },
  { id: 'craft_handle_ancient', station: 'carpentry', output: 'wood_handle_ancient', outputQty: 1, input: { ancient_wood: 5 }, cost: 2, requiredLevel: 75 },
];

export function getRefiningRecipe(id: string): RefiningRecipe | undefined {
  return REFINING_RECIPES.find((r) => r.id === id);
}

export function refiningRecipesForStation(station: RefiningStation): RefiningRecipe[] {
  return REFINING_RECIPES.filter((r) => r.station === station);
}
