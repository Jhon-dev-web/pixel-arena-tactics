import { GemId } from './gems';
import { MaterialId } from './materials';
import { ConsumableId } from './consumables';
import { MAX_BATTLE_PASS_LEVEL, SaveData } from './engine';
import { addForced, addWithOverflow, stockIsEmpty } from './inventory';
import { ownsAdventurerPass } from './entitlements';
import { seasonNumber, SummaryReward } from './seasons';

export type BattlePassRewardKind = 'gold' | 'material' | 'consumable' | 'gem' | 'shards' | 'cosmetic';

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
// Premium track is where the Pass earns its keep: Shards at real milestones (5/15/25),
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

export interface BattlePassClaimResult {
  save: SaveData | null; // null = nothing to claim (locked, already claimed, no Pass for the premium track, unknown level)
  blocked?: boolean; // the item reward did not fit the inventory: the reward stays claimable, nothing was paid
}

// Pay one reward. Gold / shards / gems / cosmetics always go in; a material or consumable goes into the inventory. `forced` (season settlement) puts it in
// even when the bag is full (the bag may go over its capacity, which the game supports); otherwise it is a deliberate action that is refused when the
// item would take more slots than the bag has (blocked = true, nothing changed).
function payReward(s: SaveData, reward: BattlePassReward, forced: boolean, now: number): { save: SaveData; blocked?: boolean } {
  switch (reward.kind) {
    case 'gold':
      return { save: { ...s, gold: s.gold + reward.amount } };
    case 'shards':
      return { save: { ...s, shards: s.shards + reward.amount } };
    case 'material':
    case 'consumable': {
      if (!reward.id) return { save: s };
      const add = reward.kind === 'material' ? { materials: { [reward.id]: reward.amount } } : { consumables: { [reward.id]: reward.amount } };
      if (forced) return { save: addForced(s, add) };
      const placed = addWithOverflow(s, add, { now });
      return stockIsEmpty(placed.leftover) ? { save: placed.save } : { save: s, blocked: true };
    }
    case 'gem':
      return { save: reward.id ? { ...s, gems: { ...s.gems, [reward.id]: (s.gems[reward.id as GemId] ?? 0) + reward.amount } } : s };
    case 'cosmetic':
      return { save: reward.id && !s.cosmetics.includes(reward.id) ? { ...s, cosmetics: [...s.cosmetics, reward.id] } : s };
  }
}

// Claim one level of one track (a deliberate action: an item reward that does not fit the bag is refused and stays claimable).
export function applyBattlePassClaim(s: SaveData, level: number, track: 'free' | 'premium', now: number): BattlePassClaimResult {
  if (level > s.battlePassLevel) return { save: null };
  if (track === 'premium' && !ownsAdventurerPass(s)) return { save: null };
  if (s.claimedPassRewards[track].includes(level)) return { save: null };
  const def = getBattlePassLevelDef(level);
  if (!def) return { save: null };
  const paid = payReward(s, def[track], false, now);
  if (paid.blocked) return { save: null, blocked: true };
  return { save: { ...paid.save, claimedPassRewards: { ...paid.save.claimedPassRewards, [track]: [...paid.save.claimedPassRewards[track], level] } } };
}

// Season rollover. The track runs in seasons shared by every player (seasons.ts); when the clock passes into a later season than the one the save has
// SETTLED (save.passSeason), every reward the hero had earned and not claimed is paid now (free track always, premium track only for an owner, items through
// the forced path so a full bag loses nothing), then level, XP and the claimed lists start over and the summary is kept for the player to read once.
// Idempotent (the settled season is stored) and clock-safe: a clock set back never un-settles or re-runs a season, it simply does nothing. Pure, returns the
// same object when there is nothing to settle.
export function settleSeason(s: SaveData, now: number): SaveData {
  const current = seasonNumber(now);
  if (current <= s.passSeason) return s;
  const owner = ownsAdventurerPass(s);
  let next = s;
  const summary: SummaryReward[] = [];
  for (let level = 1; level <= s.battlePassLevel; level++) {
    const def = getBattlePassLevelDef(level);
    if (!def) continue;
    for (const track of ['free', 'premium'] as const) {
      if (track === 'premium' && !owner) continue;
      if (s.claimedPassRewards[track].includes(level)) continue;
      const reward = def[track];
      next = payReward(next, reward, true, now).save;
      const same = summary.find((w) => w.kind === reward.kind && w.id === reward.id);
      if (same) same.amount += reward.amount;
      else summary.push({ kind: reward.kind, ...(reward.id ? { id: reward.id } : {}), amount: reward.amount });
    }
  }
  return {
    ...next,
    battlePassLevel: 1,
    battlePassXp: 0,
    claimedPassRewards: { free: [], premium: [] },
    passSeason: current,
    pendingSeasonSummary: summary.length > 0 ? { season: s.passSeason, rewards: summary } : s.pendingSeasonSummary,
  };
}
