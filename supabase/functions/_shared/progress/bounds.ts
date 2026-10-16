import { ZONE_TABLE } from './tables.ts';

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

/**
 * A softer, NON-hiding marker: above this many times the fastest simulated seed (and under the flag value) the snapshot stays `ok` and is ranked, but it carries a FAST_* reason
 * so the owner's audit lists the account first. People who check in more often than the simulated player can legitimately be faster than it (that is why the flag stays at 2x).
 */
export const PACE_FAST_FACTOR = 1.3;

/** Above this many times the fastest simulated seed the snapshot is rejected (the design asked for at least 2x; 3x leaves room for people). */
export const PACE_REJECT_FACTOR = 3;

export const BOUNDS = {
  // ---- time / pace ---------------------------------------------------------------------------------------------------------------------------
  /** Server hours of progress a single snapshot may carry that were earned BEFORE the previous snapshot and only claimed now (an offline Hunt waits at most the Pass cap of 10 h). SOURCE: tunables battlePass.capHours = 10. */
  burstHours: 10,
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
   * XP per server hour, THEORETICAL, at the end of the game (floor 100). Since the League (Rodada 20) HUNTING IS THE ONLY SOURCE of hero XP (no Dungeon, no delivery order, no instant
   * potion), so this is one product. Recomputed by season:bounds = 23,660 (25,000 kept: the server factor below still counts a 5% Relic bonus
   * that no item carries since Rodada 19, as a margin); xpPerHourAt(floor) below scales it with the floor:
   *   best zone 10,000 xp/h (huntingZones.ts; it was 13,000 before Rodada 22) x 1.18 (the last zone pays +2% a sub-level above 1, huntingZones.ts xpPerSubLevel, 9 sub-levels) x deep depth 1.3
   *   x (1 + 12% bonuses: Aprendiz Veloz 3 ranks x 4%; +5% for a Season Relic that carried XP, margin) x 1.25 (the Knowledge Elixir, tunables consumables.knowledgeXpPct, running the whole
   *   time: the best and only potion; the Pass adds no XP).
   * It used to be 60,000: 19,773 of Hunting plus 5,391 of delivery orders and 34,325 of Dungeon runs, which are gone.
   */
  xpPerHour: 25_000,
  /** The XP multiplier of the deepest Hunt depth (huntingZones.ts HUNTING_DEPTHS) times the best XP bonuses (1 + 17%) times the Knowledge Elixir (1.25) times the last zone's best sub-level (1.18). 1.3 x 1.17 x 1.25 x 1.18 = 2.2437. */
  huntXpFactor: 2.244,

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
  /**
   * Rodada 20 (the League ranks the three professions apart, by TOTAL XP, which keeps counting past the level cap): the total XP the fastest simulated SPECIALIST had on day 60 (`npm run
   * sim:long` with LONG_SCEN=PM,PW,PG: a Pass owner who spends every check-in on that profession; Mining and Woodcutting are the same machine, Gardening does not depend on the Pass).
   * It is what the theoretical rates below are measured against (seasonProgress.test.ts keeps each theoretical 60 days above it) and the day-60 level of that
   * specialist is 72 (Mining / Woodcutting) and 70 (Gardening), never the cap of 75. The rates themselves (power x yield x XP per unit, plots x XP per plot-hour x speed) did not change.
   */
  professionSimDay60: { mining: 77_300, woodcutting: 77_300, gardening: 30_440 },
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
   * SOURCE (Rodada 22, `npm run sim:econ`, the fastest seed of the Pass-owner policies P / PS / PG / PB, 6 seeds each; PB is the owner who BOUGHT a Legendary tier 4+ set): level 24 on day 2,
   * 44 on day 7, 51 on day 11, 60 on day 19, 68 on day 26, 75 on day 33, 79 on day 38, 88 on day 50 and 92 on day 56 (docs/BALANCE_CHANGES.md Rodada 22); past day 56 the hero gains about 0.55 level
   * a day (level 100 on about day 72, then the paragon at 0.55 level a day, as before). Rodada 20 had 60 on day 24 and 88 on day 60 for the plain owner alone: the zone level gates of Rodada 22
   * (zone 3 asks level 40, zone 4 level 60) hold the owner who bought a set back, and the table now follows him, the fastest legitimate player, instead of the plain owner.
   */
  levelPace: [
    [1, 0],
    [24, 2],
    [28, 3],
    [44, 7],
    [51, 11],
    [60, 19],
    [68, 26],
    [75, 33],
    [79, 38],
    [88, 50],
    [92, 56],
    [100, 72],
    [200, 272],
  ] as const,
  /** Highest dungeon floor against the day the fastest seed first stood on it. SOURCE (Rodada 22, P / PS / PG / PB, fastest of 6 seeds each): floor 8 on day 1, 25 on day 2, 50 on day 8, 75 on day 10, 90 on day 23, 100 on day 28 (the buyer's tier 4+ Legendary set; the plain owner needs until day 53). */
  floorPace: [
    [0, 0],
    [8, 1],
    [25, 2],
    [50, 8],
    [75, 10],
    [90, 23],
    [100, 28],
  ] as const,
  /** Profundezas depth cleared per day by the fastest seed: 0 to about 30 in the first 3 days after the floor-100 boss (Cenario P, days 90 to 110). Depth is capped by the CP wall at about 44. */
  depthPerDayFastest: 12,
  /** One-off allowance when a depth jump follows a long gap: the sims show 10 depths in the first day. */
  depthBurst: 10,

  // ---- coupling: how high a floor a hero of a given level has been seen on -------------------------------------------------------------------------------
  /**
   * [hero level, highest floor] = the best floor any sim seed (A or P) stood on at a hero level up to that one, with ~20% room (more at the low levels, where the pace tables interpolate between sparse anchors). SOURCE (Rodada 20, 6 seeds x 60 days): level 1 to 13 floor 10, 24 floor 25,
   * 37 floor 30, 44 floor 40, 50 floor 70, 57 floor 76, 63 floor 78, 70 floor 85. The Dungeon pays no XP any more, so a hero can stand on floor 10 at level 1 (it was floor 5 at level 1).
   * Rodada 22 (the owner who bought a Legendary tier 4+ set, `npm run sim:econ` PB): level 44 floor 40, level 50 floor 86, 57 floor 88, 63 floor 89, 70 floor 100; so from level 50 on the cap is the last floor.
   */
  floorCapByLevel: [
    [1, 12],
    [13, 14],
    [24, 36],
    [37, 44],
    [44, 56],
    [50, 100],
    [57, 100],
    [63, 100],
    [70, 100],
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

/**
 * Hunting XP per hour at the best zone the floor AND the hero level have opened (ZONE_TABLE: the unlock floors and, since Rodada 22, the unlock levels of huntingZones.ts), shallow depth.
 * Without a level every zone the floor opens counts (the old, looser check); the audit passes the level of the NEW snapshot, which is never lower than the level during the gap.
 */
export function zoneXpPerHour(highestFloor: number, heroLevel: number = Number.POSITIVE_INFINITY): number {
  let rate = 0;
  for (const z of ZONE_TABLE) if (highestFloor >= z.unlockFloor && heroLevel >= z.unlockLevel) rate = Math.max(rate, z.xpPerHour);
  return rate;
}

/** THEORETICAL XP per server hour for a hero whose highest floor is `highestFloor` (and level `heroLevel`, when known): the best open zone with every bonus (the only source of hero XP). */
export function xpPerHourAt(highestFloor: number, heroLevel: number = Number.POSITIVE_INFINITY): number {
  return zoneXpPerHour(Math.max(0, Math.min(100, Math.floor(highestFloor))), heroLevel) * BOUNDS.huntXpFactor;
}

/**
 * XP that may arrive in ONE snapshot although it was earned before the previous one: an offline Hunt waiting to be claimed (up to burstHours, the largest storage the Pass gives,
 * of the best open zone). Not renewable in the cumulative checks (they count it once).
 */
export function burstXp(highestFloor: number, heroLevel: number = Number.POSITIVE_INFINITY): number {
  return BOUNDS.burstHours * zoneXpPerHour(highestFloor, heroLevel) * BOUNDS.huntXpFactor;
}
