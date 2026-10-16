// The value of an hour of Hunting for a hero, in the game's one economic reference (shared by the order report orderScale.sim.ts and the test that keeps the order
// rewards next to it, round14.test.ts). Value = Gold + materials per hour x economy.ts baseGoldValue; the "merchant" value is what selling the whole haul would pay.
import { computeCP, playerLevel, SaveData } from '../../src/game/engine';
import { estimateHuntYield } from '../../src/game/huntEstimate';
import { HUNTING_DEPTHS, HUNTING_ZONES, isZoneOpen, recommendedCpForDepth } from '../../src/game/huntingZones';
import { baseGoldValue } from '../../src/game/economy';
import T from '../../src/game/tunables';

export function huntValue(hero: SaveData, ceiling: number) {
  let best: { zone: string; depth: string; value: number; gold: number; xp: number; mats: number; kph: number } | null = null;
  const cp = computeCP(hero);
  for (const zone of HUNTING_ZONES) {
    if (!isZoneOpen(zone, hero.highestDungeonFloor, playerLevel(hero.xp))) continue;
    for (const d of HUNTING_DEPTHS) {
      if (cp < recommendedCpForDepth(zone, d.id)) continue;
      const withLevel: SaveData = { ...hero, huntProgress: { ...hero.huntProgress, [`${zone.id}:${d.id}`]: { ceiling, promotionWins: 0 } } };
      const e = estimateHuntYield(withLevel, zone.id, d.id);
      if (!e || e.outlook !== 'always') continue;
      const mats = e.materialsPerHour.reduce((s, m) => s + m.perHour * baseGoldValue(m.material), 0);
      const value = e.goldPerHour + mats;
      if (!best || value > best.value) best = { zone: zone.id, depth: d.id, value, gold: e.goldPerHour, xp: e.xpPerHour, mats, kph: e.killsPerHour };
    }
  }
  return best;
}


// Gold per hour when everything the hunt drops is sold to the merchant (T.merchant.priceRate of the reference value) plus the zone Gold.
export const merchantGoldPerHour = (v: { gold: number; mats: number }): number => v.gold + T.merchant.priceRate * v.mats;
