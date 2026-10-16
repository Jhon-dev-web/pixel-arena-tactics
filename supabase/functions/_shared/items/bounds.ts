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

  /**
   * BOSS KILLS a claim can be paid for, per rolling day. The server cannot see a fight, so this is what it is willing to ROLL uniques for, not what a hero can kill (that is
   * BOUNDS.bossesPerDay = 200, which the progress audit uses to judge the game's own counters). League review (Rodada 22): at 200 a save-editing bot minted about 12 certified
   * uniques a day. An honest hero does 10 free runs a day and meets each of the four biome bosses at most once per run, so 15 paid kills cover the runs that reach a boss with room to
   * spare. Kills beyond it are not rolled (a partial grant, and the excess is flagged), never refused.
   */
  bossKillsPerDay: 15,
  bossRatePerHour: 15 / 24,
  bossCapacity: 15,
  /** The most boss stages one claim may list (one run is at most a few dozen). */
  bossStagesPerClaim: 60,

  /**
   * UNIQUES per rolling day (hunting and bosses together), certified. League review (Rodada 22): a plain player finds 1 to 2 uniques in a whole 60-day season and an owner who hunts all day 3 to 5 (docs/BALANCE_CHANGES.md
   * Rodada 22). With 15 paid boss kills a day (0.03 x 1.25 each = 0.56 expected at the very most) plus 10 h of Hunting, the day's expectation is under 1; 2 is a lucky day, and it is the
   * most a save-editing bot gets in a day (it was 12). Atomic in item_commit: a claim that would pass it is thrown away unseen.
   */
  uniqueDayCap: 2,

  /**
   * GOLD POUCH. Count: POUCH_TABLE.perDay (3) per local day, MARGIN x that per rolling day (the client counts local days, a day can straddle two). Gold: what the hero could have earned.
   * SOURCE docs/BALANCE_BASELINE.md: the Pass owner earns about 2,470 Gold a day at days 46-60 (the median of the long sim), and docs/BALANCE_CHANGES.md Rodada 22 measured 1,000 to
   * 3,300 a day for the owner (the weekly mean, by policy). That is what an honest hero can turn into pouches, so the limit is 3,000 a day (it was 10,000, which let a save-editing bot mint 10,000 pouch Gold a day:
   * the old term for Dungeon clears, 3,940 a day, was never reachable by a hero who also spends). The bucket holds the biggest pouch (never less) so a saver can make it in about a week.
   */
  pouchCountPerHour: (MARGIN * POUCH_TABLE.perDay) / 24,
  pouchCountCapacity: MARGIN * POUCH_TABLE.perDay,
  pouchGoldPerDay: 3_000,
  pouchGoldCapacity: (): number => Math.max(...Object.values(POUCH_TABLE.faces)),
} as const;
