import { BOSS_TABLE, HUNT_ZONES, LUCK_TABLE, RARITY_TABLE, RarityId, SEAL_MIN_RARITY, SUBSTAT_TABLE, SubstatKind } from './tables.ts';
import type { SubstatRoll } from './types.ts';

// The server's dice. These are the game's own rolls (rarity.ts rollRarity / rollRarityAtLeast / rollSubstats, uniques.ts rollUniqueDrop / rollBossUniques) written over the generated
// tables, with the RNG passed in: a test feeds the game's functions and these the same stream and requires the same answer, so the two cannot drift apart silently.

export type Rng = () => number;

/** The production RNG: 32 random bits from the platform's CSPRNG, as a fraction in [0, 1). A non-cryptographic generator is never used for a roll that can become money. */
export function secureRng(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 4294967296;
}

const randInt = (min: number, max: number, rng: Rng): number => Math.floor(rng() * (max - min + 1)) + min;

export function rollRarity(rng: Rng): RarityId {
  const r = rng();
  let acc = 0;
  for (const def of RARITY_TABLE) {
    acc += def.chance;
    if (r < acc) return def.id;
  }
  return 'common';
}

/** The Blacksmith's Seal: the table's own weights restricted to `min` and better (epic 10 : legendary 2). */
export function rollRarityAtLeast(min: RarityId, rng: Rng): RarityId {
  const from = Math.max(0, RARITY_TABLE.findIndex((r) => r.id === min));
  const pool = RARITY_TABLE.slice(from);
  const total = pool.reduce((sum, r) => sum + r.chance, 0);
  const r = rng() * total;
  let acc = 0;
  for (const def of pool) {
    acc += def.chance;
    if (r < acc) return def.id;
  }
  return pool[pool.length - 1].id;
}

export const sealRarity = (rng: Rng): RarityId => rollRarityAtLeast(SEAL_MIN_RARITY, rng);

type SubstatDef = (typeof SUBSTAT_TABLE)[number];

const tierRange = (def: SubstatDef, tier: number): readonly [number, number] | undefined => def.ranges?.[Math.min(def.ranges.length, Math.max(1, Math.floor(tier) || 1)) - 1];

// The rarity's substatMult scales the tier's roll once, kept to one decimal (rarity.ts scaleSubstat); the draws are the same as an unscaled roll.
const scaleSubstat = (value: number, mult: number): number => (mult === 1 ? value : Math.round(value * mult * 10) / 10);

function rollSubstatValue(def: SubstatDef, tier: number, rng: Rng, mult: number): number {
  const range = tierRange(def, tier);
  if (!range) return scaleSubstat(def.min + randInt(0, def.max - def.min, rng) + Math.round(def.perTier * tier), mult);
  const scale = Math.pow(10, def.decimals);
  return scaleSubstat((Math.round(range[0] * scale) + randInt(0, Math.round((range[1] - range[0]) * scale), rng)) / scale, mult);
}

function rollSubstat(tier: number, exclude: SubstatKind[], rng: Rng, mult: number): SubstatRoll {
  const pool = SUBSTAT_TABLE.filter((s) => !exclude.includes(s.type));
  const def = pool[randInt(0, pool.length - 1, rng)];
  return { type: def.type, value: rollSubstatValue(def, tier, rng, mult) };
}

/** `extra` = additional guaranteed substat slots (a unique piece rolls one more than its rarity's count). */
export function rollSubstats(rarity: RarityId, tier: number, extra: number, rng: Rng): SubstatRoll[] {
  const def = RARITY_TABLE.find((r) => r.id === rarity);
  const count = (def?.substatCount ?? 0) + extra;
  const subs: SubstatRoll[] = [];
  const used: SubstatKind[] = [];
  for (let i = 0; i < count; i++) {
    const s = rollSubstat(tier, used, rng, def?.substatMult ?? 1);
    used.push(s.type);
    subs.push(s);
  }
  return subs;
}

export interface RolledPiece {
  templateId: string;
  rarity: RarityId;
  substats: SubstatRoll[];
}

/** One drop of a unique: rarity from the normal table, substats for that rarity and tier plus the guaranteed extra slot (uniques.ts rollUniqueDrop). */
export function rollUnique(templateId: string, tier: number, rng: Rng): RolledPiece {
  const rarity = rollRarity(rng);
  return { templateId, rarity, substats: rollSubstats(rarity, tier, 1, rng) };
}

