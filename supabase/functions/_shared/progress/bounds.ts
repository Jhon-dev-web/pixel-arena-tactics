import { DUNGEON_RUN_XP, ZONE_TABLE } from './tables.ts';

// EVERY number the plausibility audit uses lives in this one table. Each entry says where it comes from. `npm run season:bounds` prints the table next to the values
// recomputed from the game's tunables and checks that the theoretical ones here are still >= what the game can do (seasonProgress.test.ts runs the same check).
//
// Two kinds of bound:
//   THEORETICAL  what the game's own rules allow if a player does nothing else, at the best zone, with every XP bonus (recomputed by season:bounds from tunables).
//   PACE         how fast the FASTEST simulated seed of `npm run sim:long` (the Pass owner, the quicker of the two scenarios) got there (docs/BALANCE_BASELINE.md
//                "Cenario P" and docs/BALANCE_CHANGES.md Rodada 15 section 4). Humans can beat a bot, so the verdicts leave room (below).
//
// Verdicts: a measure at or under its FLAG value is normal; between FLAG and REJECT the snapshot is stored as `flagged` (not ranked, shown to the owner);
// above REJECT it is `rejected` (not accepted as the account's new baseline, so honest progress that was merely early is accepted later, once enough server time passed).
// THEORETICAL bounds reject at REJECT_FACTOR x the flag value. PACE bounds flag at PACE_FLAG_FACTOR x the fastest simulated seed and reject at PACE_REJECT_FACTOR x it:
// the simulated player is a bot that visits twice a day, so a person can beat it, but not by three times without help.

export const REJECT_FACTOR = 2;

/** A human may be this many times faster than the fastest simulated bot seed before the snapshot is only flagged (not ranked). */
export const PACE_FLAG_FACTOR = 2;

/** Above this many times the fastest simulated seed the snapshot is rejected (the design asked for at least 2x; 3x leaves room for people). */
export const PACE_REJECT_FACTOR = 3;

