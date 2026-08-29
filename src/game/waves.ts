import T from './tunables';
import { EnemyDef } from './enemies';
import { MaterialId } from './materials';
import { FloorDef } from './dungeon';

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

export function isMiniBoss(stage: number): boolean {
  return stage % T.battle.miniBossEvery === 0;
}

export function stageEnemyHp(def: EnemyDef, stage: number): number {
  const base = def.hp * (1 + T.battle.hpGrowth * (stage - 1));
  return Math.round(isMiniBoss(stage) ? base * T.battle.miniBossHpMult : base);
}

export function stageEnemyDmg(def: EnemyDef, stage: number): number {
  const base = def.dmg * (1 + T.battle.dmgGrowth * (stage - 1));
  return Math.round(isMiniBoss(stage) ? base * T.battle.miniBossDmgMult : base);
}

export function waveRewards(floor: FloorDef, stage: number): WaveRewards {
  const baseGold = randInt(floor.goldMin, floor.goldMax);
  const gold = Math.round(baseGold * (1 + T.battle.rewardGrowth * (stage - 1)));
  const drops: Partial<Record<MaterialId, number>> = {};
  for (const entry of floor.drops) {
    if (entry.chance < 1 && Math.random() >= entry.chance) continue;
    const qty = Math.max(1, Math.round(entry.qty * (1 + T.battle.rewardGrowth * (stage - 1))));
    drops[entry.material] = (drops[entry.material] ?? 0) + qty;
  }
  let shards = 0;
  if (isMiniBoss(stage)) {
    shards = T.battle.miniBossShards;
    drops.steel = (drops.steel ?? 0) + 1;
  }
  return { gold, drops, shards };
}
