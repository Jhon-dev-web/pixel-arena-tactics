import { EnemyKind } from './enemies';
import { MaterialId } from './materials';
import { GemId } from './gems';
import T from './tunables';

export interface DropEntry {
  material: MaterialId;
  qty: number;
  chance: number;
}

export interface DungeonBiomeDef {
  id: string;
  nameKey: string;
  enemyKind: EnemyKind;
  startFloor: number;
  endFloor: number;
  goldMin: number;
  goldMax: number;
  cpStart: number;
  cpEnd: number;
  drops: DropEntry[];
}

export const MAX_DUNGEON_FLOOR = 100;

// The Dungeon never drops farm materials (leather/ore/etc — that's Open Hunting's job exclusively).
// Its rewards are XP, gold, and the one-time milestone payouts below.
// Economy design: goldMin/goldMax (+ goldRewardGrowth in tunables.ts) were cut hard from their original
// values — Dungeon + Expedition together were pushing a median player past 10k-100k gold/day, which
// leaves gold with no real scarcity (a problem if it's ever exchanged for ONE down the line). Checkpoint
// (miniBossGoldMult 2.5x) and boss (bossGoldMult 5x) multipliers are untouched on purpose — a bigger
// payout at a milestone is still meant to feel special, only the steady per-floor drip needed to shrink.
export const DUNGEON_BIOMES: DungeonBiomeDef[] = [
  {
    id: 'goblin_forest',
    nameKey: 'floor1',
    enemyKind: 'goblin',
    startFloor: 1,
    endFloor: 25,
    goldMin: 5,
    goldMax: 8,
    cpStart: 44,
    cpEnd: 615,
    drops: [],
  },
  {
    id: 'orc_camp',
    nameKey: 'floor2',
    enemyKind: 'orc',
    startFloor: 26,
    endFloor: 50,
    goldMin: 9,
    goldMax: 14,
    cpStart: 435,
    cpEnd: 952,
    drops: [],
  },
  {
    id: 'warlock_crypt',
    nameKey: 'floor3',
    enemyKind: 'warlock',
    startFloor: 51,
    endFloor: 75,
    goldMin: 13,
    goldMax: 18,
    cpStart: 811,
    cpEnd: 1193,
    drops: [],
  },
  {
    id: 'minotaur_lair',
    nameKey: 'floor4',
    enemyKind: 'boss',
    startFloor: 76,
    endFloor: 100,
    goldMin: 15,
    goldMax: 21,
    cpStart: 1199,
    cpEnd: 1459,
    drops: [],
  },
];

export function getBiomeForFloor(floor: number): DungeonBiomeDef {
  const clamped = Math.max(1, Math.min(MAX_DUNGEON_FLOOR, floor));
  return DUNGEON_BIOMES.find((b) => clamped >= b.startFloor && clamped <= b.endFloor) ?? DUNGEON_BIOMES[DUNGEON_BIOMES.length - 1];
}

export function recommendedCpForFloor(floor: number): number {
  const biome = getBiomeForFloor(floor);
  const span = biome.endFloor - biome.startFloor;
  const progress = span <= 0 ? 0 : (Math.max(1, Math.min(MAX_DUNGEON_FLOOR, floor)) - biome.startFloor) / span;
  return Math.round(biome.cpStart + (biome.cpEnd - biome.cpStart) * progress);
}

export function isDungeonCheckpoint(floor: number): boolean {
  return floor % T.battle.miniBossEvery === 0;
}

export function isDungeonBoss(floor: number): boolean {
  return floor % T.battle.bossEvery === 0;
}

export function dungeonEnemyKindForFloor(floor: number): EnemyKind {
  return isDungeonBoss(floor) ? 'boss' : getBiomeForFloor(floor).enemyKind;
}

export function nextMilestone(floor: number): { floor: number; boss: boolean } | null {
  for (let f = floor + 1; f <= MAX_DUNGEON_FLOOR; f++) {
    if (isDungeonBoss(f)) return { floor: f, boss: true };
    if (isDungeonCheckpoint(f)) return { floor: f, boss: false };
  }
  return null;
}

// Bonus XP granted (regardless of run outcome) for every checkpoint/boss stage actually defeated this run
// — floors startFloor..startFloor+stagesCleared-1, i.e. exactly the floors whose enemy was actually killed.
export function milestoneXpBonus(startFloor: number, stagesCleared: number): number {
  let bonus = 0;
  for (let f = startFloor; f <= startFloor + stagesCleared - 1; f++) {
    if (isDungeonBoss(f)) bonus += T.advanced.bossXpBonus;
    else if (isDungeonCheckpoint(f)) bonus += T.advanced.checkpointXpBonus;
  }
  return bonus;
}

// Per-kill XP scales with floor difficulty (rewardGrowth) instead of a flat rate — a floor-99 kill is
// worth far more than a floor-1 kill. This only matters now because normal Dungeon runs are capped to
// a few sessions/day (see App.tsx enterDungeon), so it's safe for a deep run to pay out a lot without
// becoming a farmable-forever XP faucet the way flat per-kill XP would have been. Kept on its own
// tunable (rewardGrowth) separate from gold's (goldRewardGrowth, waves.ts) so tuning the gold economy
// never silently reflows XP pacing, and vice versa.
export function stageVictoryXp(floor: number): number {
  return Math.round(T.advanced.victoryXp * (1 + T.battle.rewardGrowth * (floor - 1)));
}