export const BOUNDS = {
  // ---- time / pace ---------------------------------------------------------------------------------------------------------------------------
  /** Server hours of progress a single snapshot may carry that were earned BEFORE the previous snapshot and only claimed now (an offline Hunt waits at most the Pass cap of 8 h). SOURCE: tunables battlePass.capHours = 8. */
  burstHours: 8,
  /**
   * Level pace slack, in pace-days, on top of the XP burst (burstXp() below already lets a claimed-late reward through). Small: only rounding.
   */
  paceSlackDays: 0.1,
  /** Floor pace slack, in pace-days. A person can play a whole "first day" of floors in one sitting (the bot visits twice a day), so one day of floors may always arrive at once. */
  floorPaceSlackDays: 1,
  /** Floors are whole steps and the walls (bosses) make them lumpy: a few floors may always arrive at once, otherwise one extra floor late in the game (4 pace-days each) would look like a jump. */
  floorStepSlack: 3,

  // ---- XP --------------------------------------------------------------------------------------------------------------------------------------
  /**
   * XP per server hour, THEORETICAL, at the end of the game (floor 100). Recomputed by season:bounds = 59,489 (rounded up to 60,000); xpPerHourAt(floor) below scales it with the floor:
   *   Hunting 19,773 = best zone 13,000 xp/h (huntingZones.ts) x deep depth 1.3 x (1 + 17% bonuses: Season Relic 5% + Aprendiz Veloz 3 ranks x 4%)
   *   + delivery orders 5,391 = 1,200 xp/h (tunables deliveries.xpPerHourEspecial) x 3.2 (xpFactorMax) x 1.2 (Pass) x 1.17
   *   + the Dungeon 34,325 = 20 runs a day (10 free sessions, tunables dungeon.freeSessionsPerDay, plus 10 bought with Shards) x about 41,200 XP a run
   *     (100 floors at 60 x (1 + 0.05 x (f - 1)), the boss / checkpoint bonuses and 40 Profundezas depths) / 24 h.
   */
  xpPerHour: 60_000,
  /** The XP multiplier of the deepest Hunt depth (huntingZones.ts HUNTING_DEPTHS) times the best XP bonuses (1 + 17%). 1.3 x 1.17. */
  huntXpFactor: 1.521,
  /** Delivery orders XP per hour at their best (see xpPerHour). */
  ordersXpPerHour: 5_400,
  /** One delivery order's XP at hero level 1 to 40 (the level factor is 1 there): 1,200 xp/h x 21 h (the longest order, hoursEspecial) x 1.2 (Pass) x 1.17. Above level 50 the factor is 3.2. */
  orderLumpXp: 35_400,
  orderLumpFactorAt50: 3.2,

  // ---- profession skill XP (Mining, Woodcutting, Gardening): THEORETICAL, recomputed from tunables by season:bounds / deriveBounds ---------------------------------------
  /** Mining / Woodcutting: gatherPower = BASE_GATHER_POWER + level x powerPerLevel (skills.ts). SOURCE: BASE_GATHER_POWER = 5, tunables skills.powerPerLevel = 0.75, skills.maxLevel = 75. */
  gatherBasePower: 5,
  gatherPowerPerLevel: 0.75,
  gatherMaxLevel: 75,
  /** Units per hour per power point (tunables mining.oreRatePerPower = woodcutting.woodRatePerPower = 1) and skill XP per unit (skills.xpPerUnit = 1). */
  gatherUnitsPerPower: 1,
  gatherXpPerUnit: 1,
  /**
   * Everything that multiplies the units of a session, at its best (engine.ts gatherAccrual): the Pass drop multiplier 1.1 (battlePass.dropRateMultiplier) x the two mastery yield
   * perks 1.08 (mastery.gatherYieldPct 0.04 x 2) x the effective-hours bonuses 1.53 (Coletor 3 ranks x 0.06 = 0.18, Gatherer Brew 0.25, Prospector's Tonic 0.10, all active the whole time).
   */
  gatherYieldFactor: 1.82,
  /** Gardening XP = growth hours x skills.gardenXpPerHour (5) per harvest, for every plant. SOURCE: tunables skills.gardenXpPerHour. */
  gardenXpPerPlotHour: 5,
  /** Plots: 4 at the start, +1 at Gardening level 20 and 40 (garden.ts GARDEN_START_PLOTS / GARDEN_PLOT_UNLOCK_LEVELS). */
  gardenStartPlots: 4,
  gardenPlotUnlockLevels: [20, 40] as readonly number[],
  /** A Fertilizer on a fresh planting halves its growth (x2 XP per hour; tunables tonics.fertilizerSkipPct 0.5) and the two speed perks cut 10% (1 / 0.9 = 1.11, rounded up to 1.12). */
  gardenSpeedFactor: 2 * 1.12,
  /** The longest plant (elder_root, 16 h x 5 XP): one ready harvest per plot may be claimed late, so a snapshot can carry one of each. */
  gardenLongestPlantXp: 80,

  // ---- counters per server hour (theoretical) -----------------------------------------------------------------------------------------------
  /** Kills per hour: one kill per 0.4 s at the highest attack speed (base interval minus 300 AGI points x 4.7 ms, attributes.ts), rounded up. SOURCE: ESTIMATE, not measured: nothing in the sims counts kills per hour; a flag-level bound that catches edited counters, not a precise limit. */
  killsPerHour: 10_000,
  /** Gold earned per hour (any source, selling included). SOURCE: generous: the long sim earns well under 30,000 a DAY; this is a flag-level bound that mostly catches edited gold. */
  goldPerHour: 100_000,

  // ---- counters per server day (theoretical; a daily allowance resets at local midnight, so a day's worth can arrive just before and just after it: +1 day) ------
  /** Dungeon runs per day: 10 free (tunables dungeon.freeSessionsPerDay) + 10 bought with Shards (extraSessionShardCost = 5). */
  dungeonRunsPerDay: 20,
  /** Dungeon stages cleared per day: runs x 140 (100 floors + Profundezas of one run). */
  dungeonFloorsPerDay: 2_800,
  /** Bosses killed per day: runs x 10 (4 biome bosses + the boss every 25 depths at the deepest). */
  bossesPerDay: 200,
  /** Unique pieces found per day: bounded by boss kills; one per boss at the very best, rounded down to the real chance ceiling (tunables battle.relicBossChance and uniques.ts). */
  uniquesPerDay: 50,
  /** Achievements claimed per day: there are ~110 achievements in the whole game (quests.ts QUESTS_ACHIEVEMENTS); a day can claim a lot of them at once. */
  achievementsPerDay: 120,
  dayBurst: 1,

  // ---- play time -------------------------------------------------------------------------------------------------------------------------------
  /** stats.secondsPlayed can never grow faster than the server clock. 1.1 allows for a clock that ticks a little fast; 900 s covers a snapshot taken right after an idle tab was backgrounded. REJECT only. */
  secondsRatio: 1.1,
  secondsSlack: 900,

  // ---- PACE: the fastest simulated seed (Pass owner): [position, server day it was reached] ----------------------------------------------------------
  /**
   * Hero level position (level + share of the next level; paragon levels follow 100) against the day the fastest seed reached it.
   * SOURCE: docs/BALANCE_BASELINE.md "Cenario P" (nivel 50 by day 10 in every seed; 60 / 75 / 90 / 100 on days 23 / 45 / 76 / 104 for the fastest seed, Rodada 15 section 4);
   * levels 13 and 27 from the "Metas mantidas" targets of the same file (day 1 and day 3); the paragon runs at about 0.5 level a day (nivel 100, Paragon 33 on day 180, Cenario P).
   */
  levelPace: [
    [1, 0],
    [13, 1],
    [27, 3],
    [50, 9],
    [60, 23],
    [75, 45],
    [90, 76],
    [100, 104],
    [200, 304],
  ] as const,
  /** Highest dungeon floor against the day the fastest seed first stood on it. SOURCE: same tables ("andar 50 (chegada)" day 10 median, 8.5 fastest; "andar 75" day 18, 16 fastest; "andar 100" day 86 median, 75 fastest; floor 8 on day 1). */
  floorPace: [
    [0, 0],
    [8, 1],
    [25, 3],
    [50, 8.5],
    [75, 16],
    [90, 62],
    [100, 75],
  ] as const,
  /** Profundezas depth cleared per day by the fastest seed: 0 to about 30 in the first 3 days after the floor-100 boss (Cenario P, days 90 to 110). Depth is capped by the CP wall at about 44. */
  depthPerDayFastest: 12,
  /** One-off allowance when a depth jump follows a long gap: the sims show 10 depths in the first day. */
  depthBurst: 10,

  // ---- coupling: how high a floor a hero of a given level has been seen on -------------------------------------------------------------------------------
  /** [hero level, highest floor] = the best floor any sim seed (A or P) stood on at that level, with ~20% room. SOURCE: docs/BALANCE_BASELINE.md level / floor columns (day 10: lvl 42 floor 37; day 20: lvl 57 floor 78; day 60: lvl 77 floor 87; day 90: lvl 91 floor 100). */
  floorCapByLevel: [
    [1, 6],
    [13, 12],
    [27, 30],
    [42, 45],
    [50, 66],
    [57, 85],
    [63, 90],
    [77, 98],
    [85, 100],
  ] as const,
  /** Above the cap x this + 5 floors the snapshot is rejected (between the cap and that it is flagged). */
  floorCapRejectFactor: 1.4,
  floorCapRejectSlack: 5,
} as const;

