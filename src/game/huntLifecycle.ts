import {
  addBattlePassXp,
  buildHuntSession,
  computeCP,
  computeHuntingStatus,
  effectivePouchSlots,
  playerLevel,
  SaveData,
  withHuntProgress,
} from './engine';
import { DEFAULT_HUNTING_DEPTH, getHuntingZone, HuntingDepth, isDepthUnlocked, isZoneUnlocked } from './huntingZones';
import { allocateToPouch, drainPouchToMaterials, HuntPouchItem } from './huntPouch';
import { PendingHuntReward } from './huntSession';
import { inventorySlotsUsed, MAX_SLOTS } from './inventory';
import T from './tunables';

// The lifecycle of a Hunting session as three pure, atomic transitions on the save: start -> stop -> claim.
// Each returns the WHOLE next save, or null when rejected (nothing changed). The UI commits the result in one step, so a
// reload can never observe half of a transition, and none of them can be applied twice (stop needs an active session,
// claim needs the matching pending reward, start refuses while a reward is pending).
//
// RNG: only the session simulation (inside computeHuntingStatus, seeded by the session itself) rolls anything, and it
// runs at STOP. The reward it produces is frozen into `pendingHuntReward`; claim just applies it — no clock, no RNG.
//
// A full pouch is intentional design (see huntPouch.ts): what does not fit is recorded in `pendingHuntReward.lost` for
// the player to see and is never given back, queued, or converted.

const MS_PER_HOUR = 3600 * 1000;
const isFiniteNow = (now: number): boolean => typeof now === 'number' && Number.isFinite(now) && now > 0;

// Stop the active session: simulates it, allocates its drops into the pouch (capacity = tier + Battle Pass at this
// moment), pays the potions it used, commits the sub-level progress, and leaves a pending reward (gold / XP / pass XP).
export function applyHuntStop(save: SaveData, now: number): SaveData | null {
  if (!save.activeHuntingZone || save.pendingHuntReward || !isFiniteNow(now)) return null;
  const zoneId = save.activeHuntingZone;
  const depth: HuntingDepth = save.activeHuntingDepth ?? DEFAULT_HUNTING_DEPTH;
  const zone = getHuntingZone(zoneId);
  const status = computeHuntingStatus(save, now);
  const startedAt = save.huntingOfflineStart;
  const timeMs = Number.isFinite(now - startedAt) ? Math.max(0, now - startedAt) : 0;
  const capacity = effectivePouchSlots(save, now);

  const huntPouch = zone ? allocateToPouch(save.huntPouch, status.drops, zone.drops.map((d) => d.material), capacity) : save.huntPouch;
  const lost: HuntPouchItem[] = [];
  for (const item of huntPouch.lostItems) {
    const before = save.huntPouch.lostItems.find((i) => i.itemId === item.itemId)?.count ?? 0;
    if (item.count > before) lost.push({ itemId: item.itemId, count: item.count - before });
  }
  const stock = (n: number | undefined): number => n ?? 0;
  const consumables = {
    ...save.consumables,
    greater_elixir: Math.max(0, stock(save.consumables.greater_elixir) - status.potionsUsed.greater_elixir),
    large_hp: Math.max(0, stock(save.consumables.large_hp) - status.potionsUsed.large_hp),
    small_hp: Math.max(0, stock(save.consumables.small_hp) - status.potionsUsed.small_hp),
  };
  const pendingHuntReward: PendingHuntReward = {
    id: `${Math.floor(startedAt)}:${zoneId}:${depth}:${Math.floor(now)}`,
    zoneId,
    depth,
    startedAt: Math.floor(startedAt),
    endedAt: Math.floor(now),
    timeMs: Math.floor(timeMs),
    pendingMs: Math.floor(status.pendingMs),
    startCeiling: status.startCeiling,
    ceilingSubLevel: status.ceilingSubLevel,
    promotions: status.promotions,
    promotionLosses: status.promotionLosses,
    promotionWins: status.promotionWins,
    promotionRequired: status.promotionRequired,
    gold: status.goldReady,
    xp: status.xpReady,
    bpXp: Math.floor((status.pendingMs / MS_PER_HOUR) * T.battlePass.xpPerHuntHour),
    drops: { ...status.drops },
    lost,
    pouchCapacity: capacity,
  };
  return {
    ...save,
    activeHuntingZone: null,
    activeHuntingDepth: null,
    huntSession: null,
    huntPouch,
    huntProgress: zone ? withHuntProgress(save, zoneId, depth, status) : save.huntProgress,
    consumables,
    pendingHuntReward,
  };
}

