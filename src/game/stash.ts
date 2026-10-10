import type { SaveData } from './engine';
import { getGear, isInstancedSlot } from './gear';
import { addWithOverflow, emptyStock, placeUnits, Stock, stockSlots } from './inventory';
import { ConsumableId, getConsumable } from './consumables';
import { getMaterial, hasMaterials, MaterialId } from './materials';

// Baú do acampamento (the camp stash): a second container with the very same stack rule as the inventory (99 per slot, placeUnits). It is STORAGE only:
// recipes, delivery orders and upgrades consume from the inventory and never from here, so bag space stays a real decision and nothing is spent behind
// the player's back. It starts with STASH_BASE_SLOTS and grows STASH_STEP_SLOTS per upgrade; every upgrade is a long-term sink for Woodcutting (handles)
// and Mining (bars) plus gold. Only stackables live here (materials, consumables, stackable gear such as relics); a gear INSTANCE stays in the inventory.

export const STASH_BASE_SLOTS = 20;
export const STASH_STEP_SLOTS = 10;

export interface StashUpgradeDef {
  gold: number;
  materials: Partial<Record<MaterialId, number>>;
}

// The upgrade that takes the stash from level n to n + 1 is STASH_UPGRADES[n]. Handles come from Carpentry (wood), bars from the Furnace (ore): the tiers
// follow the character-level gates of the recipes, and the amounts are the order of magnitude of a same-tier gear recipe (a few handles and bars).
export const STASH_UPGRADES: StashUpgradeDef[] = [
  { gold: 100, materials: { wood_handle_common: 4, copper_bar: 3 } },
  { gold: 250, materials: { wood_handle_common: 8, copper_bar: 6 } },
  { gold: 600, materials: { wood_handle_oak: 5, copper_bar: 8 } },
  { gold: 1_200, materials: { wood_handle_oak: 8, steel: 3 } },
  { gold: 2_500, materials: { wood_handle_ebony: 5, steel: 5 } },
  { gold: 4_500, materials: { wood_handle_ebony: 8, silver_ingot: 4 } },
  { gold: 8_000, materials: { wood_handle_elven: 5, gold_bar: 3 } },
  { gold: 14_000, materials: { wood_handle_ancient: 4, refined_obsidian: 2 } },
];

export const MAX_STASH_LEVEL = STASH_UPGRADES.length;

export interface StashState {
  level: number;
  materials: Partial<Record<MaterialId, number>>;
  consumables: Partial<Record<ConsumableId, number>>;
  gear: Record<string, number>;
}

export const emptyStash = (): StashState => ({ level: 0, ...emptyStock() });

const cleanRecord = <K extends string>(raw: unknown, known: (id: string) => boolean): Partial<Record<K, number>> => {
  const out: Partial<Record<K, number>> = {};
  if (raw && typeof raw === 'object') {
    for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
      const n = Math.floor(Number(v));
      if (known(id) && Number.isFinite(n) && n > 0) out[id as K] = Math.min(n, 1e9);
    }
  }
  return out;
};

// A saved stash from any source: unknown ids dropped, counts clamped to finite whole numbers, level inside the table. Nothing valid is ever removed.
export function sanitizeStash(raw: unknown): StashState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<StashState>;
  const level = Math.floor(Number(r.level));
  return {
    level: Number.isFinite(level) ? Math.min(MAX_STASH_LEVEL, Math.max(0, level)) : 0,
    materials: cleanRecord<MaterialId>(r.materials, (id) => !!getMaterial(id as MaterialId)),
    consumables: cleanRecord<ConsumableId>(r.consumables, (id) => !!getConsumable(id)),
    gear: cleanRecord<string>(r.gear, (id) => !!getGear(id) && !isInstancedSlot(getGear(id).slot)) as Record<string, number>,
  };
}

const stashOf = (save: Pick<SaveData, 'stash'>): StashState => save.stash ?? emptyStash();

export const stashCapacity = (save: Pick<SaveData, 'stash'>): number => STASH_BASE_SLOTS + STASH_STEP_SLOTS * stashOf(save).level;
export const stashSlotsUsed = (save: Pick<SaveData, 'stash'>): number => stockSlots(stashOf(save));
export const stashFreeSlots = (save: Pick<SaveData, 'stash'>): number => Math.max(0, stashCapacity(save) - stashSlotsUsed(save));

export type StackKind = 'material' | 'consumable' | 'gear';
const GROUP: Record<StackKind, keyof Stock> = { material: 'materials', consumable: 'consumables', gear: 'gear' };

export const bagCount = (save: SaveData, kind: StackKind, id: string): number =>
  ((kind === 'material' ? save.materials : kind === 'consumable' ? save.consumables : save.inventory) as Record<string, number>)[id] ?? 0;
export const stashCount = (save: Pick<SaveData, 'stash'>, kind: StackKind, id: string): number => (stashOf(save)[GROUP[kind]] as Record<string, number>)[id] ?? 0;

