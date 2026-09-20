import { SaveData } from './engine';
import { GEAR, isInstancedSlot } from './gear';
import { MATERIALS } from './materials';
import { CONSUMABLES } from './consumables';

export const MAX_SLOTS = 20;
export const MATERIAL_STACK = 99;

export function inventorySlotsUsed(save: SaveData): number {
  // Only STACKABLE gear (relics, tools) uses bag slots; weapons / armors live in their own capacity (gearInstances).
  const gear = GEAR.filter((g) => !isInstancedSlot(g.slot) && (save.inventory?.[g.id] ?? 0) > 0).length;
  const mats = MATERIALS.filter((m) => (save.materials?.[m.id] ?? 0) > 0).length;
  const cons = CONSUMABLES.filter((c) => (save.consumables?.[c.id] ?? 0) > 0).length;
  return gear + mats + cons;
}

export function isBagFull(save: SaveData): boolean {
  return inventorySlotsUsed(save) >= MAX_SLOTS;
}
