import { DropRarity, MaterialId } from './materials';
import T from './tunables';

// Ids are stable: they are what saves store in gardenSlots and what the materials are keyed by. Only the visible names
// changed with Garden 2.0 (common_herb is now "Erva Medicinal", uncommon_root "Raiz Amarga", rare_flower "Flor Carmesim").
export type PlantId = 'common_herb' | 'energy_herb' | 'uncommon_root' | 'crimson_mushroom' | 'rare_flower' | 'iron_thistle' | 'gold_blossom' | 'swift_grass' | 'moon_lily';

export interface PlantDef {
  id: PlantId;
  nameKey: string;
  descKey: string;
  // Short "what is it for" line shown in the picker (garden.plant_<id>_use): every plant has a real consumer today.
  useKey: string;
  icon: string;
  iconUrl: string;
  // Display tier only (a label / colour in the picker): it changes nothing about growth, yield or drops.
  rarity: DropRarity;
  material: MaterialId;
  qty: number;
  durationMs: number;
  // Gardening SKILL level required (see skills.ts) — not character level.
  requiredLevel: number;
}

const HOUR = 3600 * 1000;

// Every plot (see GARDEN_SLOTS) grows one plant at a time, fixed duration, one FIXED harvest per planting (no RNG, no
// continued accrual once ready). Planting is free: a plot-hour is the real cost, and the choice is which material to make.
// Sorted by unlock level. Commons are quick and frequent, uncommons medium, the rare one long; yield per hour is
// 1.0 for commons, ~0.2 for uncommons and ~0.08 for the rare, matching how scarce each ingredient is meant to be.
// Consumers (what each material feeds): potions.ts recipes, refining.ts dust. See docs/GARDEN_2_0.md.
export const PLANTS: PlantDef[] = [
  { id: 'common_herb', nameKey: 'plant_common_herb', descKey: 'plant_common_herb_d', useKey: 'plant_common_herb_use', icon: '🌿', iconUrl: '/assets/icons/common_herb.png', rarity: 'common', material: 'common_herb', qty: 2, durationMs: 2 * HOUR, requiredLevel: 1 },
  { id: 'energy_herb', nameKey: 'plant_energy_herb', descKey: 'plant_energy_herb_d', useKey: 'plant_energy_herb_use', icon: '🍀', iconUrl: '/assets/icons/energy_herb.png', rarity: 'common', material: 'energy_herb', qty: 3, durationMs: 3 * HOUR, requiredLevel: 5 },
  { id: 'iron_thistle', nameKey: 'plant_iron_thistle', descKey: 'plant_iron_thistle_d', useKey: 'plant_iron_thistle_use', icon: '🌾', iconUrl: '/assets/icons/iron_thistle.png', rarity: 'common', material: 'iron_thistle', qty: 2, durationMs: 3 * HOUR, requiredLevel: 10 },
  { id: 'uncommon_root', nameKey: 'plant_uncommon_root', descKey: 'plant_uncommon_root_d', useKey: 'plant_uncommon_root_use', icon: '🥕', iconUrl: '/assets/icons/uncommon_root.png', rarity: 'uncommon', material: 'uncommon_root', qty: 1, durationMs: 6 * HOUR, requiredLevel: 15 },
  { id: 'gold_blossom', nameKey: 'plant_gold_blossom', descKey: 'plant_gold_blossom_d', useKey: 'plant_gold_blossom_use', icon: '🌼', iconUrl: '/assets/icons/gold_blossom.png', rarity: 'uncommon', material: 'gold_blossom', qty: 1, durationMs: 5 * HOUR, requiredLevel: 20 },
  { id: 'crimson_mushroom', nameKey: 'plant_crimson_mushroom', descKey: 'plant_crimson_mushroom_d', useKey: 'plant_crimson_mushroom_use', icon: '🍄', iconUrl: '/assets/icons/crimson_mushroom.png', rarity: 'uncommon', material: 'crimson_mushroom', qty: 1, durationMs: 4 * HOUR, requiredLevel: 25 },
  { id: 'swift_grass', nameKey: 'plant_swift_grass', descKey: 'plant_swift_grass_d', useKey: 'plant_swift_grass_use', icon: '🌿', iconUrl: '/assets/icons/swift_grass.png', rarity: 'common', material: 'swift_grass', qty: 2, durationMs: 4 * HOUR, requiredLevel: 30 },
  { id: 'rare_flower', nameKey: 'plant_rare_flower', descKey: 'plant_rare_flower_d', useKey: 'plant_rare_flower_use', icon: '🌸', iconUrl: '/assets/icons/rare_flower.png', rarity: 'rare', material: 'rare_flower', qty: 1, durationMs: 12 * HOUR, requiredLevel: 35 },
  { id: 'moon_lily', nameKey: 'plant_moon_lily', descKey: 'plant_moon_lily_d', useKey: 'plant_moon_lily_use', icon: '🌙', iconUrl: '/assets/icons/moon_lily.png', rarity: 'rare', material: 'moon_lily', qty: 1, durationMs: 10 * HOUR, requiredLevel: 45 },
];

// Plots: the first GARDEN_START_PLOTS are open from the start; the next ones unlock with the Gardening SKILL level (not character level). Old saves with 4
// plots gain the others the moment they meet the level (the save always carries MAX_GARDEN_PLOTS slots, the extra ones simply stay locked).
export const GARDEN_START_PLOTS = 4;
export const GARDEN_PLOT_UNLOCK_LEVELS = [20, 40];
export const MAX_GARDEN_PLOTS = GARDEN_START_PLOTS + GARDEN_PLOT_UNLOCK_LEVELS.length;

export function unlockedGardenPlots(gardeningLevel: number): number {
  return GARDEN_START_PLOTS + GARDEN_PLOT_UNLOCK_LEVELS.filter((l) => gardeningLevel >= l).length;
}

// Gardening level a locked plot needs (0-based plot index), or 0 when it is open from the start.
export function plotUnlockLevel(index: number): number {
  return index < GARDEN_START_PLOTS ? 0 : (GARDEN_PLOT_UNLOCK_LEVELS[index - GARDEN_START_PLOTS] ?? Infinity);
}

export function getPlant(id: string): PlantDef | undefined {
  return PLANTS.find((p) => p.id === id);
}

// Gardening XP of one harvest: growth hours x T.skills.gardenXpPerHour, so every plant pays the same XP per plot-hour.
export function plantHarvestXp(plant: PlantDef): number {
  return Math.max(1, Math.round((plant.durationMs / HOUR) * T.skills.gardenXpPerHour));
}
