import {
  addBattlePassXp,
  buildHuntSession,
  computeCP,
  computeHuntingStatus,
  playerLevel,
  SaveData,
  withHuntProgress,
} from './engine';
import { DEFAULT_HUNTING_DEPTH, getHuntingZone, HuntingDepth, isDepthUnlocked, isZoneOpen } from './huntingZones';
import { HuntItem, PendingHuntReward } from './huntSession';
import { UniqueDrop, addUniqueInstance } from './uniques';
import { addWithOverflow, canAddInstances, inventoryCapacity, inventorySlotsUsed } from './inventory';
import { baseGoldValue } from './economy';
import { MaterialId } from './materials';
import { gearInstanceCount, maxGearInstances } from './gearInstances';
import { recordHuntTime, recordKills, withStats } from './stats';
import { isServerItemAuthority } from './itemAuthority';
import { claimId, queueMaterialClaim } from './materialClaims';
import { saveSkillEffects } from './heroSkills';
import T from './tunables';

// The lifecycle of a Hunting session as three pure, atomic transitions on the save: start -> stop -> claim.
// Each returns the WHOLE next save, or null when rejected (nothing changed). The UI commits the result in one step, so a
// reload can never observe half of a transition, and none of them can be applied twice (stop needs an active session,
// claim needs the matching pending reward, start refuses while a reward is pending).
//
// RNG: only the session simulation (inside computeHuntingStatus, seeded by the session itself) rolls anything, and it
// runs at STOP. The reward it produces is frozen into `pendingHuntReward`; claim just applies it — no clock, no RNG.
//
// The loot goes into the one inventory at CLAIM time (planHuntClaim): the free space of that moment, rarest first, existing partial stacks first.
// What does not fit is left behind for good (shown on the reward screen, never given back, queued or converted) - except unique pieces and units the
// player owned before this rule (`owed`), which stay in the pending reward until there is room. Gold and XP are never lost.

const MS_PER_HOUR = 3600 * 1000;
const isFiniteNow = (now: number): boolean => typeof now === 'number' && Number.isFinite(now) && now > 0;

// Stop the active session: simulates it, pays the potions it used, commits the sub-level progress, and leaves a pending reward (gold / XP / pass XP /
// the drops it rolled, which are placed in the inventory when the reward is claimed).
export function applyHuntStop(save: SaveData, now: number): SaveData | null {
  if (!save.activeHuntingZone || save.pendingHuntReward || !isFiniteNow(now)) return null;
  const zoneId = save.activeHuntingZone;
  const depth: HuntingDepth = save.activeHuntingDepth ?? DEFAULT_HUNTING_DEPTH;
  const zone = getHuntingZone(zoneId);
  const status = computeHuntingStatus(save, now);
  const startedAt = save.huntingOfflineStart;
  const timeMs = Number.isFinite(now - startedAt) ? Math.max(0, now - startedAt) : 0;
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
    skillTally: status.skillTally,
    totalDamage: Math.round(status.totalDamage),
    kills: status.kills,
    gold: status.goldReady,
    xp: status.xpReady,
    bpXp: Math.floor((status.pendingMs / MS_PER_HOUR) * T.battlePass.xpPerHuntHour),
    drops: { ...status.drops },
    lost: [],
    uniques: status.uniques.map((u) => ({ ...u, substats: u.substats.map((s) => ({ ...s })) })),
    // Web build: the uniques are rolled by the server when the reward is claimed (withServerUniques below), never here; the reward carries the luck the hero had.
    ...(isServerItemAuthority() && (zone?.uniques?.length ?? 0) > 0 && status.pendingMs > 0 ? { uniqueRoll: { luck: saveSkillEffects(save).huntUniqueMult } } : {}),
  };
  // Lifetime statistics (stats.ts): the session's wins and the unique pieces it rolled are counted once, here, when the session ends.
  const counted = recordHuntTime(recordKills(save, zoneId, status.kills, status.uniques.length), status.pendingMs);
  return {
    ...counted,
    activeHuntingZone: null,
    activeHuntingDepth: null,
    huntSession: null,
    huntProgress: zone ? withHuntProgress(save, zoneId, depth, status) : save.huntProgress,
    consumables,
    pendingHuntReward,
  };
}

