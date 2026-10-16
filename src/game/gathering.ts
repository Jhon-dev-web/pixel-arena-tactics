import { addBattlePassXp, computeMiningStatus, computeWoodcuttingStatus, SaveData, snapshotGatherPass } from './engine';
import { addWithOverflow } from './inventory';
import { recordGather } from './stats';
import { MaterialId } from './materials';
import { getOreTier, isOreTierUnlocked } from './ores';
import { skillLevel } from './skills';
import { gatherByProducts } from './mastery';
import { emptyGems } from './gems';
import T from './tunables';
import { eventSkillXpMultiplier } from './leagueEvents';
import { getWoodTier, isWoodTierUnlocked } from './woodcutting';

// Mining / Woodcutting sessions as pure transitions on the save (the same shape as gardenActions.ts): the UI only decides WHEN, and the simulator
// calls these very functions. A session is: pick a tier (starts the clock), collect (units + skill XP, ends the session).

export type GatherKind = 'mining' | 'woodcutting';

// Mastery by-products of a collection (mastery.ts): Refining Dust and gems, added to the save on top of the units. `dust` is what actually fit the inventory.
function withByProducts(placed: SaveData, kind: GatherKind, units: number, skillXpBefore: number): { save: SaveData; dust: number; gems: number } {
  const level = skillLevel(skillXpBefore, kind);
  const by = gatherByProducts(kind, level, units, skillXpBefore);
  let save = placed;
  let dust = 0;
  if (by.dust > 0) {
    const r = addWithOverflow(save, { materials: { refining_dust: by.dust } });
    save = r.save;
    dust = by.dust - (r.leftover.materials.refining_dust ?? 0);
  }
  let gems = 0;
  const gemTotals = { ...(save.gems ?? emptyGems()) };
  for (const [id, n] of Object.entries(by.gems)) {
    gemTotals[id as keyof typeof gemTotals] = (gemTotals[id as keyof typeof gemTotals] ?? 0) + (n as number);
    gems += n as number;
  }
  return { save: gems > 0 ? { ...save, gems: gemTotals } : save, dust, gems };
}

export interface GatherClaim {
  save: SaveData;
  kind: GatherKind;
  material: MaterialId;
  units: number; // what the session produced
  leftBehind: number; // the part of it the inventory had no room for (gone for good, shown to the player)
  gold: number;
  hours: number;
  // Mastery by-products added to the save (0 below the perks' levels)
  dust: number;
  gems: number;
}

// The skill XP of a collected session: units x xpPerUnit, plus what a League profession event adds over the part of the session it covered (leagueEvents.ts; exactly units x xpPerUnit without one).
function gatherXp(save: SaveData, kind: GatherKind, units: number, startedAt: number, pendingMs: number): number {
  const base = units * T.skills.xpPerUnit;
  const mult = eventSkillXpMultiplier(save, kind, startedAt, startedAt + pendingMs);
  return mult === 1 ? base : Math.round(base * mult);
}

const validNow = (now: number): boolean => typeof now === 'number' && Number.isFinite(now) && now > 0;

