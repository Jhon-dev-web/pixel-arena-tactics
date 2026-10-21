import { BOUNDS, eventHoursBetween, PACE_FAST_FACTOR, PACE_FLAG_FACTOR, PACE_REJECT_FACTOR, REJECT_FACTOR, burstXp, daysAtFloor, daysAtLevel, floorCapForLevel, professionBurstXp, professionXpPerHour, xpPerHourAt } from './bounds.ts';
import { PEAK_KEYS, Peak, ProgressMetrics, levelPosition, maxPeak, peakOf } from './metrics.ts';

// The plausibility audit. Pure: given the metrics of a new snapshot, the server's own history of the account and the server clock, it says ok / flagged / rejected and why.
// Nothing here reads the save's own timestamps: time is the gap between server-stamped snapshots (and, for the very first one, the age of the account).
//
// Reason codes (each is a stable string stored in progress_snapshots.reasons; docs/SEASON_RANKING.md lists them for the owner):
//   REJECT-capable:  GEAR_BELOW_GATE, DEPTH_WITHOUT_FLOOR_100, PASS_FEATURES_WITHOUT_ENTITLEMENT, FLOOR_ABOVE_LEVEL_CAP,
//                    XP_RATE, XP_RATE_TOTAL, LEVEL_PACE, LEVEL_PACE_TOTAL, FLOOR_PACE, FLOOR_PACE_TOTAL, DEPTH_PACE, DEPTH_PACE_TOTAL,
//                    SECONDS_PLAYED_EXCEEDS_CLOCK, SECONDS_PLAYED_EXCEEDS_CLOCK_TOTAL,
//                    MINING_XP_RATE, WOODCUTTING_XP_RATE, GARDENING_XP_RATE (profession skill XP per server hour, with _TOTAL too),
//                    GOLD_BALANCE_JUMP, SHARDS_BALANCE_JUMP, POTIONS_BALANCE_JUMP (a balance rose by more than play, trade and the server credits allow; migration 0028),
//                    KILLS_RATE, GOLD_RATE, DUNGEON_RUNS_RATE, DUNGEON_FLOORS_RATE, BOSSES_RATE, UNIQUES_RATE, ACHIEVEMENTS_RATE (each also with the _TOTAL suffix, against the first snapshot)
//   FLAG only:       RESTORED_OLDER_SAVE (a counter went down), SAVE_REVISION_BACKWARDS, PASS_FLAG_WITHOUT_ENTITLEMENT, BASELINE_AHEAD_OF_ACCOUNT_AGE
//                    (BASELINE_AHEAD_OF_ACCOUNT_AGE is REJECT-level once the first League has reset the heroes: input.sinceReset)
//   (the REJECT-capable ones answer FLAGGED when the measure is between its flag value and its reject value, REJECTED above.)
//   NOTE only (the verdict stays ok, the player stays ranked, but the owner's audit lists the account first): FAST_LEVEL_PACE, FAST_FLOOR_PACE, FAST_DEPTH_PACE (and _TOTAL):
//   progress faster than PACE_FAST_FACTOR (1.3x) the fastest simulated seed but not above the flag value.

export type Verdict = 'ok' | 'flagged' | 'rejected';
export type Severity = 'note' | 'flag' | 'reject';

export interface HistoryPoint {
  /** Server clock (ms) when the snapshot was stored. */
  atMs: number;
  metrics: ProgressMetrics;
  /** Running maximum of the never-decreasing counters over the accepted snapshots up to and including this one. */
  peak: Peak;
  saveRevision: number;
}

