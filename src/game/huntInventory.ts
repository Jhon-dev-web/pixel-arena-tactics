import type { SaveData } from './engine';
import { addForced, bagFreeSlots, inventoryCapacity, inventorySlotsUsed } from './inventory';
import { planHuntClaim } from './huntLifecycle';
import { HuntItem } from './huntSession';
import { MaterialId } from './materials';
import { UniqueDrop } from './uniques';

// "Will the loot of this hunt fit the inventory?" for the Hunt screens. NOT a rule of its own: it asks planHuntClaim (the very function the claim
// uses) what would happen if the hunt stopped with these drops, so the screen and the claim can never disagree. The "full in ~" time is an ESTIMATE:
// it extrapolates the drops so far at their current rate.

export interface HuntInventoryStatus {
  used: number;
  capacity: number;
  free: number;
  fits: boolean;
  leftBehind: HuntItem[]; // what the claim would leave behind right now
  missingSlots: number; // slots short to keep all of it
}

type Drops = Partial<Record<MaterialId, number>>;

export function huntInventoryStatus(save: SaveData, zoneId: string, drops: Drops, uniques: UniqueDrop[] = []): HuntInventoryStatus {
  const plan = planHuntClaim(save, { id: 'preview', zoneId, endedAt: 0, drops, uniques, owed: undefined });
  const left = plan.leftBehind.filter((i) => i.count > 0);
  // slots needed to keep all of it: place the leftover without a limit and see how many more slots that takes
  const forced = left.length > 0 ? addForced(plan.save, { materials: Object.fromEntries(left.map((i) => [i.itemId, i.count])) as Drops }) : plan.save;
  const used = inventorySlotsUsed(save);
  return {
    used,
    capacity: inventoryCapacity(save),
    free: bagFreeSlots(save),
    fits: left.length === 0,
    leftBehind: left,
    missingSlots: Math.max(0, inventorySlotsUsed(forced) - plan.slotsAfter),
  };
}

// Hours from now until the inventory stops having room for this hunt's loot, extrapolating `drops` (what the session holds now) with `perHour`. 0 when it
// is already over, null when it fits all the way to `maxHours` (the time left until the hunt's own storage cap).
export function hoursUntilInventoryFull(save: SaveData, zoneId: string, drops: Drops, perHour: Drops, maxHours: number, uniques: UniqueDrop[] = []): number | null {
  if (!(maxHours > 0)) return null;
  const at = (h: number): boolean => {
    const projected: Drops = { ...drops };
    for (const [id, rate] of Object.entries(perHour) as [MaterialId, number][]) projected[id] = Math.floor((drops[id] ?? 0) + rate * h);
    return huntInventoryStatus(save, zoneId, projected, uniques).fits;
  };
  if (!at(0)) return 0;
  if (at(maxHours)) return null;
  let lo = 0;
  let hi = maxHours;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid)) lo = mid;
    else hi = mid;
  }
  return hi;
}
