import { GEAR_LEVEL_GATES, PARAGON_FIRST_XP, PARAGON_GROWTH, PROFESSION_XP_TO_LEVEL, UNIQUE_FLOOR_GATES, XP_TO_LEVEL } from './tables.ts';

// The numbers the season ranking reads out of a save. Pure and dependency-free (no game import, Web APIs only) so the SAME file runs in the Deno Edge Function
// (which trusts nothing the client says about itself) and in the browser (which uses it only to know when something worth submitting happened).
// The input is `unknown` on purpose: a save is player-editable, so every field is read defensively and clamped; garbage becomes 0, never an exception.

export const METRICS_VERSION = 2; // 2: profession skill XP and levels

export interface RarityCounts {
  common: number;
  rare: number;
  epic: number;
  legendary: number;
}

/** The counters that may never go down and are tracked as a running maximum ("peak"). */
export const PEAK_KEYS = ['xp', 'highestFloor', 'deepestDepth', 'kills', 'goldEarned', 'bossesKilled', 'secondsPlayed', 'uniquesFound', 'dungeonFloors', 'dungeonRuns', 'achievements', 'miningXp', 'woodcuttingXp', 'gardeningXp'] as const;
export type PeakKey = (typeof PEAK_KEYS)[number];
export type Peak = Record<PeakKey, number>;

export interface ProgressMetrics {
  v: number;
  heroLevel: number; // 1..100
  xp: number;
  paragonLevel: number; // 0 below hero level 100
  levelTotal: number; // heroLevel, plus the paragon level once the hero is 100: the number the ranking orders by first
  highestFloor: number; // 0..100
  deepestDepth: number; // Profundezas depth ever cleared
  kills: number;
  goldEarned: number;
  bossesKilled: number;
  secondsPlayed: number;
  uniquesFound: number;
  dungeonFloors: number;
  dungeonRuns: number;
  achievements: number; // achievements claimed
  // Profession skill XP (save.skillXp) and the level the XP table gives. XP is the score of that profession's ranking.
  miningXp: number;
  miningLevel: number;
  woodcuttingXp: number;
  woodcuttingLevel: number;
  gardeningXp: number;
  gardeningLevel: number;
  items: RarityCounts; // gear instances owned, by rarity
  hasPassFlag: boolean; // what the SAVE says; never trusted, only compared with the server entitlement
  premiumClaims: number; // premium Pass track rewards claimed
  stashBonusSlots: number; // Pass-sourced stash slots
  gateViolations: string[]; // gear template ids that exist below their level / floor gate (max 5)
  // The BALANCES a promo credit can raise (migration 0028): Gold, Eter (shards) and the number of potion units (bag + stash). Optional: a snapshot stored before they were read has none, and then there is no baseline to compare with.
  gold?: number;
  shards?: number;
  consumableUnits?: number;
}

// Hard clamps so a tampered giant cannot overflow a bigint, a jsonb column or a comparison. Far above anything playable.
const CAPS = { xp: 1e12, floor: 100, depth: 99_999, counter: 1e12 };

const num = (v: unknown, max: number): number => {
  const n = typeof v === 'number' ? v : Number.NaN;
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), max);
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Total units in a { id: count } record (the potions of the bag or the stash), each count clamped; garbage is 0. */
const unitsOf = (v: unknown): number => {
  if (!isObj(v)) return 0;
  let total = 0;
  let seen = 0;
  for (const n of Object.values(v)) {
    if (++seen > 200) break;
    total += num(n, 1e9);
  }
  return Math.min(total, CAPS.counter);
};

export const PROFESSIONS = ['mining', 'woodcutting', 'gardening'] as const;
export type ProfessionId = (typeof PROFESSIONS)[number];