/** Linear interpolation over a [x, y] table (sorted by x); beyond the ends it continues with the slope of the last segment (and 0 below the first). */
export function interpolate(table: readonly (readonly [number, number])[], x: number): number {
  if (!(x > table[0][0])) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i];
    if (x <= x1) {
      const [x0, y0] = table[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  const [xa, ya] = table[table.length - 2];
  const [xb, yb] = table[table.length - 1];
  return yb + ((yb - ya) / (xb - xa)) * (x - xb);
}

/** Same for the inverse direction (days -> position is not needed; position -> day is). */
export const daysAtLevel = (position: number): number => interpolate(BOUNDS.levelPace, position);
export const daysAtFloor = (floor: number): number => interpolate(BOUNDS.floorPace, floor);
export const floorCapForLevel = (heroLevel: number): number => interpolate(BOUNDS.floorCapByLevel, heroLevel);

/** Plots open to a Gardening level. */
export const gardenPlotsAt = (level: number): number => BOUNDS.gardenStartPlots + BOUNDS.gardenPlotUnlockLevels.filter((l) => level >= l).length;

/**
 * THEORETICAL profession skill XP per server hour for a profession at `level` (the level the new snapshot shows: the power an honest player had during the gap was never higher).
 * Mining / Woodcutting: power at that level x units per power x every yield bonus x XP per unit. Gardening: open plots x XP per plot-hour x fertilizer and speed perks.
 */
export function professionXpPerHour(profession: 'mining' | 'woodcutting' | 'gardening', level: number): number {
  if (profession === 'gardening') return gardenPlotsAt(level) * BOUNDS.gardenXpPerPlotHour * BOUNDS.gardenSpeedFactor;
  const power = BOUNDS.gatherBasePower + Math.min(Math.max(1, level), BOUNDS.gatherMaxLevel) * BOUNDS.gatherPowerPerLevel;
  return power * BOUNDS.gatherUnitsPerPower * BOUNDS.gatherYieldFactor * BOUNDS.gatherXpPerUnit;
}

/** Profession XP that may arrive in ONE snapshot although earned earlier: a gathering session waits at most burstHours (the Pass cap); each garden plot may hold one finished crop. */
export function professionBurstXp(profession: 'mining' | 'woodcutting' | 'gardening', level: number): number {
  if (profession === 'gardening') return gardenPlotsAt(level) * BOUNDS.gardenLongestPlantXp;
  return BOUNDS.burstHours * professionXpPerHour(profession, level);
}

/** Hunting XP per hour at the best zone the floor has opened (ZONE_TABLE: zone unlock floors from huntingZones.ts), shallow depth x deep depth x bonuses. */
export function zoneXpPerHour(highestFloor: number): number {
  let rate = 0;
  for (const z of ZONE_TABLE) if (highestFloor >= z.unlockFloor) rate = Math.max(rate, z.xpPerHour);
  return rate;
}

/** THEORETICAL XP per server hour for a hero whose highest floor is `highestFloor`: best open zone + orders + 20 Dungeon runs a day of the floors that hero can clear. */
export function xpPerHourAt(highestFloor: number): number {
  const floor = Math.max(0, Math.min(100, Math.floor(highestFloor)));
  return zoneXpPerHour(floor) * BOUNDS.huntXpFactor + BOUNDS.ordersXpPerHour + (BOUNDS.dungeonRunsPerDay * DUNGEON_RUN_XP[floor]) / 24;
}

/**
 * XP that may arrive in ONE snapshot although it was earned before the previous one: an offline Hunt waiting to be claimed (up to burstHours of the best open zone) and one
 * finished delivery order. Not renewable in the cumulative checks (they count it once).
 */
export function burstXp(heroLevel: number, highestFloor: number): number {
  const factor = 1 + (BOUNDS.orderLumpFactorAt50 - 1) * Math.max(0, Math.min(1, (heroLevel - 40) / 10));
  return BOUNDS.burstHours * zoneXpPerHour(highestFloor) * BOUNDS.huntXpFactor + BOUNDS.orderLumpXp * factor;
}
