import { BOUNDS } from '../progress/bounds.ts';
import { ITEM_BOUNDS, MARGIN } from '../items/bounds.ts';
import { HONEST_PEAK_DAY_UNITS, TRADEABLE_CHANCE } from './rates.ts';
import { GARDEN_PLOTS, GARDEN_SPEED_SLACK, GARDEN_TABLE } from './tables.ts';

// EVERY number the material server uses to refuse or cut a claim lives in this one table, and each entry says where it comes from (same discipline as items/bounds.ts, whose buckets
// and MARGIN it reuses). The limits are TOKEN BUCKETS (migration 0010 public.item_take_tokens, with the `whole` option of 0015): a bucket refills with the SERVER clock and a bucket
// that was never used starts with what the account could have earned since max(account created, league reset), never more than its capacity.

/** Slack on the units a claim may report over what the server clock and the ceilings allow, before the account is flagged for the owner's audit (a smaller excess is simply not eligible). */
export const UNITS_FLAG_FACTOR = 2;

/** Daily floor of tradeable units per material: even a material nobody finds much of lets a lucky honest day through. */
export const DAILY_FLOOR = 3;

export const MATERIAL_BOUNDS = {
  /**
   * The HERO's time, shared by Hunting, Mining and Woodcutting (a hero does one at a time): 1 hour per hour of the server clock, up to the longest a reward can wait (the Pass storage cap).
   * SOURCE: tunables battlePass.capHours = 10 via ITEM_BOUNDS.huntCapacitySeconds. A claim that asks for more time than the bucket holds is paid for the time it holds.
   */
  heroSecondsPerHour: 3600,
  heroCapacitySeconds: ITEM_BOUNDS.huntCapacitySeconds,
  /** A claim that asks for more than this much beyond the clock is flagged (a clock set forward, or a made-up duration). */
  flagExcessSeconds: ITEM_BOUNDS.huntFlagExcessSeconds,

  /**
   * Mining / Woodcutting: the most units an hour any build can produce: (base power + power per level x the profession cap) x units per power x every yield bonus at its best x the biggest
   * profession event bonus, with the same slack as the other ceilings. SOURCE: progress/bounds.ts BOUNDS (kept equal to the game by seasonProgress.test.ts).
   */
  gatherUnitsPerHour: Math.ceil((BOUNDS.gatherBasePower + BOUNDS.gatherPowerPerLevel * BOUNDS.gatherMaxLevel) * BOUNDS.gatherUnitsPerPower * BOUNDS.gatherYieldFactor * (1 + BOUNDS.eventProfessionBonus) * 1.15),

  /**
   * The GARDEN's plot time: every plot grows in parallel, so the bucket refills PLOTS hours per hour (times the speed the growth perks allow) and holds a full set of the longest plant.
   * SOURCE: GARDEN_PLOTS, GARDEN_SPEED_SLACK and the longest growth time of GARDEN_TABLE (generated from garden.ts / tunables).
   */
  plotSecondsPerHour: Math.ceil(GARDEN_PLOTS * 3600 * GARDEN_SPEED_SLACK),
  plotCapacitySeconds: Math.max(...Object.values(GARDEN_TABLE).map((p) => Math.ceil(p.durationMs / 1000))) * GARDEN_PLOTS,

  /** Never more than this many units of one material in one claim (a claim is a few hours of play; the ceilings above are far under it). */
  maxUnitsPerClaim: 100_000,

  /**
   * DAILY CAP on the tradeable units of each material: MARGIN (2x) the best day an honest fast player had (rates.ts HONEST_PEAK_DAY_UNITS, measured with sim:long) times the chance, never
   * under DAILY_FLOOR. A save-editing bot that reports the most the game allows, all day, gets at most this many a day: about twice what the fastest honest player finds. The bucket refills
   * cap / 24 an hour and holds one day, so a long absence does not bank a burst bigger than a day.
   */
  dailyCap: (id: string): number => Math.max(DAILY_FLOOR, Math.ceil(MARGIN * (HONEST_PEAK_DAY_UNITS[id] ?? 0) * (TRADEABLE_CHANCE[id] ?? 0))),
  dailyRatePerHour: (id: string): number => MATERIAL_BOUNDS.dailyCap(id) / 24,
  dailyCapacity: (id: string): number => MATERIAL_BOUNDS.dailyCap(id),
} as const;

export const HERO_BUCKET = 'mat_hero';
export const PLOT_BUCKET = 'mat_plots';
export const dayBucket = (id: string): string => `mat_day_${id}`;
