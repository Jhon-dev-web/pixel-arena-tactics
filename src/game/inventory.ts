import type { SaveData } from './engine';
import { INSTANCED_SLOTS, getGear, isInstancedSlot } from './gear';
import { MaterialId, getMaterial } from './materials';
import { ConsumableId, getConsumable } from './consumables';
import T from './tunables';
import { ownsAdventurerPass } from './entitlements';
import { saveSkillEffects } from './heroSkills';

// THE bag. One shared pool of slots for everything the hero carries: stackable things (materials, consumables, stackable gear such as relics) fill
// slots of STACK_LIMIT units each, every stored (unequipped) gear instance takes one slot, an equipped piece takes none. Storage stays as plain
// quantities per type in the save: the slots are DERIVED here and nowhere else - no caller computes slots itself. The same rules (and the same
// pure placement function) serve the camp stash (stash.ts).

// Units per slot for every stackable. A type holding more occupies ceil(qty / STACK_LIMIT) slots.
export const STACK_LIMIT = 99;

// Base capacity for every new character, and the floor an existing save's capacity is normalized up to
// (never down - see normalizeInventoryCapacity). Replaces the old fixed MAX_SLOTS=20.
export const DEFAULT_INVENTORY_CAPACITY = 26;

// Centralized expansion pricing (never spread across components - see expandInventory below). Each entry is the capacity a purchase reaches FROM the
// previous tier (+5 slots) and its Gold cost. The curve keeps the growth of the first six steps (x2 early, easing off) up to 100 slots; nothing
// else adds permanent slots except the one-time conversion of the old Hunting Pouch tiers (inventoryBonusSlots) and the Pass perk (temporary).
export const INVENTORY_EXPANSION_STEPS: ReadonlyArray<{ capacity: number; goldCost: number }> = [
  { capacity: 30, goldCost: 250 },
  { capacity: 35, goldCost: 500 },
  { capacity: 40, goldCost: 1_000 },
  { capacity: 45, goldCost: 2_000 },
  { capacity: 50, goldCost: 4_000 },
  { capacity: 55, goldCost: 7_500 },
  { capacity: 60, goldCost: 12_500 },
  { capacity: 65, goldCost: 20_000 },
  { capacity: 70, goldCost: 30_000 },
  { capacity: 75, goldCost: 45_000 },
  { capacity: 80, goldCost: 65_000 },
  { capacity: 85, goldCost: 90_000 },
  { capacity: 90, goldCost: 120_000 },
  { capacity: 95, goldCost: 160_000 },
  { capacity: 100, goldCost: 210_000 },
];

export const MAX_INVENTORY_CAPACITY = INVENTORY_EXPANSION_STEPS[INVENTORY_EXPANSION_STEPS.length - 1].capacity;

// Never reduces a save's capacity: missing/undersized -> DEFAULT_INVENTORY_CAPACITY, anything at or above
// that is preserved exactly as-is (including a value already past MAX_INVENTORY_CAPACITY, e.g. from a
// future balance change - this function only ever raises a floor, never clamps a ceiling).
export function normalizeInventoryCapacity(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return DEFAULT_INVENTORY_CAPACITY;
  return Math.max(DEFAULT_INVENTORY_CAPACITY, n);
}

// The Adventurer Pass bag perk: a share of the capacity the hero has without it (the bought base plus converted Pouch slots), rounded up, never fewer than
// T.battlePass.bagBonusSlots. THE one place that computes it (inventoryCapacity and every screen go through it).
export function passBagBonus(capacityWithoutPass: number): number {
  return Math.max(T.battlePass.bagBonusSlots, Math.ceil(capacityWithoutPass * T.battlePass.bagBonusPct));
}

type CapacityFields = Pick<SaveData, 'inventoryCapacity'> & Partial<Pick<SaveData, 'inventoryBonusSlots' | 'hasBattlePass' | 'skillTree'>>;

// Mochileiro (heroSkills.ts): flat slots per rank, added on top of everything else (the Pass share is not computed over them).
export function skillBagBonus(save: Partial<Pick<SaveData, 'skillTree'>>): number {
  return save.skillTree ? saveSkillEffects({ skillTree: save.skillTree }).bagSlots : 0;
}

// Slots the hero has right now: the bought base, the permanent slots the old Hunting Pouch tiers were converted into, and the Adventurer Pass perk for
// its owner. `now` is kept for the callers that pass it (the capacity no longer depends on the clock).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function inventoryCapacity(save: CapacityFields, _now?: number): number {
  const passActive = ownsAdventurerPass({ hasBattlePass: !!save.hasBattlePass });
  const bonus = Math.max(0, Math.floor(Number(save.inventoryBonusSlots ?? 0)) || 0);
  const own = normalizeInventoryCapacity(save.inventoryCapacity) + bonus;
  return own + (passActive ? passBagBonus(own) : 0) + skillBagBonus(save);
}