// Materials in the order a claim fills the inventory: the zone's drop list walked rarest first (rare -> uncommon -> common), anything the zone does not
// list (a reward of an old save) after it, dearest first.
export function claimOrder(zoneId: string, ids: MaterialId[]): MaterialId[] {
  const zoneOrder = (getHuntingZone(zoneId)?.drops.map((d) => d.material) ?? []).reverse();
  const known = zoneOrder.filter((id) => ids.includes(id));
  const rest = ids.filter((id) => !zoneOrder.includes(id)).sort((x, y) => baseGoldValue(y) - baseGoldValue(x));
  return [...known, ...rest];
}

const ordered = (zoneId: string, rec: Partial<Record<MaterialId, number>> | undefined): Partial<Record<MaterialId, number>> => {
  const ids = (Object.keys(rec ?? {}) as MaterialId[]).filter((id) => (rec?.[id] ?? 0) > 0);
  return Object.fromEntries(claimOrder(zoneId, ids).map((id) => [id, rec![id]])) as Partial<Record<MaterialId, number>>;
};

export interface HuntClaimPlan {
  save: SaveData; // the save with the uniques and the materials that fit already placed (no gold / XP)
  added: Partial<Record<MaterialId, number>>; // materials that go into the inventory
  leftBehind: HuntItem[]; // rolled this session and without room: gone for good
  owedHeld: Partial<Record<MaterialId, number>>; // owed units that stay in the pending reward
  uniquesLeft: UniqueDrop[]; // uniques that stay in the pending reward
  slotsBefore: number;
  slotsAfter: number;
  capacity: number;
}

// What claiming `reward` does to the inventory of `save`, without paying anything: ONE pure rule shared by the claim, the reward screen and the live
// preview of the running hunt. Order: the unique pieces first (one slot each, so a pile of Farrapos can never take the slot of a unique), then the
// units the player already owned (`owed`), then this session's drops rarest first - each into the existing partial stacks first, then the free slots.
export function planHuntClaim(save: SaveData, reward: Pick<PendingHuntReward, 'id' | 'zoneId' | 'endedAt' | 'drops' | 'uniques' | 'owed'>): HuntClaimPlan {
  const slotsBefore = inventorySlotsUsed(save);
  let next = save;
  const uniquesLeft: UniqueDrop[] = [];
  for (const drop of reward.uniques ?? []) {
    if (canAddInstances(next, 1) && gearInstanceCount(next) < maxGearInstances()) next = addUniqueInstance(next, drop, reward.id, reward.endedAt);
    else uniquesLeft.push(drop);
  }
  const owed = addWithOverflow(next, { materials: ordered(reward.zoneId, reward.owed) });
  const dropped = addWithOverflow(owed.save, { materials: ordered(reward.zoneId, reward.drops) });
  const added: Partial<Record<MaterialId, number>> = {};
  for (const part of [owed.added.materials, dropped.added.materials]) {
    for (const [id, n] of Object.entries(part) as [MaterialId, number][]) added[id] = (added[id] ?? 0) + n;
  }
  return {
    save: dropped.save,
    added,
    leftBehind: (Object.entries(dropped.leftover.materials) as [MaterialId, number][]).map(([itemId, count]) => ({ itemId, count })),
    owedHeld: owed.leftover.materials,
    uniquesLeft,
    slotsBefore,
    slotsAfter: inventorySlotsUsed(dropped.save),
    capacity: inventoryCapacity(save),
  };
}

