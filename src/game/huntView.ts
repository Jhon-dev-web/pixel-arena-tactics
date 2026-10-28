import { activeLocale, fmtNum, t } from '../locales';
import type { MaterialId } from './materials';
import { playerLevel, type SaveData } from './engine';
import type { HuntOutlook } from './huntEstimate';
import { gearSetFor } from './gearIndex';
import { HUNTING_DEPTHS, HuntingDepth, HuntingZoneDef, depthGearRequired, isDepthUnlocked, isZoneOpen, subLevelGearRequired } from './huntingZones';

// Presentation helpers of the Hunt screen. Nothing here changes a rule: it only reads the save and the zone tables.

export const matName = (id: MaterialId): string => t(`materials.mat_${id}`);

// Per-hour rates: one decimal under 10 (so 0.8 does not read as 1), whole numbers (with separators) from 10 up.
export function fmtRate(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 9.95) return fmtNum(Math.round(n));
  return n.toLocaleString(activeLocale === 'pt' ? 'pt-BR' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

// "1h 20m" / "20m" / "45s".
export function fmtSpan(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return m > 0 ? `${m}m` : `${sec}s`;
}

export type ZoneState = 'locked' | 'hard' | 'ok';

// What the sub-levels of a zone add to the Hunt screen (Rodada 22): the extra XP each pays (percent, 0 for a zone with flat XP) and the CP the NEXT one asks (0 = no gate or the last level).
// How the gate reads to a player: "your gear must match a tier N +R set" (of a better rarity when a common set cannot reach it). The key and the parameters of the hint; `rarityKey` is the locale key of the rarity name.
export function subLevelNeed(requiredIndex: number): { key: 'hunting.subLevelNeedGear' | 'hunting.subLevelNeedGearRarity'; tier: number; refine: number; rarityKey?: string } {
  const set = gearSetFor(requiredIndex);
  return set.rarity === 'common' ? { key: 'hunting.subLevelNeedGear', tier: set.tier, refine: set.refine } : { key: 'hunting.subLevelNeedGearRarity', tier: set.tier, refine: set.refine, rarityKey: `rarity.rar_${set.rarity}` };
}

export function subLevelNotes(zone: HuntingZoneDef, depth: HuntingDepth, ceiling: number): { xpPct: number; nextGear: number } {
  return { xpPct: Math.round((zone.xpPerSubLevel ?? 0) * 1000) / 10, nextGear: subLevelGearRequired(zone, depth, ceiling + 1) };
}

// What opens a zone, as a locale key + vars: the Dungeon floor alone, or the floor and the hero level (zones 3 and 4).
export function zoneLockedText(zone: HuntingZoneDef): { key: string; vars: Record<string, number> } {
  return zone.unlockLevel ? { key: 'hunting.unlocksAtLevel', vars: { n: zone.unlockFloor, lvl: zone.unlockLevel } } : { key: 'hunting.startLocked', vars: { n: zone.unlockFloor } };
}

// locked: the dungeon floor that opens the zone is not reached yet, or the hero is under the level it asks (zone 3: 40, zone 4: 60). hard: open, but the hero is below the CP of even the shallowest depth, so no
// depth can be started. ok: at least one depth can be started. (`gear` is the hero's equipment index, gearIndex.ts: the depth gate asks equipment since 28/10, not CP.)
export function zoneState(zone: HuntingZoneDef, save: SaveData, gear: number): ZoneState {
  if (!isZoneOpen(zone, save.highestDungeonFloor, playerLevel(save.xp))) return 'locked';
  return isDepthUnlocked(zone, 'shallow', gear) ? 'ok' : 'hard';
}

export function depthsOpen(zone: HuntingZoneDef, gear: number): number {
  return HUNTING_DEPTHS.filter((d) => isDepthUnlocked(zone, d.id, gear)).length;
}

// Why "Start Hunt" is not available for this zone + depth right now (a locale key + vars), or null when it is.
export function startBlockedReason(save: SaveData, zone: HuntingZoneDef, depth: HuntingDepth, gear: number): { key: string; vars?: Record<string, number> } | null {
  if (!isZoneOpen(zone, save.highestDungeonFloor, playerLevel(save.xp))) return zoneLockedText(zone);
  if (!isDepthUnlocked(zone, depth, gear)) {
    const set = gearSetFor(depthGearRequired(zone, depth)); // never past a common set: the deepest depth asks 5.5, a common tier 6 +12 set is 7.2
    return { key: 'hunting.startNeedGear', vars: { tier: set.tier, refine: set.refine } };
  }
  if (save.pendingHuntReward) return { key: 'hunting.startClaimFirst' };
  if (save.activeOreId || save.activeWoodId) return { key: 'hunting.startBusy' };
  return null;
}

// The zone the selection opens on: the deepest one the hero can already start, else the first.
export function defaultZone(zones: HuntingZoneDef[], save: SaveData, gear: number): HuntingZoneDef {
  const ok = zones.filter((z) => zoneState(z, save, gear) === 'ok');
  return ok[ok.length - 1] ?? zones[0];
}

// How hard a zone is for THIS hero at the chosen depth, in the three words the Hunt screen prints beside the CP line. It never contradicts that line: it is built from the same
// numbers it shows (the depth's required gear and the hero's) plus the outlook of the real hunt estimate shown on the depth cards.
//   tooStrong - the hero is under the depth's required equipment (the hunt cannot even be started), or the estimate says nothing is ever won
//   risky     - startable, but the estimate says fights are lost along the way
//   ready     - startable and the estimate wins (nearly) always
// "Locked" (the dungeon floor that opens the zone is not reached) is a different idea and stays ZoneState 'locked'.
export type ZoneDifficulty = 'ready' | 'risky' | 'tooStrong';

export function zoneDifficulty(zone: HuntingZoneDef, depth: HuntingDepth, gear: number, outlook: HuntOutlook | null): ZoneDifficulty {
  if (!isDepthUnlocked(zone, depth, gear)) return 'tooStrong';
  if (outlook === 'cannot') return 'tooStrong';
  if (outlook === 'risky') return 'risky';
  return 'ready';
}
