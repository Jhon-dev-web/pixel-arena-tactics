import T from './tunables';
import { EnemyDef } from './enemies';
import { MaterialId } from './materials';
import { GEMS, GemId } from './gems';
import { DungeonBiomeDef, depthOfStage, depthScale, isDepthStage, isDungeonBoss, isDungeonCheckpoint, MAX_DUNGEON_FLOOR } from './dungeon';
import { UniqueDrop, rollBossRelics, rollBossUniques, rollDepthBossRelics, rollDepthBossUniques } from './uniques';

export interface WaveRewards {
  gold: number;
  drops: Partial<Record<MaterialId, number>>;
  shards: number;
  gems: Partial<Record<GemId, number>>;
  uniques: UniqueDrop[]; // biome-boss floors only: T.battle.uniqueBossChance of each unique piece of that boss, on every victory
  relics: string[]; // biome-boss floors only: T.battle.relicBossChance of that boss's relic (template ids), independent of the uniques
}

export interface RunRewards {
  gold: number;
  drops: Partial<Record<MaterialId, number>>;
  shards: number;
  gems: Partial<Record<GemId, number>>;
  uniques: UniqueDrop[];
  relics: string[];
  stages: number;
}

const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

export { isDungeonBoss, isDungeonCheckpoint };

// The four biome bosses (25/50/75/100) each carry their own extra multipliers, so tuning one boss never moves the regular floors that share
// the boss EnemyDef (76-99) or the other bosses.
export function bossFloorMult(stage: number): { hp: number; dmg: number } {
  const B = T.battle;
  const table = [
    { hp: B.boss25HpMult, dmg: B.boss25DmgMult },
    { hp: B.boss50HpMult, dmg: B.boss50DmgMult },
    { hp: B.boss75HpMult, dmg: B.boss75DmgMult },
    { hp: B.boss100HpMult, dmg: B.boss100DmgMult },
  ];
  const i = Math.min(table.length, Math.max(1, Math.round(stage / B.bossEvery))) - 1;
  return table[i];
}

// Floors past 50 (Round 15): the extra piecewise-linear factor of T.battle.lateHpGrowth(2) / lateDmgGrowth(2), 1 up to floor 50 so floors 1-50 are exactly what they were.
const lateFactor = (stage: number, growth: number, growth2: number): number => 1 + growth * Math.min(25, Math.max(0, stage - 50)) + growth2 * Math.max(0, stage - 75);

export function stageEnemyHp(def: EnemyDef, stage: number): number {
  // Profundezas: the floor-99 monster scaled by the fixed percentage per depth (dungeon.ts depthScale); stages 1-100 never get here.
  if (isDepthStage(stage)) return Math.round(stageEnemyHp(def, MAX_DUNGEON_FLOOR - 1) * depthScale(stage).hp);
  const base = def.hp * (1 + T.battle.hpGrowth * (stage - 1)) * lateFactor(stage, T.battle.lateHpGrowth, T.battle.lateHpGrowth2);
  const mult = isDungeonBoss(stage) ? T.battle.bossHpMult * bossFloorMult(stage).hp : isDungeonCheckpoint(stage) ? T.battle.miniBossHpMult : 1;
  return Math.round(base * mult);
}

export function stageEnemyDmg(def: EnemyDef, stage: number): number {
  if (isDepthStage(stage)) return Math.round(stageEnemyDmg(def, MAX_DUNGEON_FLOOR - 1) * depthScale(stage).dmg);
  const base = def.dmg * (1 + T.battle.dmgGrowth * (stage - 1)) * lateFactor(stage, T.battle.lateDmgGrowth, T.battle.lateDmgGrowth2);
  // A biome's regular enemyKind can itself be the shared 'boss' EnemyDef (minotaur_lair reuses it for
  // floors 76-99, not just the Andar 100 milestone) — without the boss damage dampener, those floors'
  // un-milestoned mobs out-damage the actual boss they lead up to. Route them through bossDmgMult too,
  // ahead of the checkpoint multiplier, since stacking miniBossDmgMult on the already-huge boss base
  // made floors 80/90 hit even harder than the boss.
  const mult = isDungeonBoss(stage)
    ? T.battle.bossDmgMult * bossFloorMult(stage).dmg
    : def.boss
      ? T.battle.bossDmgMult
      : isDungeonCheckpoint(stage) ? T.battle.miniBossDmgMult : 1;
  return Math.round(base * mult);
}

// `bossLootMult`: Sorte Grande's multiplier on the boss unique / relic chances (CombatStats.bossLootMult); 1 for every other hero.
export function waveRewards(biome: DungeonBiomeDef, stage: number, bossLootMult = 1): WaveRewards {
  const baseGold = randInt(biome.goldMin, biome.goldMax);
  let gold = Math.round(baseGold * (1 + T.battle.goldRewardGrowth * (stage - 1)));
  const drops: Partial<Record<MaterialId, number>> = {};
  for (const entry of biome.drops) {
    if (entry.chance < 1 && Math.random() >= entry.chance) continue;
    const qty = Math.max(1, Math.round(entry.qty * (1 + T.battle.goldRewardGrowth * (stage - 1))));
    drops[entry.material] = (drops[entry.material] ?? 0) + qty;
  }
  let shards = 0;
  let gems: Partial<Record<GemId, number>> = {};
  let uniques: UniqueDrop[] = [];
  let relics: string[] = [];
  if (isDungeonBoss(stage)) {
    // A depth boss rolls the pieces of one of the four biome bosses (in turn), with a chance that rises slowly with the depth and is capped (uniques.ts); its Runes are its own.
    uniques = isDepthStage(stage) ? rollDepthBossUniques(depthOfStage(stage), Math.random, bossLootMult) : rollBossUniques(stage, Math.random, bossLootMult);
    relics = isDepthStage(stage) ? rollDepthBossRelics(depthOfStage(stage), Math.random, bossLootMult) : rollBossRelics(stage, Math.random, bossLootMult);
    shards = isDepthStage(stage) ? T.depths.bossShards : T.battle.bossShards;
    gold = Math.round(gold * T.battle.bossGoldMult);
    // Gate-boss-exclusive: a guaranteed gem every clear, on top of the gold/shard boost — a common
    // wave never grants gems, so this is a clear, repeatable "boss loot is visibly better" signal.
    const gem = GEMS[randInt(0, GEMS.length - 1)].id;
    gems = { [gem]: 1 };
  } else if (isDungeonCheckpoint(stage)) {
    shards = T.battle.miniBossShards;
    gold = Math.round(gold * T.battle.miniBossGoldMult);
  }
  return { gold, drops, shards, gems, uniques, relics };
}