export function dungeonRunXp(startFloor: number, stagesCleared: number): number {
  let total = 0;
  for (let f = startFloor; f <= startFloor + stagesCleared - 1; f++) {
    total += stageVictoryXp(Math.min(MAX_DUNGEON_FLOOR, f));
  }
  return total;
}

// One-time "first clear" milestone payouts — biome-boss floors only (25/50/75/100).
export interface MilestoneReward {
  floor: number;
  gold: number;
  gems: Partial<Record<GemId, number>>;
  titleId?: string;
  oneTokenBalance?: number;
}

export const MILESTONE_REWARDS: MilestoneReward[] = [
  { floor: 25, gold: 2000, gems: { ruby: 2, sapphire: 2, emerald: 2 } },
  { floor: 50, gold: 5000, gems: { ruby: 4, sapphire: 4, emerald: 4 }, titleId: 'title_shadow_pathfinder' },
  { floor: 75, gold: 12000, gems: { ruby: 8, sapphire: 8, emerald: 8 }, titleId: 'title_abyss_conqueror' },
  { floor: 100, gold: 30000, gems: { ruby: 15, sapphire: 15, emerald: 15 }, titleId: 'title_100_floors_legend', oneTokenBalance: 50 },
];

export const MILESTONE_FLOORS = MILESTONE_REWARDS.map((m) => m.floor);

export function getMilestoneReward(floor: number): MilestoneReward | undefined {
  return MILESTONE_REWARDS.find((m) => m.floor === floor);
}

// --- Elite challenge: optional re-fight of an already-beaten gate boss, same floor, no floor-progress
// stakes. Unlocked once the normal boss at that floor has been legitimately cleared (i.e. its milestone
// was banked — see crossedMilestoneFloors/dungeonCheckpoints), never blocking normal progression.
export function isEliteUnlocked(floor: number, dungeonCheckpoints: number[]): boolean {
  return MILESTONE_FLOORS.includes(floor) && dungeonCheckpoints.includes(floor);
}

export interface EliteReward {
  gold: number;
  gems: Partial<Record<GemId, number>>;
  shards: number;
  catalysts: number;
  oneTokenBalance?: number;
}

// First-clear-only, exclusive on top of the repeatable reward below — clearly better than both a
// common wave and the normal gate boss, per floor. No new currency: gold/gems/shards/catalysts/ONE
// all already exist elsewhere in the economy.
export const ELITE_FIRST_CLEAR_REWARDS: Record<number, EliteReward> = {
  25: { gold: 4000, gems: { ruby: 4, sapphire: 4, emerald: 4 }, shards: 8, catalysts: 2 },
  50: { gold: 10000, gems: { ruby: 8, sapphire: 8, emerald: 8 }, shards: 14, catalysts: 4 },
  75: { gold: 24000, gems: { ruby: 14, sapphire: 14, emerald: 14 }, shards: 20, catalysts: 6 },
  100: { gold: 60000, gems: { ruby: 25, sapphire: 25, emerald: 25 }, shards: 30, catalysts: 10, oneTokenBalance: 100 },
};

// Repeatable reward for farming an already-cleared Elite fight again — still clearly above the normal
// gate boss's own repeatable loot (see waveRewards' bossGoldMult/bossShards/gem), just not the one-time
// jackpot. No gold and no ONE here on purpose: Elite is a single instant fight with no cooldown or
// daily/weekly cap, unlike the normal Dungeon climb (which paces gold via wave-by-wave risk) or the
// Expedition (which paces ONE via dispatch time) — a repeatable liquid payout here would bypass both
// of those frictions. Stays gems/shards/catalysts only until a cap is designed and approved.
export const ELITE_REPEAT_REWARDS: Record<number, EliteReward> = {
  25: { gold: 0, gems: { ruby: 1 }, shards: 3, catalysts: 0 },
  50: { gold: 0, gems: { sapphire: 1 }, shards: 5, catalysts: 1 },
  75: { gold: 0, gems: { emerald: 1 }, shards: 7, catalysts: 1 },
  100: { gold: 0, gems: { ruby: 1, sapphire: 1 }, shards: 10, catalysts: 2 },
};

export function getEliteReward(floor: number, alreadyDefeated: boolean): EliteReward | undefined {
  return alreadyDefeated ? ELITE_REPEAT_REWARDS[floor] : ELITE_FIRST_CLEAR_REWARDS[floor];
}

// Milestone floors (25/50/75/100) actually defeated this run (floors startFloor..startFloor+stagesCleared-1)
// that the player hasn't already been credited for. Callers must only invoke this for a successful
// (retreat) outcome — a run that ends in defeat must never credit a milestone, even one "cleared"
// earlier in that same run, since the hero didn't survive to bank the progress.
export function crossedMilestoneFloors(startFloor: number, stagesCleared: number, alreadyClaimed: number[]): number[] {
  if (stagesCleared <= 0) return [];
  const lastClearedFloor = startFloor + stagesCleared - 1;
  // Inclusive of startFloor itself: since a defeat now banks the floor checkpoint (see finishRun),
  // a run can legitimately start exactly on an unclaimed milestone floor — e.g. you died on the
  // floor-25 boss last time, come back, and beat it this run. That must still count as crossing it.
  return MILESTONE_FLOORS.filter((f) => f >= startFloor && f <= lastClearedFloor && !alreadyClaimed.includes(f));
}