// The equipped relic / tool is never moved out of the bag (the bag count of a stackable that is currently worn is one less than it shows).
function movableFromBag(save: SaveData, kind: StackKind, id: string): number {
  const n = bagCount(save, kind, id);
  return kind === 'gear' && Object.values(save.equipped).includes(id) ? Math.max(0, n - 1) : n;
}

export interface MoveResult {
  save: SaveData;
  moved: number;
}

// Move up to `qty` units of one stack between the inventory and the stash ('all' = the whole stack). Partial moves are normal: it moves what the
// destination has room for (partial stacks first, then free slots - the same rule as everywhere) and reports how many went. Nothing is ever lost.
export function applyStashMove(save: SaveData, dir: 'store' | 'take', kind: StackKind, id: string, qty: number | 'all'): MoveResult {
  const group = GROUP[kind];
  const stash = stashOf(save);
  const want = Math.max(0, Math.floor(qty === 'all' ? Number.MAX_SAFE_INTEGER : qty));
  const have = dir === 'store' ? movableFromBag(save, kind, id) : stashCount(save, kind, id);
  const asked = Math.min(want, have);
  if (asked <= 0) return { save, moved: 0 };
  const additions = { [group]: { [id]: asked } } as Partial<Stock>;
  if (dir === 'store') {
    const placed = placeUnits(stash, additions, stashFreeSlots(save));
    const moved = (placed.added[group] as Record<string, number>)[id] ?? 0;
    if (moved <= 0) return { save, moved: 0 };
    const stored: SaveData = { ...save, stash: { ...stash, materials: placed.stock.materials, consumables: placed.stock.consumables, gear: placed.stock.gear } };
    return { save: takeFromBag(stored, kind, id, moved), moved };
  }
  const placed = addWithOverflow(save, additions);
  const moved = (placed.added[group] as Record<string, number>)[id] ?? 0;
  if (moved <= 0) return { save, moved: 0 };
  const rest = { ...(stash[group] as Record<string, number>) };
  rest[id] = (rest[id] ?? 0) - moved;
  if (rest[id] <= 0) delete rest[id];
  return { save: { ...placed.save, stash: { ...stash, [group]: rest } }, moved };
}

function takeFromBag(save: SaveData, kind: StackKind, id: string, n: number): SaveData {
  if (kind === 'material') return { ...save, materials: { ...save.materials, [id]: (save.materials[id as MaterialId] ?? 0) - n } };
  if (kind === 'consumable') return { ...save, consumables: { ...save.consumables, [id]: (save.consumables[id as ConsumableId] ?? 0) - n } };
  const inventory = { ...save.inventory, [id]: (save.inventory[id] ?? 0) - n };
  if (inventory[id] <= 0) delete inventory[id];
  return { ...save, inventory };
}

// "Guardar tudo": every material (or every consumable) type in the inventory that the stash has room for, in the order of the catalog. Returns the units moved.
export function applyStoreAll(save: SaveData, kind: 'material' | 'consumable'): MoveResult {
  const ids = Object.entries(kind === 'material' ? save.materials : save.consumables).filter(([, n]) => n > 0).map(([id]) => id);
  let cur = save;
  let total = 0;
  for (const id of ids) {
    const r = applyStashMove(cur, 'store', kind, id, 'all');
    cur = r.save;
    total += r.moved;
  }
  return { save: cur, moved: total };
}

// What a recipe screen says when the inventory lacks `need` units but the stash holds some: how many are in the Baú, how many one click brings, and whether
// they fit the inventory. null = nothing to say (nothing missing, or nothing in the stash).
export interface StashHint {
  inStash: number;
  bring: number;
  fits: boolean;
}

export function stashHintFor(save: SaveData, kind: StackKind, id: string, need: number): StashHint | null {
  const missing = need - bagCount(save, kind, id);
  const inStash = stashCount(save, kind, id);
  if (missing <= 0 || inStash <= 0) return null;
  const bring = Math.min(missing, inStash);
  return { inStash, bring, fits: applyStashMove(save, 'take', kind, id, bring).moved >= bring };
}

// ---- upgrades ------------------------------------------------------------------------------------------------------

export interface StashQuote extends StashUpgradeDef {
  level: number; // the level it reaches
  capacity: number; // the capacity it reaches
}

export function nextStashUpgrade(save: Pick<SaveData, 'stash'>): StashQuote | null {
  const level = stashOf(save).level;
  const def = STASH_UPGRADES[level];
  return def ? { ...def, level: level + 1, capacity: STASH_BASE_SLOTS + STASH_STEP_SLOTS * (level + 1) } : null;
}

// All-or-nothing: gold and materials come out of the INVENTORY (never the stash), and the level goes up. null = max level or something missing.
export function applyStashUpgrade(save: SaveData): SaveData | null {
  const quote = nextStashUpgrade(save);
  if (!quote || save.gold < quote.gold || !hasMaterials(save.materials, quote.materials)) return null;
  const materials = { ...save.materials };
  for (const [mid, n] of Object.entries(quote.materials) as [MaterialId, number][]) materials[mid] = (materials[mid] ?? 0) - n;
  return { ...save, gold: save.gold - quote.gold, materials, stash: { ...stashOf(save), level: quote.level } };
}