// ---- stacks and slots ----------------------------------------------------------------------------------------------

export const slotsForQty = (qty: number): number => (qty > 0 ? Math.ceil(qty / STACK_LIMIT) : 0);

// Everything stackable a container holds, as plain quantities per type.
export interface Stock {
  materials: Partial<Record<MaterialId, number>>;
  consumables: Partial<Record<ConsumableId, number>>;
  gear: Record<string, number>;
}

export const emptyStock = (): Stock => ({ materials: {}, consumables: {}, gear: {} });

type StockLike = Partial<Stock>;
type StackGroup = keyof Stock;
const GROUPS: StackGroup[] = ['materials', 'consumables', 'gear'];

const stackableGear = (id: string): boolean => {
  const g = getGear(id);
  return !!g && !isInstancedSlot(g.slot);
};

const isKnown = (group: StackGroup, id: string): boolean =>
  group === 'materials' ? !!getMaterial(id as MaterialId) : group === 'consumables' ? !!getConsumable(id) : stackableGear(id);

// Slots the stackables of a container take. Unknown ids are ignored (the loader strips them anyway).
export function stockSlots(stock: StockLike): number {
  let slots = 0;
  for (const group of GROUPS) {
    const rec = stock[group] as Record<string, number> | undefined;
    if (!rec) continue;
    for (const [id, qty] of Object.entries(rec)) if (qty > 0 && isKnown(group, id)) slots += slotsForQty(qty);
  }
  return slots;
}

type BagFields = Pick<SaveData, 'inventory' | 'materials' | 'consumables' | 'gearInstances' | 'equipped'>;

// The bag's own stackables as a Stock view (no copy).
export const bagStock = (save: Pick<SaveData, 'inventory' | 'materials' | 'consumables'>): Stock => ({
  materials: save.materials ?? {},
  consumables: save.consumables ?? {},
  gear: save.inventory ?? {},
});

export function storedInstanceCount(save: Pick<SaveData, 'gearInstances' | 'equipped'>): number {
  const equippedIds = new Set<string>();
  for (const slot of INSTANCED_SLOTS) {
    const id = save.equipped?.[slot];
    if (id) equippedIds.add(id);
  }
  return Object.keys(save.gearInstances ?? {}).filter((id) => !equippedIds.has(id)).length;
}

// The single shared slot count every system reads (Caca, Craft, Dungeon, Pedidos, Battle Pass, Drops, Rewards, Salvage, Garden, Profissoes, ...).
export function inventorySlotsUsed(save: BagFields): number {
  return stockSlots(bagStock(save)) + storedInstanceCount(save);
}

export function isBagFull(save: SaveData): boolean {
  return inventorySlotsUsed(save) >= inventoryCapacity(save);
}

// Free slots (0 while the bag is at or over capacity).
export function bagFreeSlots(save: SaveData, now?: number): number {
  return Math.max(0, inventoryCapacity(save, now) - inventorySlotsUsed(save));
}

// A deliberate action that changes the bag (craft, refine, harvest, salvage, claim, purchase...) is accepted when its result does not take more slots than
// the bag has - or, for a bag that is already over the limit (the Pass lapsed, an old save), when it does not make it any bigger.
export function fitsBag(before: SaveData, after: SaveData, now?: number): boolean {
  return inventorySlotsUsed(after) <= Math.max(inventoryCapacity(after, now), inventorySlotsUsed(before));
}

// ---- placing units -------------------------------------------------------------------------------------------------

export type Additions = StockLike;

export interface PlaceResult {
  stock: Stock;
  added: Stock;
  leftover: Stock;
}

