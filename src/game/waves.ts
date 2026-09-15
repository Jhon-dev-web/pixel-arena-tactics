import T from './tunables';
import { EnemyDef } from './enemies';
import { MaterialId } from './materials';
import { GEMS, GemId } from './gems';
import { DungeonBiomeDef, isDungeonBoss, isDungeonCheckpoint } from './dungeon';

export interface WaveRewards {
  gold: number;
  drops: Partial<Record<MaterialId, number>>;
  shards: number;
  gems: Partial<Record<GemId, number>>;
}

export interface RunRewards {
  gold: number;
  drops: Partial<Record<MaterialId, number>>;
  shards: number;
  gems: Partial<Record<GemId, number>>;
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
  // A biome's regular enemyKind can itself be the shared 'boss' EnemyDef (minotaur_lair reuses it for
  // floors 76-99, not just the Andar 100 milestone) — without the boss damage dampener, those floors'
  // un-milestoned mobs out-damage the actual boss they lead up to. Route them through bossDmgMult too,
  // ahead of the checkpoint multiplier, since stacking miniBossDmgMult on the already-huge boss base
  // made floors 80/90 hit even harder than the boss.
  const mult = isDungeonBoss(stage) || def.boss ? T.battle.bossDmgMult : isDungeonCheckpoint(stage) ? T.battle.miniBossDmgMult : 1;
  return Math.round(base * mult);
}

// Elite re-fight: same base per-stage curve as stageEnemyHp/Dmg, but with the old (pre-rebalance)
// boss multipliers — deliberately not meant to be winnable by a level-appropriate build.
export function eliteBossHp(def: EnemyDef, stage: number): number {
  const base = def.hp * (1 + T.battle.hpGrowth * (stage - 1));
  return Math.round(base * T.battle.eliteHpMult);
}

export function eliteBossDmg(def: EnemyDef, stage: number): number {
  const base = def.dmg * (1 + T.battle.dmgGrowth * (stage - 1));
  return Math.round(base * T.battle.eliteDmgMult);
}

export function waveRewards(biome: DungeonBiomeDef, stage: number): WaveRewards {
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
  if (isDungeonBoss(stage)) {
    shards = T.battle.bossShards;
    gold = Math.round(gold * T.battle.bossGoldMult);
    // Gate-boss-exclusive: a guaranteed gem every clear, on top of the gold/shard boost — a common
    // wave never grants gems, so this is a clear, repeatable "boss loot is visibly better" signal.
    const gem = GEMS[randInt(0, GEMS.length - 1)].id;
    gems = { [gem]: 1 };
  } else if (isDungeonCheckpoint(stage)) {
    shards = T.battle.miniBossShards;
    gold = Math.round(gold * T.battle.miniBossGoldMult);
  }
  return { gold, drops, shards, gems };
}