/** Profession skill level (1..max) from its total XP, by the table copied from the game's curves. */
export function professionLevelFromXp(profession: ProfessionId, xp: number): number {
  const table = PROFESSION_XP_TO_LEVEL[profession];
  let lo = 1;
  let hi = table.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (xp >= table[mid - 1]) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** What the profession rankings store for one snapshot: only professions with some XP. score = total skill XP. */
export function professionScores(m: Pick<ProgressMetrics, 'miningXp' | 'miningLevel' | 'woodcuttingXp' | 'woodcuttingLevel' | 'gardeningXp' | 'gardeningLevel'>): { profession: ProfessionId; xp: number; level: number }[] {
  const all = [
    { profession: 'mining' as const, xp: m.miningXp, level: m.miningLevel },
    { profession: 'woodcutting' as const, xp: m.woodcuttingXp, level: m.woodcuttingLevel },
    { profession: 'gardening' as const, xp: m.gardeningXp, level: m.gardeningLevel },
  ];
  return all.filter((p) => p.xp > 0);
}

/** Hero level (1..100) from XP, by the table copied from the game's curve. */
export function levelFromXp(xp: number): number {
  let lo = 1;
  let hi = XP_TO_LEVEL.length; // 100
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (xp >= XP_TO_LEVEL[mid - 1]) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export const paragonStartXp = (): number => XP_TO_LEVEL[XP_TO_LEVEL.length - 1];
const paragonCost = (n: number): number => Math.max(1, Math.round(PARAGON_FIRST_XP * Math.pow(PARAGON_GROWTH, Math.max(0, n - 1))));

/** Paragon level and the share (0..1) of the next paragon level already earned. */
export function paragonFromXp(xp: number): { level: number; share: number } {
  let left = xp - paragonStartXp();
  if (!(left >= 0)) return { level: 0, share: 0 };
  let level = 0;
  for (;;) {
    const need = paragonCost(level + 1);
    if (left < need || level >= 9999) return { level, share: Math.min(1, left / need) };
    left -= need;
    level++;
  }
}

/** Continuous "how far along" position: the level plus the share of the next one (paragon levels count on after 100). Used by the pace checks. */
export function levelPosition(xp: number): number {
  const level = levelFromXp(xp);
  if (level >= XP_TO_LEVEL.length) {
    const p = paragonFromXp(xp);
    return XP_TO_LEVEL.length + p.level + p.share;
  }
  const from = XP_TO_LEVEL[level - 1];
  const to = XP_TO_LEVEL[level];
  return level + (xp - from) / Math.max(1, to - from);
}

/**
 * Reads the metrics from a save blob (the object the game uploads: SaveData plus appVersion). Returns null when it is not even an object.
 * Nothing here decides anything: the verdict is evaluate.ts's job.
 */
export function extractMetrics(blob: unknown): ProgressMetrics | null {
  if (!isObj(blob)) return null;
  const stats = isObj(blob.stats) ? blob.stats : {};
  const xp = num(blob.xp, CAPS.xp);
  const heroLevel = levelFromXp(xp);
  const paragonLevel = heroLevel >= XP_TO_LEVEL.length ? paragonFromXp(xp).level : 0;
  const highestFloor = num(blob.highestDungeonFloor, CAPS.floor);

  const items: RarityCounts = { common: 0, rare: 0, epic: 0, legendary: 0 };
  const violations: string[] = [];
  // The level gate is about WEARING (the game refuses to put on a piece above the hero's level, and bind-item refuses to bind it): a piece above the level may sit in the bag (it was bought
  // or found, and waits). So the level check looks only at the pieces worn in the save's `equipped` slots; the floor gate of a unique (where it can drop) still looks at every instance.
  const worn = new Set<string>();
  if (isObj(blob.equipped)) for (const v of Object.values(blob.equipped)) if (typeof v === 'string') worn.add(v);
  if (isObj(blob.gearInstances)) {
    let seen = 0;
    for (const [instId, inst] of Object.entries(blob.gearInstances)) {
      if (!isObj(inst) || ++seen > 5000) continue;
      const r = inst.rarity;
      if (r === 'common' || r === 'rare' || r === 'epic' || r === 'legendary') items[r]++;
      const id = typeof inst.templateId === 'string' ? inst.templateId : '';
      const levelGate = Object.prototype.hasOwnProperty.call(GEAR_LEVEL_GATES, id) ? GEAR_LEVEL_GATES[id] : 0;
      const floorGate = Object.prototype.hasOwnProperty.call(UNIQUE_FLOOR_GATES, id) ? UNIQUE_FLOOR_GATES[id] : 0;
      if (((heroLevel < levelGate && worn.has(instId)) || highestFloor < floorGate) && violations.length < 5 && !violations.includes(id)) violations.push(id);
    }
  }

  const skill = isObj(blob.skillXp) ? blob.skillXp : {};
  const miningXp = num(skill.mining, CAPS.xp);
  const woodcuttingXp = num(skill.woodcutting, CAPS.xp);
  const gardeningXp = num(skill.gardening, CAPS.xp);
  const quests = isObj(blob.quests) ? blob.quests : {};
  const claimedPass = isObj(blob.claimedPassRewards) ? blob.claimedPassRewards : {};
  return {
    v: METRICS_VERSION,
    heroLevel,
    xp,
    paragonLevel,
    levelTotal: heroLevel + paragonLevel,
    highestFloor,
    deepestDepth: num(stats.deepestDepth, CAPS.depth),
    kills: num(stats.kills, CAPS.counter),
    goldEarned: num(stats.goldEarned, CAPS.counter),
    bossesKilled: num(stats.bossesKilled, CAPS.counter),
    secondsPlayed: num(stats.secondsPlayed, CAPS.counter),
    uniquesFound: num(stats.uniquesFound, CAPS.counter),
    dungeonFloors: num(stats.dungeonFloors, CAPS.counter),
    dungeonRuns: num(stats.dungeonRuns, CAPS.counter),
    achievements: Array.isArray(quests.claimed) ? Math.min(quests.claimed.length, 1000) : 0,
    miningXp,
    miningLevel: professionLevelFromXp('mining', miningXp),
    woodcuttingXp,
    woodcuttingLevel: professionLevelFromXp('woodcutting', woodcuttingXp),
    gardeningXp,
    gardeningLevel: professionLevelFromXp('gardening', gardeningXp),
    items,
    hasPassFlag: blob.hasBattlePass === true,
    premiumClaims: Array.isArray(claimedPass.premium) ? Math.min(claimedPass.premium.length, 1000) : 0,
    stashBonusSlots: num(blob.stashBonusSlots, 1000),
    gateViolations: violations,
    gold: num(blob.gold, CAPS.counter),
    shards: num(blob.shards, CAPS.counter),
    consumableUnits: unitsOf(blob.consumables) + unitsOf(isObj(blob.stash) ? blob.stash.consumables : undefined),
  };
}

export const peakOf = (m: ProgressMetrics): Peak => {
  const out = {} as Peak;
  for (const k of PEAK_KEYS) out[k] = m[k];
  return out;
};

export const maxPeak = (a: Peak | null, b: Peak): Peak => {
  if (!a) return { ...b };
  const out = {} as Peak;
  for (const k of PEAK_KEYS) out[k] = Math.max(a[k] ?? 0, b[k] ?? 0);
  return out;
};

// ---- the score --------------------------------------------------------------------------------------------------------------------------------
// ONE integer that orders the ranking: hero level including paragon first, then how deep (floor + Profundezas depth). Computed on the server only; the time the
// player first reached it breaks ties (stored beside it). level * 1,000,000 + depth part: at most about 10,100 * 1e6, well inside a bigint (and a JS safe integer).
export const SCORE_DEPTH_MODULUS = 1_000_000;

type ScoreInput = Pick<ProgressMetrics, 'heroLevel' | 'paragonLevel' | 'levelTotal' | 'highestFloor' | 'deepestDepth'>;

export function depthScoreOf(m: Pick<ProgressMetrics, 'highestFloor' | 'deepestDepth'>): number {
  return Math.min(SCORE_DEPTH_MODULUS - 1, m.highestFloor + m.deepestDepth);
}

export function computeScore(m: ScoreInput): number {
  return m.levelTotal * SCORE_DEPTH_MODULUS + depthScoreOf(m);
}

/** The parts back out of a stored score (what the leaderboard view and the client show). */
export function splitScore(score: number): { levelTotal: number; depthScore: number } {
  return { levelTotal: Math.floor(score / SCORE_DEPTH_MODULUS), depthScore: score % SCORE_DEPTH_MODULUS };
}

export function scoreParts(m: ScoreInput): { levelTotal: number; paragonLevel: number; highestFloor: number; deepestDepth: number; depthScore: number } {
  return { levelTotal: m.levelTotal, paragonLevel: m.paragonLevel, highestFloor: m.highestFloor, deepestDepth: m.deepestDepth, depthScore: depthScoreOf(m) };
}