// Collect the running session of `kind`: the accrued units go to the inventory (as many as fit - a gathering session is passive, so what has no room is
// left behind and reported), the skill gets units x xpPerUnit, the session ends. Both skills pay the same Battle Pass XP
// per hour collected (T.battlePass.xpPerMiningHour, one rule for the two so they cannot diverge). null = no session running (or a bad clock).
export function applyClaimGathering(save: SaveData, kind: GatherKind, now: number): GatherClaim | null {
  if (!validNow(now)) return null;
  if (kind === 'mining') {
    if (!save.activeOreId) return null;
    const status = computeMiningStatus(save, now);
    if (!status.oreId) return null;
    const hours = status.pendingMs / 3600000;
    const { battlePassLevel, battlePassXp } = addBattlePassXp(save, Math.floor(hours * T.battlePass.xpPerMiningHour));
    const placed = addWithOverflow(save, { materials: { [status.oreId]: status.oreReady } });
    const next: SaveData = recordGather({
      ...placed.save,
      gold: save.gold + status.goldReady,
      skillXp: { ...save.skillXp, mining: save.skillXp.mining + gatherXp(save, 'mining', status.oreReady, save.lastMiningClaim, status.pendingMs) },
      activeOreId: null,
      miningPass: null,
      lastMiningClaim: now,
      battlePassLevel,
      battlePassXp,
    }, 'mining', status.oreReady - (placed.leftover.materials[status.oreId] ?? 0));
    const by = withByProducts(next, kind, status.oreReady, save.skillXp.mining);
    return { save: by.save, kind, material: status.oreId, units: status.oreReady, leftBehind: placed.leftover.materials[status.oreId] ?? 0, gold: status.goldReady, hours, dust: by.dust, gems: by.gems };
  }
  if (!save.activeWoodId) return null;
  const status = computeWoodcuttingStatus(save, now);
  if (!status.woodId) return null;
  const hours = status.pendingMs / 3600000;
  const { battlePassLevel, battlePassXp } = addBattlePassXp(save, Math.floor(hours * T.battlePass.xpPerMiningHour));
  const placed = addWithOverflow(save, { materials: { [status.woodId]: status.woodReady } });
  const next: SaveData = recordGather({
    ...placed.save,
    gold: save.gold + status.goldReady,
    skillXp: { ...save.skillXp, woodcutting: save.skillXp.woodcutting + gatherXp(save, 'woodcutting', status.woodReady, save.lastWoodcuttingClaim, status.pendingMs) },
    activeWoodId: null,
    woodcuttingPass: null,
    lastWoodcuttingClaim: now,
    battlePassLevel,
    battlePassXp,
  }, 'woodcutting', status.woodReady - (placed.leftover.materials[status.woodId] ?? 0));
  const by = withByProducts(next, kind, status.woodReady, save.skillXp.woodcutting);
  return { save: by.save, kind, material: status.woodId, units: status.woodReady, leftBehind: placed.leftover.materials[status.woodId] ?? 0, gold: status.goldReady, hours, dust: by.dust, gems: by.gems };
}

export interface GatherStart {
  save: SaveData;
  // Set when a session of the OTHER tier was running: it is collected first (switching tiers never throws away what was gathered).
  claimed: GatherClaim | null;
}

// Start gathering `tierId` now. null = refused: unknown or still locked tier, that very tier already running, or another background
// activity (Hunting, the other gathering skill) in the way. Switching from a running tier of the same skill collects it first.
export function applyStartGathering(save: SaveData, kind: GatherKind, tierId: string, now: number): GatherStart | null {
  if (!validNow(now) || save.activeHuntingZone) return null;
  if (kind === 'mining') {
    const tier = getOreTier(tierId);
    if (!tier || save.activeWoodId || save.activeOreId === tier.id || !isOreTierUnlocked(tier, skillLevel(save.skillXp.mining, 'mining'))) return null;
    const claimed = save.activeOreId ? applyClaimGathering(save, kind, now) : null;
    const base = claimed ? claimed.save : save;
    return { save: { ...base, activeOreId: tier.id, lastMiningClaim: now, miningPass: snapshotGatherPass(base, base.miningCapHours) }, claimed };
  }
  const tier = getWoodTier(tierId);
  if (!tier || save.activeOreId || save.activeWoodId === tier.id || !isWoodTierUnlocked(tier, skillLevel(save.skillXp.woodcutting, 'woodcutting'))) return null;
  const claimed = save.activeWoodId ? applyClaimGathering(save, kind, now) : null;
  const base = claimed ? claimed.save : save;
  return { save: { ...base, activeWoodId: tier.id, lastWoodcuttingClaim: now, woodcuttingPass: snapshotGatherPass(base, base.woodcuttingCapHours) }, claimed };
}
