import type { SaveData } from './engine';
import { addWithOverflow } from './inventory';
import { getMaterial, MaterialId } from './materials';
import { baseGoldValue } from './economy';
import { HuntItem, PendingHuntReward } from './huntSession';

// The Hunting Pouch (a separate 3-8 slot container the hunt loot went through) no longer exists: hunt loot goes straight into the inventory. This is the
// ONE place that still knows its old save shape, and it only runs at load (engine.normalizeSave) on a save that still carries a `huntPouch`:
//   - a tier above 1 that the player paid for becomes permanent bag capacity (+LEGACY_POUCH_SLOTS_PER_TIER per tier above 1), granted exactly once
//     (`pouchMigrated` is set with it);
//   - every item still sitting in the pouch moves into the inventory if it fits (rarest first); what does not fit is NOT lost: it stays claimable in the
//     pending reward (`owed`), created on the spot when there is none;
//   - a reward the old rule had already allocated (its drops are the pouch's content) must not be placed twice: its `drops` are emptied.
// The pouch fields are dropped by the loader afterwards.

export const LEGACY_POUCH_SLOTS_PER_TIER = 2;
const MAX_LEGACY_TIER = 4;

function pouchItems(raw: unknown): HuntItem[] {
  if (!Array.isArray(raw)) return [];
  const totals = new Map<MaterialId, number>();
  for (const i of raw as Partial<HuntItem>[]) {
    const count = Math.floor(Number(i?.count));
    if (i && typeof i.itemId === 'string' && getMaterial(i.itemId) && Number.isFinite(count) && count > 0) totals.set(i.itemId, (totals.get(i.itemId) ?? 0) + Math.min(count, 1e9));
  }
  return [...totals.entries()].map(([itemId, count]) => ({ itemId, count }));
}

export function legacyPouchTier(raw: unknown): number {
  const tier = Math.floor(Number((raw as { tier?: unknown } | null | undefined)?.tier));
  return Number.isFinite(tier) ? Math.min(MAX_LEGACY_TIER, Math.max(1, tier)) : 1;
}

function syntheticReward(owed: Partial<Record<MaterialId, number>>): PendingHuntReward {
  return {
    id: 'legacy-pouch',
    zoneId: '',
    depth: 'shallow',
    startedAt: 0,
    endedAt: 0,
    timeMs: 0,
    pendingMs: 0,
    startCeiling: 1,
    ceilingSubLevel: 1,
    promotions: 0,
    promotionLosses: 0,
    promotionWins: 0,
    promotionRequired: 0,
    gold: 0,
    xp: 0,
    bpXp: 0,
    drops: {},
    lost: [],
    owed,
    uniques: [],
  };
}

// `rawPouch` = the save's `huntPouch` as loaded (any shape); `pendingWasLegacy` = the pending reward was written under the pouch rule (it recorded a
// pouch capacity), i.e. its drops already live in the pouch.
export function migrateLegacyPouch(save: SaveData, rawPouch: unknown, pendingWasLegacy: boolean): SaveData {
  if (!rawPouch || typeof rawPouch !== 'object') return save;
  let next = save;
  if (!next.pouchMigrated) {
    next = { ...next, inventoryBonusSlots: (next.inventoryBonusSlots ?? 0) + LEGACY_POUCH_SLOTS_PER_TIER * (legacyPouchTier(rawPouch) - 1), pouchMigrated: true };
  }
  const items = pouchItems((rawPouch as { items?: unknown }).items).sort((a, b) => baseGoldValue(b.itemId) - baseGoldValue(a.itemId));
  if (next.pendingHuntReward && pendingWasLegacy) next = { ...next, pendingHuntReward: { ...next.pendingHuntReward, drops: {} } };
  if (items.length === 0) return next;
  const placed = addWithOverflow(next, { materials: Object.fromEntries(items.map((i) => [i.itemId, i.count])) });
  next = placed.save;
  const owed = placed.leftover.materials;
  if (Object.keys(owed).length === 0) return next;
  const pending = next.pendingHuntReward;
  if (!pending) return { ...next, pendingHuntReward: syntheticReward(owed) };
  const merged: Partial<Record<MaterialId, number>> = { ...(pending.owed ?? {}) };
  for (const [id, n] of Object.entries(owed) as [MaterialId, number][]) merged[id] = (merged[id] ?? 0) + n;
  return { ...next, pendingHuntReward: { ...pending, owed: merged } };
}