/** Number of Bernoulli trials for `expected` rolls: the whole part always, the fraction as one more trial that happens with that probability. */
export function wholeRolls(expected: number, rng: Rng): number {
  if (!(expected > 0)) return 0;
  const whole = Math.floor(expected);
  return whole + (rng() < expected - whole ? 1 : 0);
}

/** The luck a client claims, clamped to what the skill can give at most (heroSkills.ts Sorte Grande): 1 for anything that is not a number above 1. */
export function clampLuck(raw: unknown, max: number): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : 1;
  return Math.min(max, Math.max(1, n));
}

export const maxHuntLuck = (): number => LUCK_TABLE.hunt;
export const maxBossLuck = (): number => LUCK_TABLE.boss;

/**
 * The uniques a Hunting claim of `hours` earned: each unique of the zone is tried `rollsPerHour x hours` times at its chance x luck (the economic rolls the chances are sized for,
 * tables.ts HUNT_ZONES). Returns the dropped pieces, in the order they dropped.
 */
export function rollHuntUniques(zoneId: string, hours: number, luck: number, tierOf: (id: string) => number, rng: Rng): { drops: RolledPiece[]; rolls: number } | null {
  const zone = HUNT_ZONES.find((z) => z.id === zoneId);
  if (!zone) return null;
  const rolls = wholeRolls(hours * zone.rollsPerHour, rng);
  const drops: RolledPiece[] = [];
  for (let i = 0; i < rolls; i++) {
    for (const u of zone.uniques) if (rng() < u.chance * luck) drops.push(rollUnique(u.itemId, tierOf(u.itemId), rng));
  }
  return { drops, rolls };
}

// ---- Dungeon bosses -------------------------------------------------------------------------------------------------------------------------------------------------------------

const BIOME_FLOORS: readonly number[] = Object.keys(BOSS_TABLE.biomePools).map(Number);

/** True for a stage that is a unique-dropping boss: the biome boss floors (25 / 50 / 75 / 100) and every depth boss (a stage past 100 whose depth is a multiple of the boss rhythm). */
export function isBossStage(stage: number): boolean {
  if (!Number.isInteger(stage) || stage < 1) return false;
  if (stage <= BOSS_TABLE.maxFloor) return BIOME_FLOORS.includes(stage);
  return (stage - BOSS_TABLE.maxFloor) % BOSS_TABLE.depthBossEvery === 0;
}

/** The dungeon floor a boss stage stands on, for the account-age gate: the biome floor itself, or 100 for a depth boss. */
export const bossStageFloor = (stage: number): number => Math.min(BOSS_TABLE.maxFloor, stage);

const depthChance = (depth: number): number => Math.min(BOSS_TABLE.depthChanceCap, BOSS_TABLE.depthChanceBase + BOSS_TABLE.depthChancePerDepth * Math.max(0, depth));

/** uniques.ts depthBossPool: the biome boss whose pieces the boss of depth `depth` drops, in turn. */
function depthPool(depth: number): number {
  const pools = BOSS_TABLE.depthPools;
  return pools[(Math.max(1, Math.round(depth / BOSS_TABLE.depthBossEvery)) - 1) % pools.length];
}

/** The uniques ONE boss kill of `stage` can drop: [template ids, chance each] (uniques.ts rollBossUniques / rollDepthBossUniques, before the luck). */
export function bossUniqueTable(stage: number): { ids: readonly string[]; chance: number } {
  if (stage <= BOSS_TABLE.maxFloor) return { ids: (BOSS_TABLE.biomePools as Record<number, readonly string[]>)[stage] ?? [], chance: BOSS_TABLE.biomeChance };
  const depth = stage - BOSS_TABLE.maxFloor;
  return { ids: (BOSS_TABLE.biomePools as Record<number, readonly string[]>)[depthPool(depth)] ?? [], chance: depthChance(depth) };
}

export function rollBossUniques(stages: readonly number[], luck: number, tierOf: (id: string) => number, rng: Rng): RolledPiece[] {
  const drops: RolledPiece[] = [];
  for (const stage of stages) {
    const { ids, chance } = bossUniqueTable(stage);
    for (const id of ids) if (rng() < chance * luck) drops.push(rollUnique(id, tierOf(id), rng));
  }
  return drops;
}
