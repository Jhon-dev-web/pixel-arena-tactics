// Round 17: what the late game costs in HOURS of hunting (the model of lateCost.sim.ts and of round17.test.ts), in the static unit of setCost.ts: units / (economic rolls per hour x
// chance x depth x sub-level) at the stage where the tier is hunted (STAGE_FARM: deep, sub-level 10, 140 rolls/h in the late zones). A step that asks for several materials takes the
// longest of them inside one zone (they drop together) and the sum over zones.
import { GEAR, farmHours, getGear, refineHuntMaterials, upgradeChance, upgradeCost, upgradeFailDrop } from '../../src/game/gear';
import { HUNTING_ZONES } from '../../src/game/huntingZones';
import { baseGoldValue } from '../../src/game/economy';
import T from '../../src/game/tunables';
import { chainNeed, huntRate, isHuntMat, SET_SLOTS, STAGE_FARM } from './setCost';

export type Bundle = Partial<Record<string, number>>;

export function bundleHours(bundle: Bundle, tier: number): number {
  const st = STAGE_FARM[Math.min(6, Math.max(1, tier)) - 1];
  const byZone: Record<string, number> = {};
  for (const [m, n] of Object.entries(bundle)) {
    if (!n || !isHuntMat(m)) continue;
    const r = huntRate(m, st);
    if (r.perHour <= 0) continue;
    byZone[r.zone] = Math.max(byZone[r.zone] ?? 0, n / r.perHour);
  }
  return Object.values(byZone).reduce((a, b) => a + b, 0);
}

const ownRecipe = (tpl: string) => {
  const r = getGear(tpl)?.recipe;
  return r ? { ...r, items: {} } : undefined;
};

// the seven pieces of a tier, each one's OWN materials only (the previous-tier piece it consumes was paid at its own stage), at the stage of the tier
export function tierOwnHours(tier: number): number {
  const need: Bundle = {};
  for (const line of Object.values(SET_SLOTS)) {
    for (const [m, n] of Object.entries(chainNeed(line[tier - 1], ownRecipe))) need[m] = (need[m] ?? 0) + (n as number);
  }
  return bundleHours(need, tier);
}

// a set through `tier`: every tier up to it, each at its own stage. (setCost.setHours re-prices the whole chain at the last stage's rates, which counts the tier 3 pieces at the rift's.)
export function setHoursOwn(tier: number): number {
  let h = 0;
  for (let t = 1; t <= tier; t++) h += tierOwnHours(t);
  return h;
}

// a piece of `tier` from +0 to +8: the hunting materials of every attempt (gear.refineHuntMaterials) times the expected attempts (1 / chance) of each step
export function refineToEight(tier: number): number {
  let h = 0;
  for (let level = 3; level < 8; level++) h += bundleHours(refineHuntMaterials(tier, level) as Bundle, tier) / upgradeChance(level);
  return h;
}

// +8 -> +12: value iteration on the chain of the deep steps (success, stay, or fall one level)
export function deepToTwelve(tier: number): { hours: number; attempts: number; perAttempt: number[] } {
  const item = GEAR.find((g) => g.tier === tier && g.slot === 'helmet')!;
  const per = [8, 9, 10, 11].map((lvl) => bundleHours(upgradeCost(item, lvl).materials as Bundle, 6));
  let E = [0, 0, 0, 0, 0];
  let A = [0, 0, 0, 0, 0];
  for (let it = 0; it < 4000; it++) {
    const nE = [0, 0, 0, 0, 0];
    const nA = [0, 0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      const lvl = 8 + i;
      const p = upgradeChance(lvl);
      const fall = (1 - p) * upgradeFailDrop(lvl);
      const stay = 1 - p - fall;
      nE[i] = per[i] + p * E[i + 1] + stay * E[i] + fall * E[Math.max(0, i - 1)];
      nA[i] = 1 + p * A[i + 1] + stay * A[i] + fall * A[Math.max(0, i - 1)];
    }
    E = nE;
    A = nA;
  }
  return { hours: E[0], attempts: A[0], perAttempt: per };
}

// the bundle of a Lapidar (tier, earlier lapidations on the piece)
export function lapidarHours(tier: number, done: number): number {
  const L = T.lateSinks;
  const base = tier >= 6 ? L.lapidarHours6 : tier === 5 ? L.lapidarHours5 : L.lapidarHours4;
  return bundleHours(farmHours(base * (1 + L.lapidarGrowth * Math.min(L.lapidarMaxGrowth, done))), 6);
}

// What an hour of a late zone is worth to the merchant: continuous = zone Gold + 15% of the reference value (the order anchor, round14.test.ts), real = the floors the merchant pays
export function zoneValue(zoneId: string): { perHour: Record<string, number>; reference: number; merchantContinuous: number; merchantReal: number } {
  const z = HUNTING_ZONES.find((x) => x.id === zoneId)!;
  const st = STAGE_FARM[5];
  const perHour: Record<string, number> = {};
  let reference = 0;
  let real = 0;
  for (const d of z.drops) {
    const r = huntRate(d.material, { ...st, zones: [zoneId] });
    perHour[d.material] = r.perHour;
    reference += r.perHour * baseGoldValue(d.material);
    real += r.perHour * Math.max(1, Math.floor(T.merchant.priceRate * baseGoldValue(d.material)));
  }
  return { perHour, reference, merchantContinuous: z.goldPerHour + T.merchant.priceRate * reference, merchantReal: z.goldPerHour + real };
}
