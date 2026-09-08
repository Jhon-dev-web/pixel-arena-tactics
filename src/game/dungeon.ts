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
export const DUNGEON_BIOMES: DungeonBiomeDef[] = [
  {
    id: 'goblin_forest',
    nameKey: 'floor1',
    enemyKind: 'goblin',
    startFloor: 1,
    endFloor: 25,
    goldMin: 4,
    goldMax: 8,
    cpStart: 50,
    cpEnd: 350,
    drops: [],
  },
  {
    id: 'orc_camp',
    nameKey: 'floor2',
    enemyKind: 'orc',
    startFloor: 26,
    endFloor: 50,
    goldMin: 80,
    goldMax: 120,
    cpStart: 400,
    cpEnd: 1200,
    drops: [],
  },
  {
    id: 'warlock_crypt',
    nameKey: 'floor3',
    enemyKind: 'warlock',
    startFloor: 51,
    endFloor: 75,
    goldMin: 150,
    goldMax: 200,
    cpStart: 1300,
    cpEnd: 3000,
    drops: [],
  },
  {
    id: 'minotaur_lair',
    nameKey: 'floor4',
    enemyKind: 'boss',
    startFloor: 76,
    endFloor: 100,
    goldMin: 300,
    goldMax: 450,
    cpStart: 3200,
    cpEnd: 6500,
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

// Milestone floors (25/50/75/100) actually defeated this run (floors startFloor..startFloor+stagesCleared-1)
// that the player hasn't already been credited for. Callers must only invoke this for a successful
// (retreat) outcome — a run that ends in defeat must never credit a milestone, even one "cleared"
// earlier in that same run, since the hero didn't survive to bank the progress.
export function crossedMilestoneFloors(startFloor: number, stagesCleared: number, alreadyClaimed: number[]): number[] {
  if (stagesCleared <= 0) return [];
  const lastClearedFloor = startFloor + stagesCleared - 1;
  return MILESTONE_FLOORS.filter((f) => f > startFloor && f <= lastClearedFloor && !alreadyClaimed.includes(f));
}
