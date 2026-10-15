import { FARM_HOURS_PER_PIECE, POUCH_TABLE, SEAL_TABLE } from './tables.ts';
import { BOUNDS } from '../progress/bounds.ts';

// EVERY number the item server uses to refuse a mint lives in this one table, and each entry says where it comes from (the same discipline as progress/bounds.ts, whose pace
// tables this file reuses). The limits are TOKEN BUCKETS (migration 0010 public.item_take_tokens): a bucket refills with the SERVER clock at `ratePerHour` up to `capacity`, and a
// bucket that was never used starts with what the account could have earned since max(account created, league reset), never more than its capacity. A take that does not fit is
// REFUSED (no roll happens) and the account is flagged for the owner's audit.

/** Margin on every limit derived from the game's own supply: an honest player is never closer to a limit than half of it. */
export const MARGIN = 2;

/** A forge needs materials stockpiled while the hero hunts: the bucket may hold up to this many days of supply, so a player can save a week of drops and forge a whole set in one sitting. */
export const STOCKPILE_DAYS = 7;

/** A forged piece never costs less than this many hunting hours in the limit (tier 1 and 2 pieces cost almost no Hunting; without a floor their limit would be silly high). */
export const MIN_PIECE_HOURS = 0.5;

/** P(Epic or Legendary) of one forge: 0.10 + 0.02 (rarity.ts RARITIES). */
export const P_EPIC_PLUS = 0.12;

/** Fewest certified Epic / Legendary pieces of one tier per rolling day the cap ever allows: a lucky day at the forge must not be refused (P of 4 in 7 forges at 12% is 0.4%). */
export const CERT_DAY_FLOOR = 4;

const forgeRatePerHour = (tier: number): number => MARGIN / Math.max(MIN_PIECE_HOURS, FARM_HOURS_PER_PIECE[tier] ?? FARM_HOURS_PER_PIECE[6]);

export const ITEM_BOUNDS = {
  /**
   * FORGE RATE, by tier: pieces per hour. 1 piece costs FARM_HOURS_PER_PIECE[tier] hunting hours through its whole chain (npm run sim:cost, scripts/sim/farmHours.ts, the table in
   * tables.ts), so a hero cannot honestly make more than 1 / hours of them per hour of play; MARGIN x that is the rate. The bucket holds STOCKPILE_DAYS days of it.
   */
  forgeRatePerHour,
  forgeCapacity: (tier: number): number => Math.max(2, Math.ceil(forgeRatePerHour(tier) * 24 * STOCKPILE_DAYS)),

  /**
   * CERTIFIED EPIC / LEGENDARY per rolling day, by tier: the most forges a day of supply allows (24 h / hours per piece) x MARGIN x P(Epic or better), never under CERT_DAY_FLOOR.
   * It is a safety net behind the forge rate: it counts what was ISSUED, atomically (item_commit), and refuses the issue (the roll is thrown away unseen) over the cap.
   */
  certDayCap: (tier: number): number => Math.max(CERT_DAY_FLOOR, Math.ceil(forgeRatePerHour(tier) * 24 * P_EPIC_PLUS)),

  /**
   * BLACKSMITH'S SEAL: the Pass track gives SEAL_TABLE.perSeason (3) per season of SEAL_TABLE.seasonDays (60) days, to Pass owners only. The server lets a Pass owner use MARGIN x that
   * per season (rate = MARGIN x perSeason / season hours) and holds at most one season of it.
   */
  sealRatePerHour: (MARGIN * SEAL_TABLE.perSeason) / (SEAL_TABLE.seasonDays * 24),
  sealCapacity: MARGIN * SEAL_TABLE.perSeason,

  /** HUNTING TIME a unique drop claim can be paid for: 1 hour per hour of the server clock, up to the longest a reward can wait. SOURCE: tunables battlePass.capHours (10, the Pass storage cap), BOUNDS.burstHours. */
  huntSecondsPerHour: 3600,
  huntCapacitySeconds: BOUNDS.burstHours * 3600,
  /** A claim that asks for more than the server clock allows by this much is flagged (a clock set forward, or a made-up duration). */
  huntFlagExcessSeconds: 2 * 3600,

  /** BOSS KILLS a claim can be paid for: SOURCE progress BOUNDS.bossesPerDay (20 runs x 10 bosses), a day of it at most. */
  bossRatePerHour: BOUNDS.bossesPerDay / 24,
  bossCapacity: BOUNDS.bossesPerDay,
  /** The most boss stages one claim may list (one run is at most a few dozen). */
  bossStagesPerClaim: 60,

  /**
   * UNIQUES per rolling day (hunting and bosses together), certified: the grinder who clears 80 bosses a day with Sorte Grande expects 80 x 0.03 x 1.25 = 3.0; the cap is 4x that (a lucky streak)
   * and is the last safety net behind the two time limits above.
   */
  uniqueDayCap: 12,

  /**
   * GOLD POUCH. Count: POUCH_TABLE.perDay (3) per local day, MARGIN x that per rolling day (the client counts local days, a day can straddle two). Gold: what the hero could have earned.
   * SOURCE docs/BALANCE_BASELINE.md: the Pass owner earns about 2,470 Gold a day at days 46-60 (the median of the long sim); docs/ECONOMY_AUDIT.md: a Dungeon clear at floor 100 pays about
   * 197 Gold and a hero can do 20 runs a day = 3,940. Together 6,410 a day; 10,000 leaves about a 1.5x margin. The bucket holds the biggest pouch (never less) so a saver can make it.
   */
  pouchCountPerHour: (MARGIN * POUCH_TABLE.perDay) / 24,
  pouchCountCapacity: MARGIN * POUCH_TABLE.perDay,
  pouchGoldPerDay: 10_000,
  pouchGoldCapacity: (): number => Math.max(...Object.values(POUCH_TABLE.faces)),
} as const;
