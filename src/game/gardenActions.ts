import { computeGardenSlotStatus, GARDEN_SLOTS, SaveData } from './engine';
import { getPlant, PlantId, plantHarvestXp } from './garden';
import { MaterialId } from './materials';
import { skillLevel } from './skills';

// The Garden's player actions as pure transitions on the save: each returns the WHOLE next save (or null when nothing
// would change), so a click that arrives twice can never apply twice — the second sees the plot already cleared/planted.
// No numbers live here: durations, yields, level requirements and the XP per harvest come from garden.ts (XP: plantHarvestXp).

const validNow = (now: number): boolean => typeof now === 'number' && Number.isFinite(now) && now > 0;

export interface HarvestResult {
  save: SaveData;
  harvested: { slot: number; plantId: PlantId; material: MaterialId; qty: number; xp: number }[];
}

// Plant `plantId` in every listed plot that exists and is empty (the others are skipped). null = nothing planted
// (unknown plant, gardening level too low, bad clock, or no listed plot was empty).
export function applyPlant(save: SaveData, plantId: string, slotIndices: number[], now: number): SaveData | null {
  const def = getPlant(plantId);
  if (!def || !validNow(now) || skillLevel(save.skillXp.gardening, 'gardening') < def.requiredLevel) return null;
  const targets = Array.from(new Set(slotIndices)).filter(
    (i) => Number.isInteger(i) && i >= 0 && i < GARDEN_SLOTS && !!save.gardenSlots[i] && !save.gardenSlots[i].plantId,
  );
  if (targets.length === 0) return null;
  const gardenSlots = [...save.gardenSlots];
  for (const i of targets) gardenSlots[i] = { plantId: def.id, startedAt: now, lastPlantId: def.id };
  return { ...save, gardenSlots };
}

// Harvest every listed plot that is READY. Each one gives its plant's fixed yield and that plant's Gardening XP
// (plantHarvestXp), exactly like harvesting them one by one, and is cleared (remembering the plant for "plant again").
// null = none was ready, so a repeated click / a second "harvest all" is a no-op.
export function applyHarvest(save: SaveData, slotIndices: number[], now: number): HarvestResult | null {
  if (!validNow(now)) return null;
  const materials = { ...save.materials };
  const gardenSlots = [...save.gardenSlots];
  const harvested: HarvestResult['harvested'] = [];
  for (const i of new Set(slotIndices)) {
    if (!Number.isInteger(i) || i < 0 || i >= gardenSlots.length) continue;
    const status = computeGardenSlotStatus(save, now, i);
    const def = status.plantId ? getPlant(status.plantId) : undefined;
    if (!status.ready || !def) continue;
    materials[def.material] = (materials[def.material] ?? 0) + def.qty;
    gardenSlots[i] = { plantId: null, startedAt: 0, lastPlantId: def.id };
    harvested.push({ slot: i, plantId: def.id, material: def.material, qty: def.qty, xp: plantHarvestXp(def) });
  }
  if (harvested.length === 0) return null;
  return {
    save: { ...save, materials, gardenSlots, skillXp: { ...save.skillXp, gardening: save.skillXp.gardening + harvested.reduce((sum, h) => sum + h.xp, 0) } },
    harvested,
  };
}

export function readySlots(save: SaveData, now: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < save.gardenSlots.length; i++) if (computeGardenSlotStatus(save, now, i).ready) out.push(i);
  return out;
}

// Pull a growing plant out (no yield, no XP — the same as before). The plant is remembered for "plant again".
export function applyUproot(save: SaveData, slotIndex: number): SaveData | null {
  const slot = save.gardenSlots[slotIndex];
  if (!slot?.plantId) return null;
  const gardenSlots = [...save.gardenSlots];
  gardenSlots[slotIndex] = { plantId: null, startedAt: 0, lastPlantId: slot.plantId };
  return { ...save, gardenSlots };
}