// THE placement rule for any container with `freeSlots` free slots: units go first into the partial stacks that already exist (they cost no slot),
// then into new slots in the order the keys are given (the caller orders them, e.g. rarest first), each new slot holding STACK_LIMIT. Whatever does not
// fit is the leftover. Pure: the input stock is never mutated.
export function placeUnits(stock: StockLike, additions: Additions, freeSlots: number): PlaceResult {
  const next: Stock = { materials: { ...stock.materials }, consumables: { ...stock.consumables }, gear: { ...stock.gear } };
  const added = emptyStock();
  const leftover = emptyStock();
  type Entry = { group: StackGroup; id: string; amount: number };
  const entries: Entry[] = [];
  for (const group of GROUPS) {
    const rec = additions[group] as Record<string, number> | undefined;
    if (!rec) continue;
    for (const [id, raw] of Object.entries(rec)) {
      const amount = Math.floor(raw);
      if (amount > 0 && isKnown(group, id)) entries.push({ group, id, amount });
    }
  }
  const cur = (e: Entry): number => (next[e.group] as Record<string, number>)[e.id] ?? 0;
  const put = (e: Entry, n: number) => {
    if (n <= 0) return;
    (next[e.group] as Record<string, number>)[e.id] = cur(e) + n;
    const a = added[e.group] as Record<string, number>;
    a[e.id] = (a[e.id] ?? 0) + n;
    e.amount -= n;
  };
  // 1) partial stacks
  for (const e of entries) {
    const q = cur(e);
    if (q > 0) put(e, Math.min(e.amount, slotsForQty(q) * STACK_LIMIT - q));
  }
  // 2) new slots, in the given order
  let free = Math.max(0, freeSlots);
  for (const e of entries) {
    if (e.amount <= 0) continue;
    const slots = Math.min(slotsForQty(e.amount), free);
    free -= slots;
    put(e, Math.min(e.amount, slots * STACK_LIMIT));
  }
  for (const e of entries) if (e.amount > 0) (leftover[e.group] as Record<string, number>)[e.id] = e.amount;
  return { stock: next, added, leftover };
}

export const stockIsEmpty = (stock: StockLike): boolean => GROUPS.every((g) => Object.values((stock[g] as Record<string, number> | undefined) ?? {}).every((n) => !(n > 0)));

export interface AddResult {
  save: SaveData;
  added: Stock;
  leftover: Stock;
}

const withBagStock = (save: SaveData, stock: Stock): SaveData => ({ ...save, materials: stock.materials as SaveData['materials'], consumables: stock.consumables as SaveData['consumables'], inventory: stock.gear });

// Add to the bag as much as fits (partial stacks first, then the free slots, in the order the keys are given). `reserve` slots are kept free for
// something else (e.g. the unique pieces of the same reward). The leftover is returned, never silently dropped.
export function addWithOverflow(save: SaveData, additions: Additions, opts: { reserve?: number; now?: number } = {}): AddResult {
  const free = Math.max(0, bagFreeSlots(save, opts.now) - Math.max(0, opts.reserve ?? 0));
  const placed = placeUnits(bagStock(save), additions, free);
  return { save: withBagStock(save, placed.stock), added: placed.added, leftover: placed.leftover };
}

// True when every unit would fit.
export function canAdd(save: SaveData, additions: Additions, now?: number): boolean {
  return stockIsEmpty(addWithOverflow(save, additions, { now }).leftover);
}

// Sources that must never refuse (a finished Dungeon run, a boss drop): the units go in even when the bag is over the limit, which the bag supports.
export function addForced(save: SaveData, additions: Additions): SaveData {
  const placed = placeUnits(bagStock(save), additions, Number.MAX_SAFE_INTEGER);
  return withBagStock(save, placed.stock);
}

// Room for `n` more stored gear instances (an unequip, a unique drop).
export function canAddInstances(save: SaveData, n: number, now?: number): boolean {
  return bagFreeSlots(save, now) >= n;
}

// ---- expansion -----------------------------------------------------------------------------------------------------

export interface ExpansionQuote {
  nextCapacity: number;
  goldCost: number;
}

// The next paid expansion step from the save's CURRENT bought capacity, or null once MAX_INVENTORY_CAPACITY is reached (also null for a save already
// past the table, e.g. a future balance change - never invents a step beyond what INVENTORY_EXPANSION_STEPS defines).
export function nextExpansion(save: Pick<SaveData, 'inventoryCapacity'>): ExpansionQuote | null {
  const current = normalizeInventoryCapacity(save.inventoryCapacity);
  const step = INVENTORY_EXPANSION_STEPS.find((s) => s.capacity > current);
  return step ? { nextCapacity: step.capacity, goldCost: step.goldCost } : null;
}

// Pure reducer, all-or-nothing: either Gold is spent AND capacity increases, or neither happens (null).
// Prepared for a future server-authoritative economy - callers never compute the cost/step themselves.
export function expandInventory(save: SaveData): SaveData | null {
  const quote = nextExpansion(save);
  if (!quote) return null;
  if (save.gold < quote.goldCost) return null;
  return { ...save, gold: save.gold - quote.goldCost, inventoryCapacity: quote.nextCapacity };
}
