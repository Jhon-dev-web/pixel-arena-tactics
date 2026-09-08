import T from './tunables';
import { EnemyDef } from './enemies';
import { MaterialId } from './materials';
import { DungeonBiomeDef, isDungeonBoss, isDungeonCheckpoint } from './dungeon';

export interface WaveRewards {
  gold: number;
  drops: Partial<Record<MaterialId, number>>;
  shards: number;
}

export interface RunRewards {
  gold: number;
  drops: Partial<Record<MaterialId, number>>;
  shards: number;
  stages: number;
}

const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

export { isDungeonBoss, isDungeonCheckpoint };

export function stageEnemyHp(def: EnemyDef, stage: number): number {
  const base = def.hp * (1 + T.battle.hpGrowth * (stage - 1));
  const mult = isDungeonBoss(stage) ? T.battle.bossHpMult : isDungeonCheckpoint(stage) ? T.battle.miniBossHpMult : 1;
  return Math.round(base * mult);
}

export function stageEnemyDmg(def: EnemyDef, stage: number): number {
  const base = def.dmg * (1 + T.battle.dmgGrowth * (stage - 1));
  const mult = isDungeonBoss(stage) ? T.battle.bossDmgMult : isDungeonCheckpoint(stage) ? T.battle.miniBossDmgMult : 1;
  return Math.round(base * mult);
}

export function waveRewards(biome: DungeonBiomeDef, stage: number): WaveRewards {
  const baseGold = randInt(biome.goldMin, biome.goldMax);
  let gold = Math.round(baseGold * (1 + T.battle.rewardGrowth * (stage - 1)));
  const drops: Partial<Record<MaterialId, number>> = {};
  for (const entry of biome.drops) {
    if (entry.chance < 1 && Math.random() >= entry.chance) continue;
    const qty = Math.max(1, Math.round(entry.qty * (1 + T.battle.rewardGrowth * (stage - 1))));
    drops[entry.material] = (drops[entry.material] ?? 0) + qty;
  }
  let shards = 0;
  if (isDungeonBoss(stage)) {
    shards = T.battle.bossShards;
    gold = Math.round(gold * T.battle.bossGoldMult);
  } else if (isDungeonCheckpoint(stage)) {
    shards = T.battle.miniBossShards;
    gold = Math.round(gold * T.battle.miniBossGoldMult);
  }
  return { gold, drops, shards };
}