export interface EvalInput {
  nowMs: number;
  /** When the account's character was created (server clock); null when unknown. */
  accountCreatedMs: number | null;
  /** The server's answer to "does this account own the Pass right now" (never the save's flag). */
  entitled: boolean;
  /** The server's League opening (public.league_reset_at(), ms), or null before it: the event calendar hangs from it, and only while an event runs may XP be a little faster (bounds.ts eventHeroBonus). */
  leagueEpochMs?: number | null;
  saveRevision: number;
  /**
   * true once the first League has reset every online hero (league_reset_at is set). `accountCreatedMs` is then already max(account created, reset_at) and `first` / `previous` only
   * hold snapshots from the reset on, so a first snapshot ahead of what is reachable since the reset is a pre-reset save coming back: nothing legitimate can be there, REJECT (not just flag).
   */
  sinceReset?: boolean;
  /** The account's first and latest ACCEPTED snapshot: only `ok` snapshots count (a flagged or rejected one is never a baseline). null when there is none yet. */
  first: HistoryPoint | null;
  previous: HistoryPoint | null;
  /**
   * The server CREDITS (migration 0028, promo codes) that were claimed by the game and not yet counted by an accepted snapshot: the balances may rise by this much on top of what play allows. The caller passes them from
   * arena_private.progress_credits_pending and marks them counted ONLY when this evaluation comes back `ok` (handler.ts), so a credit is spent once. Absent = none.
   */
  credits?: Credits;
}

/** Claimed, not yet counted server credits: Gold, Eter and potion units. */
export interface Credits {
  gold: number;
  shards: number;
  consumable: number;
}

