import { computeGardenSlotStatus, GARDEN_SLOTS, SaveData } from './engine';
import { getPlant, PlantId, plantHarvestXp, unlockedGardenPlots } from './garden';
import { gardenDustFor, gardenYieldBonus } from './mastery';
import T from './tunables';
import { MaterialId } from './materials';
import { skillLevel } from './skills';
import { addWithOverflow, stockIsEmpty } from './inventory';
import { recordHarvest } from './stats';

// The Garden's player actions as pure transitions on the save: each returns the WHOLE next save (or null when nothing
// would change), so a click that arrives twice can never apply twice — the second sees the plot already cleared/planted.
// No numbers live here: durations, yields, level requirements and the XP per harvest come from garden.ts (XP: plantHarvestXp).

const validNow = (now: number): boolean => typeof now === 'number' && Number.isFinite(now) && now > 0;

export interface HarvestResult {
  save: SaveData;
  harvested: { slot: number; plantId: PlantId; material: MaterialId; qty: number; xp: number; dust?: number }[];
  // Ready plots whose yield did not fit the inventory: harvesting is a deliberate action, so they are NOT touched (the crop stays ready) and nothing is lost.
  blocked: number[];
}

// Plant `plantId` in every listed plot that exists and is empty (the others are skipped). null = nothing planted
// (unknown plant, gardening level too low, bad clock, or no listed plot was empty).
export function applyPlant(save: SaveData, plantId: string, slotIndices: number[], now: number): SaveData | null {
  const def = getPlant(plantId);
  if (!def || !validNow(now) || skillLevel(save.skillXp.gardening, 'gardening') < def.requiredLevel) return null;
  const open = Math.min(GARDEN_SLOTS, unlockedGardenPlots(skillLevel(save.skillXp.gardening, 'gardening')));
  const targets = Array.from(new Set(slotIndices)).filter(
    (i) => Number.isInteger(i) && i >= 0 && i < open && !!save.gardenSlots[i] && !save.gardenSlots[i].plantId,
  );
  if (targets.length === 0) return null;
  const gardenSlots = [...save.gardenSlots];
  for (const i of targets) gardenSlots[i] = { plantId: def.id, startedAt: now, lastPlantId: def.id, fertilized: false };
  return { ...save, gardenSlots };
}

// Harvest every listed plot that is READY and whose yield fits the inventory. Each one gives its plant's fixed yield and that plant's Gardening XP
// (plantHarvestXp), exactly like harvesting them one by one, and is cleared (remembering the plant for "plant again"). A plot whose yield has no room
// stays ready and is reported in `blocked`.
// null = none was ready, so a repeated click / a second "harvest all" is a no-op.
export function applyHarvest(save: SaveData, slotIndices: number[], now: number): HarvestResult | null {
  if (!validNow(now)) return null;
  let bag = save;
  const gardenLevel = skillLevel(save.skillXp.gardening, 'gardening');
  const gardenSlots = [...save.gardenSlots];
  const harvested: HarvestResult['harvested'] = [];
  const blocked: number[] = [];
  for (const i of new Set(slotIndices)) {
    if (!Number.isInteger(i) || i < 0 || i >= gardenSlots.length) continue;
    const status = computeGardenSlotStatus(save, now, i);
    const def = status.plantId ? getPlant(status.plantId) : undefined;
    if (!status.ready || !def) continue;
    // Gardening mastery (mastery.ts): +units on the rare plants at 75, Refining Dust per growth hour at 70. Both are 0 below those levels, so nothing changes for them.
    const qty = def.qty + gardenYieldBonus(gardenLevel, def.rarity);
    const dust = gardenDustFor(gardenLevel, def.durationMs / 3600000);
    const placed = addWithOverflow(bag, { materials: { [def.material]: qty, ...(dust > 0 ? { refining_dust: dust } : {}) } });
    if (!stockIsEmpty(placed.leftover)) {
      blocked.push(i);
      continue;
    }
    bag = placed.save;
    gardenSlots[i] = { plantId: null, startedAt: 0, lastPlantId: def.id, fertilized: false };
    harvested.push({ slot: i, plantId: def.id, material: def.material, qty, xp: plantHarvestXp(def), ...(dust > 0 ? { dust } : {}) });
  }
  if (harvested.length === 0 && blocked.length === 0) return null;
  return {
    save: recordHarvest(
      { ...bag, gardenSlots, skillXp: { ...save.skillXp, gardening: save.skillXp.gardening + harvested.reduce((sum, h) => sum + h.xp, 0) } },
      harvested.reduce((sum, h) => sum + h.qty, 0),
    ),
    harvested,
    blocked,
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
  gardenSlots[slotIndex] = { plantId: null, startedAt: 0, lastPlantId: slot.plantId, fertilized: false };
  return { ...save, gardenSlots };
}

// Use one Fertilizer on a plot that is growing and not ready yet: removes T.tonics.fertilizerSkipPct of the REMAINING growth time. One per planting per plot
// (the plot remembers it until it is harvested / uprooted / planted again). null = nothing happens and nothing is spent: no unit, empty or ready plot,
// already fertilized, bad clock.
export function applyFertilizer(save: SaveData, slotIndex: number, now: number): SaveData | null {
  if (!validNow(now) || !Number.isInteger(slotIndex) || (save.consumables.fertilizer ?? 0) < 1) return null;
  const slot = save.gardenSlots[slotIndex];
  const status = computeGardenSlotStatus(save, now, slotIndex);
  if (!slot || !status.plantId || status.ready || slot.fertilized) return null;
  const gardenSlots = [...save.gardenSlots];
  gardenSlots[slotIndex] = { ...slot, startedAt: slot.startedAt - status.remainingMs * T.tonics.fertilizerSkipPct, fertilized: true };
  return { ...save, gardenSlots, consumables: { ...save.consumables, fertilizer: (save.consumables.fertilizer ?? 0) - 1 } };
}