// Apply the pending reward exactly as it was frozen and clear it. `id` must be the pending reward's own id, so a stale
// or repeated click (or an old modal) can never claim something else or claim twice.
export function applyHuntClaim(save: SaveData, id: string): SaveData | null {
  const p = save.pendingHuntReward;
  if (!p || p.id !== id) return null;
  const { battlePassLevel, battlePassXp } = addBattlePassXp(save, p.bpXp);
  const atCap = playerLevel(save.xp) >= 100;
  const { materials, remaining } = drainPouchToMaterials(save.huntPouch.items, save.materials, inventorySlotsUsed(save), MAX_SLOTS);
  return {
    ...save,
    gold: save.gold + p.gold,
    xp: atCap ? save.xp : save.xp + p.xp,
    materials,
    // What the bag had no room for stays in the pouch (the existing "bag full" rule); only the pouch overflow is gone.
    huntPouch: { ...save.huntPouch, items: remaining, lostItems: [] },
    battlePassLevel,
    battlePassXp,
    pendingHuntReward: null,
  };
}

// True when claiming left something in the pouch because the bag had no free slot for it.
export function huntClaimBlocked(claimed: SaveData): boolean {
  return claimed.huntPouch.items.length > 0;
}

// Can a session for `zoneId` at `depth` be requested now? (known + unlocked zone, unlocked depth, hero not busy mining /
// woodcutting, and not the very session already running.)
function canRequestHunt(save: SaveData, zoneId: string, depth: HuntingDepth): boolean {
  const zone = getHuntingZone(zoneId);
  if (!zone) return false;
  if (!isZoneUnlocked(zone, save.highestDungeonFloor) || !isDepthUnlocked(zone, depth, computeCP(save))) return false;
  if (save.activeOreId || save.activeWoodId) return false;
  return !(save.activeHuntingZone === zoneId && save.activeHuntingDepth === depth);
}

// Start hunting `zoneId` at `depth`. Only from idle: refused (null) while a reward is pending or another session is
// still running (that one has to be stopped and claimed first, see requestHuntStart), or for a locked zone/depth.
export function applyHuntStart(save: SaveData, zoneId: string, depth: HuntingDepth, now: number): SaveData | null {
  if (!isFiniteNow(now) || save.pendingHuntReward || save.activeHuntingZone) return null;
  if (!canRequestHunt(save, zoneId, depth)) return null;
  return {
    ...save,
    activeHuntingZone: zoneId,
    activeHuntingDepth: depth,
    huntingOfflineStart: now,
    huntSession: buildHuntSession(save, now),
  };
}

// What choosing a zone in the UI does. Idle: starts it. While ANOTHER session is running: never a silent stop+claim —
// it only ends that session (applyHuntStop), which leaves its pending reward on screen (gold, promotion, materials and
// anything the pouch could not hold); the player claims it and then picks the new zone normally. A pending reward blocks
// everything (null). Returns the next save; `.pendingHuntReward` set means "the running session was just ended".
export function requestHuntStart(save: SaveData, zoneId: string, depth: HuntingDepth, now: number): SaveData | null {
  if (!isFiniteNow(now) || save.pendingHuntReward) return null;
  if (!canRequestHunt(save, zoneId, depth)) return null;
  return save.activeHuntingZone ? applyHuntStop(save, now) : applyHuntStart(save, zoneId, depth, now);
}
