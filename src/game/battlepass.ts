import { GemId } from './gems';
import { MaterialId } from './materials';
import { ConsumableId } from './consumables';
import { MAX_BATTLE_PASS_LEVEL } from './engine';

export type BattlePassRewardKind = 'gold' | 'material' | 'consumable' | 'gem' | 'oneToken' | 'cosmetic';

export interface BattlePassReward {
  kind: BattlePassRewardKind;
  id?: MaterialId | ConsumableId | GemId | string;
  amount: number;
}

export interface BattlePassLevelDef {
  level: number;
  free: BattlePassReward;
  premium: BattlePassReward;
}

const freeMaterialFor = (level: number): MaterialId => (level >= 15 ? 'iron' : 'copper');
const premiumMaterialFor = (level: number): MaterialId => (level >= 20 ? 'obsidian' : level >= 10 ? 'gold_ore' : 'silver');
const premiumGemFor = (level: number): GemId => (['ruby', 'sapphire', 'emerald'] as const)[(level / 3 - 1) % 3];

function freeRewardFor(level: number): BattlePassReward {
  if (level % 10 === 0) return { kind: 'consumable', id: 'large_hp', amount: 2 };
  if (level % 5 === 0) return { kind: 'material', id: freeMaterialFor(level), amount: 4 };
  if (level % 2 === 0) return { kind: 'consumable', id: 'small_hp', amount: 3 };
  return { kind: 'gold', amount: 40 + level * 8 };
}

function premiumRewardFor(level: number): BattlePassReward {
  if (level % 10 === 0) return { kind: 'cosmetic', id: `title_season_lv${level}`, amount: 1 };
  if (level % 5 === 0) return { kind: 'oneToken', amount: 4 + Math.floor(level / 5) };
  if (level % 3 === 0) return { kind: 'gem', id: premiumGemFor(level), amount: 1 };
  return { kind: 'material', id: premiumMaterialFor(level), amount: 2 };
}

export const BATTLE_PASS_TRACK: BattlePassLevelDef[] = Array.from({ length: MAX_BATTLE_PASS_LEVEL }, (_, i) => {
  const level = i + 1;
  return { level, free: freeRewardFor(level), premium: premiumRewardFor(level) };
});

export function getBattlePassLevelDef(level: number): BattlePassLevelDef | undefined {
  return BATTLE_PASS_TRACK.find((l) => l.level === level);
}
