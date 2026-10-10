import { activeLocale, fmtNum, t } from '../locales';
import type { MaterialId } from './materials';
import type { SaveData } from './engine';
import { HUNTING_DEPTHS, HuntingDepth, HuntingZoneDef, isDepthUnlocked, isZoneUnlocked, recommendedCpForDepth } from './huntingZones';

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

// locked: the dungeon floor that opens the zone is not reached yet. hard: open, but the hero is below the CP of even the shallowest depth, so no
// depth can be started. ok: at least one depth can be started.
export function zoneState(zone: HuntingZoneDef, save: SaveData, playerCp: number): ZoneState {
  if (!isZoneUnlocked(zone, save.highestDungeonFloor)) return 'locked';
  return isDepthUnlocked(zone, 'shallow', playerCp) ? 'ok' : 'hard';
}

export function depthsOpen(zone: HuntingZoneDef, playerCp: number): number {
  return HUNTING_DEPTHS.filter((d) => isDepthUnlocked(zone, d.id, playerCp)).length;
}

// Why "Start Hunt" is not available for this zone + depth right now (a locale key + vars), or null when it is.
export function startBlockedReason(save: SaveData, zone: HuntingZoneDef, depth: HuntingDepth, playerCp: number): { key: string; vars?: Record<string, number> } | null {
  if (!isZoneUnlocked(zone, save.highestDungeonFloor)) return { key: 'hunting.startLocked', vars: { n: zone.unlockFloor } };
  if (!isDepthUnlocked(zone, depth, playerCp)) return { key: 'hunting.startNeedCp', vars: { n: recommendedCpForDepth(zone, depth) } };
  if (save.pendingHuntReward) return { key: 'hunting.startClaimFirst' };
  if (save.activeOreId || save.activeWoodId) return { key: 'hunting.startBusy' };
  return null;
}

// The zone the selection opens on: the deepest one the hero can already start, else the first.
export function defaultZone(zones: HuntingZoneDef[], save: SaveData, playerCp: number): HuntingZoneDef {
  const ok = zones.filter((z) => zoneState(z, save, playerCp) === 'ok');
  return ok[ok.length - 1] ?? zones[0];
}
