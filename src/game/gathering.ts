import { addBattlePassXp, computeMiningStatus, computeWoodcuttingStatus, SaveData, snapshotGatherPass } from './engine';
import { MaterialId } from './materials';
import { getOreTier, isOreTierUnlocked } from './ores';
import { skillLevel } from './skills';
import T from './tunables';
import { getWoodTier, isWoodTierUnlocked } from './woodcutting';

// Mining / Woodcutting sessions as pure transitions on the save (the same shape as gardenActions.ts): the UI only decides WHEN, and the simulator
// calls these very functions. A session is: pick a tier (starts the clock), collect (units + skill XP, ends the session).

export type GatherKind = 'mining' | 'woodcutting';

export interface GatherClaim {
  save: SaveData;
  kind: GatherKind;
  material: MaterialId;
  units: number;
  gold: number;
  hours: number;
}

const validNow = (now: number): boolean => typeof now === 'number' && Number.isFinite(now) && now > 0;

// Collect the running session of `kind`: the accrued units go to the bag, the skill gets units x xpPerUnit, the session ends. Both skills pay the same Battle Pass XP
// per hour collected (T.battlePass.xpPerMiningHour, one rule for the two so they cannot diverge). null = no session running (or a bad clock).
export function applyClaimGathering(save: SaveData, kind: GatherKind, now: number): GatherClaim | null {
  if (!validNow(now)) return null;
  if (kind === 'mining') {
    if (!save.activeOreId) return null;
    const status = computeMiningStatus(save, now);
    if (!status.oreId) return null;
    const hours = status.pendingMs / 3600000;
    const { battlePassLevel, battlePassXp } = addBattlePassXp(save, Math.floor(hours * T.battlePass.xpPerMiningHour));
    const next: SaveData = {
      ...save,
      gold: save.gold + status.goldReady,
      materials: { ...save.materials, [status.oreId]: (save.materials[status.oreId] ?? 0) + status.oreReady },
      skillXp: { ...save.skillXp, mining: save.skillXp.mining + status.oreReady * T.skills.xpPerUnit },
      activeOreId: null,
      miningPass: null,
      lastMiningClaim: now,
      battlePassLevel,
      battlePassXp,
    };
    return { save: next, kind, material: status.oreId, units: status.oreReady, gold: status.goldReady, hours };
  }
  if (!save.activeWoodId) return null;
  const status = computeWoodcuttingStatus(save, now);
  if (!status.woodId) return null;
  const hours = status.pendingMs / 3600000;
  const { battlePassLevel, battlePassXp } = addBattlePassXp(save, Math.floor(hours * T.battlePass.xpPerMiningHour));
  const next: SaveData = {
    ...save,
    gold: save.gold + status.goldReady,
    materials: { ...save.materials, [status.woodId]: (save.materials[status.woodId] ?? 0) + status.woodReady },
    skillXp: { ...save.skillXp, woodcutting: save.skillXp.woodcutting + status.woodReady * T.skills.xpPerUnit },
    activeWoodId: null,
    woodcuttingPass: null,
    lastWoodcuttingClaim: now,
    battlePassLevel,
    battlePassXp,
  };
  return { save: next, kind, material: status.woodId, units: status.woodReady, gold: status.goldReady, hours };
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
    return { save: { ...base, activeOreId: tier.id, lastMiningClaim: now, miningPass: snapshotGatherPass(base, now) }, claimed };
  }
  const tier = getWoodTier(tierId);
  if (!tier || save.activeOreId || save.activeWoodId === tier.id || !isWoodTierUnlocked(tier, skillLevel(save.skillXp.woodcutting, 'woodcutting'))) return null;
  const claimed = save.activeWoodId ? applyClaimGathering(save, kind, now) : null;
  const base = claimed ? claimed.save : save;
  return { save: { ...base, activeWoodId: tier.id, lastWoodcuttingClaim: now, woodcuttingPass: snapshotGatherPass(base, now) }, claimed };
}
