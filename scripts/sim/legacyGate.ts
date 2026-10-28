// The Hunting sub-level gate as it was until 28/10/2026, written in CP: recommended CP of the zone at the depth x 1.23^(N-1), in the two last zones. It is NOT the game's gate any more (huntingZones.ts
// subLevelGearRequired asks an equipment index); it stays here so the measurements that compare the two (classReach.sim.ts, classGate.sim.ts) can say what the old gate used to do.
import { HuntingDepth, HuntingZoneDef, recommendedCpForDepth } from '../../src/game/huntingZones';

export const LEGACY_CP_GROWTH = 1.23;
export function subLevelCpRequired(zone: HuntingZoneDef, depth: HuntingDepth, subLevel: number): number {
  if (!zone.subLevelGear || !(subLevel > 1)) return 0;
  return Math.round(recommendedCpForDepth(zone, depth) * Math.pow(LEGACY_CP_GROWTH, Math.floor(subLevel) - 1));
}