// Apply the pending reward exactly as it was frozen and clear it. `id` must be the pending reward's own id, so a stale
// or repeated click (or an old modal) can never claim something else or claim twice.
export function applyHuntClaim(save: SaveData, id: string): SaveData | null {
  const p = save.pendingHuntReward;
  if (!p || p.id !== id) return null;
  if (p.uniqueRoll) return null; // the server still has to roll the uniques of this reward (withServerUniques): claiming now would throw them away
  const { battlePassLevel, battlePassXp } = addBattlePassXp(save, p.bpXp);
  const plan = planHuntClaim(save, p);
  // Web build: the units that went into the bag are reported for the server's roll of which ones are tradeable (materialClaims.ts); nothing else about the claim changes.
  const placed = Object.values(plan.added).reduce((a, n) => a + (n ?? 0), 0);
  const paid: SaveData = queueMaterialClaim(
    {
      ...plan.save,
      gold: save.gold + p.gold,
      xp: save.xp + p.xp, // past level 100 the XP counts into paragon levels (paragon.ts)
      battlePassLevel,
      battlePassXp,
      pendingHuntReward: null,
    },
    { id: claimId('h', p.id, placed), activity: 'hunt', place: p.zoneId, depth: p.depth, durationMs: p.pendingMs, units: plan.added, at: p.endedAt },
  );
  // Whatever the bag has no room for among the unique pieces (and the units owed from before the inventory rule) is NOT destroyed: the reward stays
  // pending with only those left (gold / XP / drops are already paid and zeroed, so claiming again is harmless) and the player frees space and claims again.
  if (plan.uniquesLeft.length === 0 && Object.keys(plan.owedHeld).length === 0) return paid;
  const owed = Object.keys(plan.owedHeld).length > 0 ? { owed: plan.owedHeld } : {};
  return { ...paid, pendingHuntReward: { ...p, gold: 0, xp: 0, bpXp: 0, drops: {}, lost: [], owed: undefined, ...owed, uniques: plan.uniquesLeft } };
}

// True while the reward waits for the server's roll of its unique drops (web build). The UI asks mint-item, then calls withServerUniques; nothing else may claim it.
export const needsServerUniques = (reward: Pick<PendingHuntReward, 'uniqueRoll'> | null | undefined): boolean => !!reward?.uniqueRoll;

// Puts what the SERVER rolled into the pending reward (and counts the finds, once). Returns null when the reward is not the one waiting for it. The drops carry their certificates.
export function withServerUniques(save: SaveData, id: string, uniques: UniqueDrop[]): SaveData | null {
  const p = save.pendingHuntReward;
  if (!p || p.id !== id || !p.uniqueRoll) return null;
  const { uniqueRoll: _done, ...rest } = p;
  void _done;
  const next: SaveData = { ...save, pendingHuntReward: { ...rest, uniques: uniques.map((u) => ({ ...u, substats: u.substats.map((s) => ({ ...s })) })) } };
  return uniques.length > 0 ? withStats(next, (s) => ({ uniquesFound: s.uniquesFound + uniques.length })) : next;
}

// True when claiming left something in the pending reward because the bag had no free slot for it.
export function huntClaimBlocked(claimed: SaveData): boolean {
  const p = claimed.pendingHuntReward;
  return !!p && (p.uniques.length > 0 || Object.keys(p.owed ?? {}).length > 0);
}

// Can a session for `zoneId` at `depth` be requested now? (known + unlocked zone, unlocked depth, hero not busy mining /
// woodcutting, and not the very session already running.)
function canRequestHunt(save: SaveData, zoneId: string, depth: HuntingDepth): boolean {
  const zone = getHuntingZone(zoneId);
  if (!zone) return false;
  if (!isZoneOpen(zone, save.highestDungeonFloor, playerLevel(save.xp)) || !isDepthUnlocked(zone, depth, computeCP(save))) return false;
  if (save.activeOreId || save.activeWoodId || save.craftJob) return false;
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
    huntSession: buildHuntSession({ ...save, activeHuntingZone: zoneId }, now),
  };
}

// What choosing a zone in the UI does. Idle: starts it. While ANOTHER session is running: never a silent stop+claim —
// it only ends that session (applyHuntStop), which leaves its pending reward on screen (gold, promotion, materials and
// what the inventory will take); the player claims it and then picks the new zone normally. A pending reward blocks
// everything (null). Returns the next save; `.pendingHuntReward` set means "the running session was just ended".
export function requestHuntStart(save: SaveData, zoneId: string, depth: HuntingDepth, now: number): SaveData | null {
  if (!isFiniteNow(now) || save.pendingHuntReward) return null;
  if (!canRequestHunt(save, zoneId, depth)) return null;
  return save.activeHuntingZone ? applyHuntStop(save, now) : applyHuntStart(save, zoneId, depth, now);
}