export interface Evaluation {
  verdict: Verdict;
  reasons: string[];
  /** The peak to store with this snapshot. Only an `ok` snapshot raises it: a flagged or rejected one carries the previous peak (or, for a first snapshot, its own numbers, which the store never uses as a baseline unless ok). */
  peak: Peak;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

interface RateRule {
  code: string;
  key: (typeof PEAK_KEYS)[number];
  per: 'hour' | 'day';
  rate: number;
}

// Counter -> the bound that governs its growth (all numbers in bounds.ts).
const RATE_RULES: readonly RateRule[] = [
  { code: 'KILLS_RATE', key: 'kills', per: 'hour', rate: BOUNDS.killsPerHour },
  { code: 'GOLD_RATE', key: 'goldEarned', per: 'hour', rate: BOUNDS.goldPerHour },
  { code: 'DUNGEON_RUNS_RATE', key: 'dungeonRuns', per: 'day', rate: BOUNDS.dungeonRunsPerDay },
  { code: 'DUNGEON_FLOORS_RATE', key: 'dungeonFloors', per: 'day', rate: BOUNDS.dungeonFloorsPerDay },
  { code: 'BOSSES_RATE', key: 'bossesKilled', per: 'day', rate: BOUNDS.bossesPerDay },
  { code: 'UNIQUES_RATE', key: 'uniquesFound', per: 'day', rate: BOUNDS.uniquesPerDay },
  { code: 'ACHIEVEMENTS_RATE', key: 'achievements', per: 'day', rate: BOUNDS.achievementsPerDay },
];

// Profession -> the metrics fields it reads and the reason code of its XP rate (bounds.ts professionXpPerHour / professionBurstXp).
const PROFESSION_RULES = [
  { profession: 'mining', xp: 'miningXp', level: 'miningLevel', code: 'MINING_XP_RATE' },
  { profession: 'woodcutting', xp: 'woodcuttingXp', level: 'woodcuttingLevel', code: 'WOODCUTTING_XP_RATE' },
  { profession: 'gardening', xp: 'gardeningXp', level: 'gardeningLevel', code: 'GARDENING_XP_RATE' },
] as const;

class Findings {
  private readonly map = new Map<string, Severity>();
  add(code: string, severity: Severity): void {
    if (this.map.get(code) === 'reject') return;
    this.map.set(code, severity);
  }
  /** Soft marker: value above noteAt (and not above flagAt) is recorded as a note that never changes the verdict. */
  note(code: string, value: number, noteAt: number, flagAt: number): void {
    if (value > noteAt && value <= flagAt) this.add(code, 'note');
  }
  /** value above flagAt = flag; above rejectAt = reject. */
  check(code: string, value: number, flagAt: number, rejectAt: number): void {
    if (value > rejectAt) this.add(code, 'reject');
    else if (value > flagAt) this.add(code, 'flag');
  }
  get verdict(): Verdict {
    let v: Verdict = 'ok';
    for (const s of this.map.values()) {
      if (s === 'reject') return 'rejected';
      if (s === 'flag') v = 'flagged';
    }
    return v;
  }
  get codes(): string[] {
    return [...this.map.keys()].sort();
  }
}

/** The growth checks between a reference point (the previous snapshot, or the first one) and the new metrics. `suffix` is '' or '_TOTAL'. */
function growthChecks(f: Findings, cur: ProgressMetrics, refPeak: Peak, elapsedMs: number, suffix: string, nowMs: number, epochMs: number | null | undefined): void {
  const hours = Math.max(0, elapsedMs) / HOUR_MS;
  const days = Math.max(0, elapsedMs) / DAY_MS;
  // League events: hours of the gap during which a hero / profession event ran. They widen the XP rate by their cap, only for those hours, and the burst (a reward earned earlier, claimed now) by one cap.
  const sinceMs = nowMs - Math.max(0, elapsedMs);
  const heroEventHours = eventHoursBetween(epochMs, sinceMs, nowMs, ['hero', 'final']);
  const professionEventHours = eventHoursBetween(epochMs, sinceMs, nowMs, ['profession']);

  // XP: the best open zone for this hero's floor, per server hour (Hunting is the only source of hero XP), plus ONE burst (a reward earned before the reference point and claimed now).
  const burst = burstXp(cur.highestFloor, cur.heroLevel) * (1 + (heroEventHours > 0 ? BOUNDS.eventHeroBonus : 0));
  const xpGained = Math.max(0, cur.xp - refPeak.xp);
  const xpAllowed = xpPerHourAt(cur.highestFloor, cur.heroLevel) * (hours + BOUNDS.eventHeroBonus * heroEventHours) + burst;
  f.check('XP_RATE' + suffix, xpGained, xpAllowed, xpAllowed * REJECT_FACTOR);

  // Profession skill XP: rate at the level shown now x server hours, plus one late-claimed burst. A reference snapshot from before metrics v2 has no profession XP: no baseline, no check.
  for (const rule of PROFESSION_RULES) {
    const ref = refPeak[rule.xp];
    if (typeof ref !== 'number') continue;
    const level = cur[rule.level];
    const allowed = professionXpPerHour(rule.profession, level) * (hours + BOUNDS.eventProfessionBonus * professionEventHours) + professionBurstXp(rule.profession, level) * (1 + (professionEventHours > 0 ? BOUNDS.eventProfessionBonus : 0));
    f.check(rule.code + suffix, Math.max(0, cur[rule.xp] - ref), allowed, allowed * REJECT_FACTOR);
  }

  for (const rule of RATE_RULES) {
    const gained = Math.max(0, cur[rule.key] - refPeak[rule.key]);
    const allowed = rule.per === 'hour' ? rule.rate * (hours + BOUNDS.burstHours) : rule.rate * (days + BOUNDS.dayBurst);
    f.check(rule.code + suffix, gained, allowed, allowed * REJECT_FACTOR);
  }

  // Pace against the fastest simulated seed: how many "fastest-seed days" of progress arrived in this much server time.
  const effectiveXp = Math.max(refPeak.xp, cur.xp - burst);
  const levelDays = Math.max(0, daysAtLevel(levelPosition(effectiveXp)) - daysAtLevel(levelPosition(refPeak.xp)));
  f.check('LEVEL_PACE' + suffix, levelDays, PACE_FLAG_FACTOR * days + BOUNDS.paceSlackDays, PACE_REJECT_FACTOR * days + BOUNDS.paceSlackDays);
  f.note('FAST_LEVEL_PACE' + suffix, levelDays, PACE_FAST_FACTOR * days + BOUNDS.paceSlackDays, PACE_FLAG_FACTOR * days + BOUNDS.paceSlackDays);
  const effectiveFloor = Math.max(refPeak.highestFloor, cur.highestFloor - BOUNDS.floorStepSlack);
  const floorDays = Math.max(0, daysAtFloor(effectiveFloor) - daysAtFloor(refPeak.highestFloor));
  f.check('FLOOR_PACE' + suffix, floorDays, PACE_FLAG_FACTOR * days + BOUNDS.floorPaceSlackDays, PACE_REJECT_FACTOR * days + BOUNDS.floorPaceSlackDays);
  f.note('FAST_FLOOR_PACE' + suffix, floorDays, PACE_FAST_FACTOR * days + BOUNDS.floorPaceSlackDays, PACE_FLAG_FACTOR * days + BOUNDS.floorPaceSlackDays);
  const depthGained = Math.max(0, cur.deepestDepth - refPeak.deepestDepth);
  f.check('DEPTH_PACE' + suffix, depthGained, PACE_FLAG_FACTOR * BOUNDS.depthPerDayFastest * days + BOUNDS.depthBurst, PACE_REJECT_FACTOR * BOUNDS.depthPerDayFastest * days + BOUNDS.depthBurst);
  f.note('FAST_DEPTH_PACE' + suffix, depthGained, PACE_FAST_FACTOR * BOUNDS.depthPerDayFastest * days + BOUNDS.depthBurst, PACE_FLAG_FACTOR * BOUNDS.depthPerDayFastest * days + BOUNDS.depthBurst);

  // Play time cannot outrun the clock. Impossible, not merely unlikely: reject only.
  const secondsGained = Math.max(0, cur.secondsPlayed - refPeak.secondsPlayed);
  const secondsAllowed = (Math.max(0, elapsedMs) / 1000) * BOUNDS.secondsRatio + BOUNDS.secondsSlack;
  if (secondsGained > secondsAllowed) f.add('SECONDS_PLAYED_EXCEEDS_CLOCK' + suffix, 'reject');
}

/**
 * Balances that a server credit can raise: Gold, Eter and potion units. A balance goes DOWN when spent, so unlike the counters above it is compared with the previous ACCEPTED snapshot's own value (not a peak), and only a rise counts.
 * The rise a save may show = what play and trade allow in that time + the credits the server says were claimed and not yet counted. A balance jump with no credit behind it is an edited save.
 * No previous value (a snapshot stored before these fields were read) = no check. Verdict like the other rate rules: flag above the allowance, reject above twice it.
 */
function balanceChecks(f: Findings, cur: ProgressMetrics, prev: ProgressMetrics, elapsedMs: number, credits: Credits | undefined): void {
  const days = Math.max(0, elapsedMs) / DAY_MS;
  const hours = Math.max(0, elapsedMs) / HOUR_MS;
  const c = { gold: Math.max(0, credits?.gold ?? 0), shards: Math.max(0, credits?.shards ?? 0), consumable: Math.max(0, credits?.consumable ?? 0) };
  const rules: { code: string; cur: number | undefined; prev: number | undefined; allowed: number }[] = [
    { code: 'GOLD_BALANCE_JUMP', cur: cur.gold, prev: prev.gold, allowed: BOUNDS.goldPerHour * (hours + BOUNDS.burstHours) + BOUNDS.goldTransferPerDay * (days + BOUNDS.dayBurst) + c.gold },
    { code: 'SHARDS_BALANCE_JUMP', cur: cur.shards, prev: prev.shards, allowed: BOUNDS.shardsPerDay * (days + BOUNDS.dayBurst) + c.shards },
    { code: 'POTIONS_BALANCE_JUMP', cur: cur.consumableUnits, prev: prev.consumableUnits, allowed: BOUNDS.consumableUnitsPerDay * (days + BOUNDS.dayBurst) + c.consumable },
  ];
  for (const r of rules) {
    if (typeof r.cur !== 'number' || typeof r.prev !== 'number') continue;
    f.check(r.code, Math.max(0, r.cur - r.prev), r.allowed, r.allowed * REJECT_FACTOR);
  }
}

export function evaluateSnapshot(cur: ProgressMetrics, input: EvalInput): Evaluation {
  const f = new Findings();
  const { previous, first } = input;

  // ---- impossible by themselves, whatever the history -----------------------------------------------------------------------------------------
  if (cur.gateViolations.length > 0) f.add('GEAR_BELOW_GATE', 'reject'); // e.g. a tier 6 piece in the bag of a level 30 hero
  if (cur.deepestDepth > 0 && cur.highestFloor < 100) f.add('DEPTH_WITHOUT_FLOOR_100', 'reject'); // the Profundezas open after the floor-100 boss
  if (!input.entitled) {
    if (cur.premiumClaims > 0 || cur.stashBonusSlots > 0) f.add('PASS_FEATURES_WITHOUT_ENTITLEMENT', 'reject');
    else if (cur.hasPassFlag) f.add('PASS_FLAG_WITHOUT_ENTITLEMENT', 'flag');
  }
  const cap = floorCapForLevel(cur.heroLevel);
  f.check('FLOOR_ABOVE_LEVEL_CAP', cur.highestFloor, cap, cap * BOUNDS.floorCapRejectFactor + BOUNDS.floorCapRejectSlack);

  // ---- against the account's server history ---------------------------------------------------------------------------------------------------
  if (!previous || !first) {
    // The first snapshot is the baseline: nothing earlier to compare with. A save that is far ahead of the account's age (a pre-account local save imported, or an edit
    // made before the first sync) cannot be proven wrong, so it is only flagged: it is stored, not ranked, and stays on the owner's audit list.
    const ageMs = input.accountCreatedMs === null ? 0 : Math.max(0, input.nowMs - input.accountCreatedMs);
    const days = ageMs / DAY_MS;
    const levelDays = daysAtLevel(levelPosition(Math.max(0, cur.xp - burstXp(cur.highestFloor, cur.heroLevel))));
    const floorDays = daysAtFloor(Math.max(0, cur.highestFloor - BOUNDS.floorStepSlack));
    const secondsAllowed = (ageMs / 1000) * BOUNDS.secondsRatio + BOUNDS.secondsSlack;
    const professionAhead = PROFESSION_RULES.some((r) => cur[r.xp] > professionXpPerHour(r.profession, cur[r.level]) * (ageMs / HOUR_MS) + professionBurstXp(r.profession, cur[r.level]));
    if (
      professionAhead ||
      levelDays > PACE_FLAG_FACTOR * days + BOUNDS.paceSlackDays ||
      floorDays > PACE_FLAG_FACTOR * days + BOUNDS.floorPaceSlackDays ||
      cur.deepestDepth > PACE_FLAG_FACTOR * BOUNDS.depthPerDayFastest * days + BOUNDS.depthBurst ||
      cur.secondsPlayed > secondsAllowed
    ) {
      f.add('BASELINE_AHEAD_OF_ACCOUNT_AGE', input.sinceReset ? 'reject' : 'flag');
    }
    return { verdict: f.verdict, reasons: f.codes, peak: peakOf(cur) };
  }

  // A counter that went down, or a save revision that went back: the account restored an older save (an old backup, an export from another device).
  if (input.saveRevision < previous.saveRevision) f.add('SAVE_REVISION_BACKWARDS', 'flag');
  for (const k of PEAK_KEYS) {
    if (cur[k] < previous.peak[k]) {
      f.add('RESTORED_OLDER_SAVE', 'flag');
      break;
    }
  }

  growthChecks(f, cur, previous.peak, input.nowMs - previous.atMs, '', input.nowMs, input.leagueEpochMs);
  balanceChecks(f, cur, previous.metrics, input.nowMs - previous.atMs, input.credits);
  growthChecks(f, cur, peakOf(first.metrics), input.nowMs - first.atMs, '_TOTAL', input.nowMs, input.leagueEpochMs);

  const verdict = f.verdict;
  return { verdict, reasons: f.codes, peak: verdict === 'ok' ? maxPeak(previous.peak, peakOf(cur)) : previous.peak };
}
