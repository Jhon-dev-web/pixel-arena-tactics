import { GemId } from './gems';
import { MaterialId } from './materials';
import { ConsumableId } from './consumables';
import { MAX_BATTLE_PASS_LEVEL } from './engine';

export type BattlePassRewardKind = 'gold' | 'material' | 'consumable' | 'gem' | 'shards' | 'oneToken' | 'cosmetic';

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

const gold = (amount: number): BattlePassReward => ({ kind: 'gold', amount });
const material = (id: MaterialId, amount: number): BattlePassReward => ({ kind: 'material', id, amount });
const consumable = (id: ConsumableId, amount: number): BattlePassReward => ({ kind: 'consumable', id, amount });
const gem = (id: GemId, amount: number): BattlePassReward => ({ kind: 'gem', id, amount });
const shards = (amount: number): BattlePassReward => ({ kind: 'shards', amount });
const cosmetic = (id: string): BattlePassReward => ({ kind: 'cosmetic', id, amount: 1 });

// Reward design (economy discipline): the Free track is a steady drip of moderate gold, healing
// consumables, basic Shop-tier materials and the odd Expedition ticket — never enough to matter
// as a wealth source, matching Hunting/Mining's role as material faucets, not gold faucets. The
// Premium track is where the Pass earns its keep: Shards/tokens at real milestones (5/15/25),
// Expedition time-skip tickets, refine catalysts and lapidated gems, closing on an exclusive,
// non-farmable Season cosmetic at 30 — the deflationary status reward the whole track builds to.
// Every level is hand-authored on purpose: a modulo pattern reads as "the same three prizes on
// repeat" by level 20, which is exactly the monotony this track exists to avoid.
const FREE_TRACK: BattlePassReward[] = [
  gold(100),
  material('copper', 5),
  consumable('small_hp', 2),
  gold(150),
  consumable('large_hp', 1),
  material('leather', 4),
  gold(200),
  material('iron', 5),
  consumable('small_hp', 3),
  consumable('expedition_ticket_1h', 1),
  gold(250),
  consumable('large_hp', 2),
  material('leather', 5),
  gold(300),
  consumable('atk_elixir', 1),
  material('steel', 3),
  gold(350),
  consumable('small_hp', 4),
  material('essence', 2),
  consumable('expedition_ticket_1h', 1),
  gold(450),
  consumable('large_hp', 3),
  material('dragon_scales', 2),
  gold(500),
  consumable('atk_elixir', 2),
  material('obsidian', 2),
  gold(600),
  consumable('large_hp', 4),
  material('gold_ore', 3),
  gold(3000), // Baú do Aventureiro
];

const PREMIUM_TRACK: BattlePassReward[] = [
  material('silver', 3),
  gem('ruby', 1),
  consumable('refine_catalyst', 1),
  material('gold_ore', 3),
  shards(5),
  gem('sapphire', 1),
  consumable('expedition_ticket_2h', 1),
  material('obsidian', 2),
  gem('emerald', 1),
  consumable('refine_catalyst', 1),
  shards(6),
  material('dragon_scales', 2),
  consumable('expedition_ticket_2h', 1),
  gem('ruby', 2),
  shards(8),
  consumable('refine_catalyst', 2),
  material('obsidian', 3),
  gem('sapphire', 2),
  consumable('expedition_ticket_4h', 1),
  gem('emerald', 2),
  shards(10),
  consumable('refine_catalyst', 2),
  material('dragon_scales', 3),
  gem('ruby', 3),
  shards(12),
  consumable('expedition_ticket_4h', 2),
  gem('sapphire', 3),
  consumable('refine_catalyst', 3),
  shards(15),
  cosmetic('title_season_lv30'), // exclusive Season cosmetic — deflationary, reward-only
];

export const BATTLE_PASS_TRACK: BattlePassLevelDef[] = Array.from({ length: MAX_BATTLE_PASS_LEVEL }, (_, i) => ({
  level: i + 1,
  free: FREE_TRACK[i],
  premium: PREMIUM_TRACK[i],
}));

export function getBattlePassLevelDef(level: number): BattlePassLevelDef | undefined {
  return BATTLE_PASS_TRACK.find((l) => l.level === level);
}
