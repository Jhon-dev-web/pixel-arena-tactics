import type { SaveData } from './engine';
import { depthBossPool, depthOfStage, depthScale, isDungeonBoss, MAX_DUNGEON_FLOOR, recommendedCpForFloor, stageOfDepth } from './dungeon';
import { depthUniqueChance } from './uniques';
import T from './tunables';

// Profundezas: the endless floors after floor 100. The pure rules the screens and the run share (the enemy numbers live in waves.ts, the boss pieces in uniques.ts):
//   - stage 100 + d is depth d; the enemy is the floor-99 monster times (1 + hpGrowth)^d HP and (1 + dmgGrowth)^d damage (dungeon.ts depthScale), a boss every bossEvery depths;
//   - a run starts at the depth after the deepest one cleared (stats.deepestDepth) and goes on until the hero dies or retreats; every depth cleared is banked;
//   - the Profundezas open once the floor-100 boss has been beaten (it is in dungeonCheckpoints).

export const DEPTHS_UNLOCK_FLOOR = MAX_DUNGEON_FLOOR;

export const depthsUnlocked = (save: Pick<SaveData, 'dungeonCheckpoints'>): boolean => (save.dungeonCheckpoints ?? []).includes(DEPTHS_UNLOCK_FLOOR);

export const deepestDepth = (save: Pick<SaveData, 'stats'>): number => Math.max(0, Math.floor(save.stats?.deepestDepth ?? 0));

// The stage the next Profundezas run starts at: one below the deepest cleared.
export const nextDepthStage = (save: Pick<SaveData, 'stats'>): number => stageOfDepth(deepestDepth(save) + 1);

// Recommended CP of a stage past floor 100, by formula (the generated table stops at 100): the CP the floor-99 line asks for, grown by the geometric mean of the HP and damage
// growth (CP is the geometric mean of damage output and effective HP), times the boss multiplier's square root on a boss depth.
export function recommendedCpForDepth(depth: number): number {
  const d = Math.max(0, Math.floor(depth) || 0);
  const base = recommendedCpForFloor(MAX_DUNGEON_FLOOR - 1);
  if (d === 0) return base; // the floor-99 line itself (depthScale at depth 0 carries the Round 15 base multiple)
  const s = depthScale(stageOfDepth(d));
  return Math.round(base * Math.sqrt(s.hp * s.dmg));
}

export interface DepthRewardInfo {
  depth: number;
  boss: boolean;
  shards: number;
  uniqueChance: number; // per unique piece and for the relic of the borrowed biome boss, 0 on a regular depth
  pool: number | null; // the biome boss (25 / 50 / 75 / 100) whose pieces this boss rolls
}

export function depthRewardInfo(depth: number): DepthRewardInfo {
  const boss = isDungeonBoss(stageOfDepth(depth));
  return { depth, boss, shards: boss ? T.depths.bossShards : 0, uniqueChance: boss ? depthUniqueChance(depth) : 0, pool: boss ? depthBossPool(depth) : null };
}

// The next boss depth at or after `depth`.
export const nextBossDepth = (depth: number): number => Math.max(1, Math.ceil(Math.max(1, depth) / T.depths.bossEvery)) * T.depths.bossEvery;

// Display: the stage as the player reads it ("Andar 42" / "Profundeza 7").
export const isDepthRun = (startStage: number): boolean => depthOfStage(startStage) > 0;
