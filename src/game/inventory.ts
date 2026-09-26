import { SaveData } from './engine';
import { GEAR, isInstancedSlot } from './gear';
import { MATERIALS } from './materials';
import { CONSUMABLES } from './consumables';

export const MATERIAL_STACK = 99;

// Base capacity for every new character, and the floor an existing save's capacity is normalized up to
// (never down — see normalizeInventoryCapacity). Replaces the old fixed MAX_SLOTS=20.
export const DEFAULT_INVENTORY_CAPACITY = 30;

// Centralized expansion pricing (never spread across components — see expandInventory below). Each entry
// is the capacity a purchase reaches FROM the previous tier (+5 slots) and its Gold cost. Extending past
// the last entry needs explicit design sign-off; treat 60 as this version's temporary ceiling.
export const INVENTORY_EXPANSION_STEPS: ReadonlyArray<{ capacity: number; goldCost: number }> = [
  { capacity: 35, goldCost: 500 },
  { capacity: 40, goldCost: 1_000 },
  { capacity: 45, goldCost: 2_000 },
  { capacity: 50, goldCost: 4_000 },
  { capacity: 55, goldCost: 7_500 },
  { capacity: 60, goldCost: 12_500 },
];

export const MAX_INVENTORY_CAPACITY = INVENTORY_EXPANSION_STEPS[INVENTORY_EXPANSION_STEPS.length - 1].capacity;

// Never reduces a save's capacity: missing/undersized -> DEFAULT_INVENTORY_CAPACITY, anything at or above
// that is preserved exactly as-is (including a value already past MAX_INVENTORY_CAPACITY, e.g. from a
// future balance change — this function only ever raises a floor, never clamps a ceiling).
export function normalizeInventoryCapacity(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return DEFAULT_INVENTORY_CAPACITY;
  return Math.max(DEFAULT_INVENTORY_CAPACITY, n);
}

export function inventoryCapacity(save: Pick<SaveData, 'inventoryCapacity'>): number {
  return normalizeInventoryCapacity(save.inventoryCapacity);
}

// The single shared "Mochila" capacity every system reads (Caça, Craft, Dungeon, Pedidos, Battle Pass,
// Drops, Rewards, Salvage, Garden, Profissões, ...): one slot per non-empty stack (gear stack / material /
// consumable TYPE, any quantity) plus one slot per stored, UNEQUIPPED GearInstance. An equipped weapon or
// armor instance never counts here — see the equipped-id exclusion below.
export function inventorySlotsUsed(save: Pick<SaveData, 'inventory' | 'materials' | 'consumables' | 'gearInstances' | 'equipped'>): number {
  const gear = GEAR.filter((g) => !isInstancedSlot(g.slot) && (save.inventory?.[g.id] ?? 0) > 0).length;
  const mats = MATERIALS.filter((m) => (save.materials?.[m.id] ?? 0) > 0).length;
  const cons = CONSUMABLES.filter((c) => (save.consumables?.[c.id] ?? 0) > 0).length;
  const equippedIds = new Set<string>();
  if (save.equipped?.weapon) equippedIds.add(save.equipped.weapon);
  if (save.equipped?.armor) equippedIds.add(save.equipped.armor);
  const storedInstances = Object.keys(save.gearInstances ?? {}).filter((id) => !equippedIds.has(id)).length;
  return gear + mats + cons + storedInstances;
}

export function isBagFull(save: SaveData): boolean {
  return inventorySlotsUsed(save) >= inventoryCapacity(save);
}

export interface ExpansionQuote {
  nextCapacity: number;
  goldCost: number;
}

// The next paid expansion step from the save's CURRENT capacity, or null once MAX_INVENTORY_CAPACITY is
// reached (also null for a save already past the table, e.g. a future balance change — never invents a
// step beyond what INVENTORY_EXPANSION_STEPS defines).
export function nextExpansion(save: Pick<SaveData, 'inventoryCapacity'>): ExpansionQuote | null {
  const current = inventoryCapacity(save);
  const step = INVENTORY_EXPANSION_STEPS.find((s) => s.capacity > current);
  return step ? { nextCapacity: step.capacity, goldCost: step.goldCost } : null;
}

// Pure reducer, all-or-nothing: either Gold is spent AND capacity increases, or neither happens (null).
// Prepared for a future server-authoritative economy — callers never compute the cost/step themselves.
export function expandInventory(save: SaveData): SaveData | null {
  const quote = nextExpansion(save);
  if (!quote) return null;
  if (save.gold < quote.goldCost) return null;
  return { ...save, gold: save.gold - quote.goldCost, inventoryCapacity: quote.nextCapacity };
}
