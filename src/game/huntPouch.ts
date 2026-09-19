import { Materials, MaterialId } from './materials';

export interface HuntPouchItem {
  itemId: MaterialId;
  count: number;
}

export interface HuntPouchState {
  tier: number;
  items: HuntPouchItem[];
  lostItems: HuntPouchItem[];
}

export interface HuntPouchTierDef {
  tier: number;
  nameKey: string;
  slots: number;
  cost: { gold: number; materials: Partial<Record<MaterialId, number>> } | null;
}

export const HUNT_POUCH_TIERS: HuntPouchTierDef[] = [
  { tier: 1, nameKey: 'pouch_t1', slots: 2, cost: null },
  { tier: 2, nameKey: 'pouch_t2', slots: 4, cost: { gold: 300, materials: { leather_scrap: 20 } } },
  { tier: 3, nameKey: 'pouch_t3', slots: 6, cost: { gold: 1000, materials: { leather: 15, iron: 10 } } },
  { tier: 4, nameKey: 'pouch_t4', slots: 8, cost: { gold: 3000, materials: { demon_core: 5 } } },
];

export function getHuntPouchTierDef(tier: number): HuntPouchTierDef | undefined {
  return HUNT_POUCH_TIERS.find((t) => t.tier === tier);
}

export function nextHuntPouchTierDef(tier: number): HuntPouchTierDef | undefined {
  return getHuntPouchTierDef(tier + 1);
}

export function defaultHuntPouch(): HuntPouchState {
  return { tier: 1, items: [], lostItems: [] };
}

function addTo(list: HuntPouchItem[], itemId: MaterialId, count: number): void {
  const existing = list.find((i) => i.itemId === itemId);
  if (existing) existing.count += count;
  else list.push({ itemId, count });
}

/**
 * Allocates a batch of freshly-dropped materials into the pouch, respecting slot capacity.
 * A material already occupying a slot keeps stacking there; a brand-new material type only
 * claims a slot if one is still free — otherwise its whole batch is recorded as lost instead.
 * `order` is the zone's drop list (common → rare); it is walked in REVERSE here so that when several
 * new types compete for the last free slots of the same batch, the rarest wins (rare → uncommon →
 * common) and the commonest is the one recorded as lost. This only ranks the current batch: types
 * already sitting in the pouch from an earlier session are never evicted. `capacity` is the
 * caller-computed effective slot count (tier base + any active Battle Pass bonus).
 */
export function allocateToPouch(
  pouch: HuntPouchState,
  drops: Partial<Record<MaterialId, number>>,
  order: MaterialId[],
  capacity: number,
): HuntPouchState {
  const items = pouch.items.map((i) => ({ ...i }));
  const lostItems = pouch.lostItems.map((i) => ({ ...i }));

  for (const itemId of [...order].reverse()) {
    const count = drops[itemId] ?? 0;
    if (count <= 0) continue;
    const hasSlot = items.some((i) => i.itemId === itemId);
    if (hasSlot || items.length < capacity) {
      addTo(items, itemId, count);
    } else {
      addTo(lostItems, itemId, count);
    }
  }

  return { tier: pouch.tier, items, lostItems };
}

/**
 * Transfers pouch items into the main material stock, respecting the bag's slot limit —
 * a material that already has an open slot always goes through; a brand-new type only
 * transfers if a slot is still free. Anything that doesn't fit stays in the pouch.
 */
export function drainPouchToMaterials(
  pouchItems: HuntPouchItem[],
  materials: Materials,
  slotsUsed: number,
  maxSlots: number,
): { materials: Materials; remaining: HuntPouchItem[]; blocked: boolean } {
  const nextMaterials = { ...materials };
  const remaining: HuntPouchItem[] = [];
  let usedSlots = slotsUsed;
  let blocked = false;
  for (const item of pouchItems) {
    const alreadyHasSlot = (nextMaterials[item.itemId] ?? 0) > 0;
    if (alreadyHasSlot || usedSlots < maxSlots) {
      if (!alreadyHasSlot) usedSlots++;
      nextMaterials[item.itemId] = (nextMaterials[item.itemId] ?? 0) + item.count;
    } else {
      remaining.push(item);
      blocked = true;
    }
  }
  return { materials: nextMaterials, remaining, blocked };
}
