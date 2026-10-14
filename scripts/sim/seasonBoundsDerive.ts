// Recomputes, from the game's own tunables, the THEORETICAL values behind supabase/functions/_shared/progress/bounds.ts, so `npm run season:bounds` can print them next to
// the constants and seasonProgress.test.ts can fail the day the game gets faster than the table says.
import { dungeonRunXp, milestoneXpBonus } from '../../src/game/dungeon';
import { relicXpBonusPct } from '../../src/game/gear';
import { HUNTING_DEPTHS, HUNTING_ZONES } from '../../src/game/huntingZones';
import T from '../../src/game/tunables';
import { BOUNDS } from '../../supabase/functions/_shared/progress/bounds';

const DEPTHS_ALLOWANCE = 40; // Profundezas depths a run can add, per the sims (the fastest seed ends near depth 44)

export function deriveBounds() {
  // bonuses on character XP: the Season Relic and the best Hunter skill (3 ranks), as a fraction
  const xpBonus = relicXpBonusPct('season_emblem') / 100 + 3 * T.heroSkills.quickLearnerXp;
  const bestZone = Math.max(...HUNTING_ZONES.map((z) => z.xpPerHour));
  const deepest = Math.max(...HUNTING_DEPTHS.map((d) => d.xpMultiplier));
  const huntPerHour = bestZone * deepest * (1 + xpBonus);

  const D = T.deliveries;
  const bestOrder = Math.max(D.xpPerHourLocal, D.xpPerHourCurta, D.xpPerHourRegional, D.xpPerHourLonga, D.xpPerHourEspecial);
  const ordersPerHour = bestOrder * D.xpFactorMax * (1 + D.passXpBonus) * (1 + xpBonus);

  const runsPerDay = T.dungeon.freeSessionsPerDay + 10;
  const runXp = dungeonRunXp(1, 100) + milestoneXpBonus(1, 100) + dungeonRunXp(101, DEPTHS_ALLOWANCE);
  const dungeonPerHour = (runsPerDay * runXp) / 24;

  const xpPerHour = huntPerHour + ordersPerHour + dungeonPerHour;
  return {
    xpBonus,
    huntPerHour,
    ordersPerHour,
    dungeonPerHour,
    runXp,
    runsPerDay,
    xpPerHour,
    capHours: T.battlePass.capHours,
    constants: BOUNDS,
  };
}
