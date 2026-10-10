import { GemId } from './gems';
import { MaterialId } from './materials';
import { ConsumableId } from './consumables';
import { MAX_BATTLE_PASS_LEVEL, SaveData } from './engine';
import { addForced, addWithOverflow, stockIsEmpty } from './inventory';
import { ownsAdventurerPass } from './entitlements';
import { seasonNumber, SummaryReward } from './seasons';

export type BattlePassRewardKind = 'gold' | 'material' | 'consumable' | 'gem' | 'shards' | 'cosmetic' | 'relic';

export interface BattlePassReward {
  kind: BattlePassRewardKind;
  id?: MaterialId | ConsumableId | GemId | string;
  amount: number;
  // Granted together with this reward, the same way (the level-30 Season Relic comes with its exclusive title).
  also?: BattlePassReward[];
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
// consumables, basic Shop-tier materials and the odd express ticket — never enough to matter
// as a wealth source, matching Hunting/Mining's role as material faucets, not gold faucets.
// Every level is hand-authored on purpose: a modulo pattern reads as "the same three prizes on
// repeat" by level 20, which is exactly the monotony the tracks exist to avoid.
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

// The Premium track is where the Pass earns its keep, and it is built around things that exist ONLY here (the owner of the Pass is not paying for power, the
// market sells power): the Season Relic at 30 (a "progress faster" sidegrade, gear.ts season_emblem) with the exclusive title, the Blacksmith's Seal at 10 / 20 / 27
// (a forge roll conditioned on Epic or better), the Stash Deed at 8 / 18 (+5 stash slots each, for good) and the gold portrait frame at 15. The levels in between
// are a generous, varied mix of what already exists - Shards (56 in all, as before), lapidated gems, refine catalysts, express tickets, Garden tonics, fertilizer,
// whetstone oil, T3-T5 ingots and gold - and NEVER hunting materials (they would bypass the emission audit) or gear instances. Every level is hand-authored.
const PREMIUM_TRACK: BattlePassReward[] = [
  material('silver_ingot', 3),
  consumable('fortune_tonic', 2),
  consumable('fertilizer', 5),
  gold(1500),
  shards(5),
  consumable('expedition_ticket_2h', 1),
  gem('ruby', 1),
  consumable('stash_deed', 1), // 8
  consumable('whetstone_oil', 3),
  consumable('forge_seal', 1), // 10
  shards(6),
  consumable('stoneskin_tonic', 2),
  material('gold_bar', 3),
  gem('sapphire', 1),
  cosmetic('frame_season_gold'), // 15
  shards(8),
  consumable('precision_elixir', 2),
  consumable('stash_deed', 1), // 18
  consumable('refine_catalyst', 3),
  consumable('forge_seal', 1), // 20
  shards(10),
  consumable('haste_tonic', 2),
  gem('emerald', 2),
  material('refined_obsidian', 2),
  shards(12),
  consumable('expedition_ticket_4h', 2),
  consumable('forge_seal', 1), // 27
  gold(5000),
  shards(15),
  { kind: 'relic', id: 'season_emblem', amount: 1, also: [cosmetic('title_season_lv30')] }, // 30: the Season Relic and the exclusive title
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
    case 'relic': {
      // A relic is stackable gear in the bag (a second season's copy only stacks).
      if (!reward.id) return { save: s };
      const add = { gear: { [reward.id]: reward.amount } };
      if (forced) return { save: addForced(s, add) };
      const placed = addWithOverflow(s, add, { now });
      return stockIsEmpty(placed.leftover) ? { save: placed.save } : { save: s, blocked: true };
    }
  }
}

// A reward and everything granted with it. Blocked if any part of it is.
function payWithExtras(s: SaveData, reward: BattlePassReward, forced: boolean, now: number): { save: SaveData; blocked?: boolean } {
  let paid = payReward(s, reward, forced, now);
  if (paid.blocked) return paid;
  for (const extra of reward.also ?? []) {
    paid = payReward(paid.save, extra, forced, now);
    if (paid.blocked) return { save: s, blocked: true };
  }
  return paid;
}

// Claim one level of one track (a deliberate action: an item reward that does not fit the bag is refused and stays claimable).
export function applyBattlePassClaim(s: SaveData, level: number, track: 'free' | 'premium', now: number): BattlePassClaimResult {
  if (level > s.battlePassLevel) return { save: null };
  if (track === 'premium' && !ownsAdventurerPass(s)) return { save: null };
  if (s.claimedPassRewards[track].includes(level)) return { save: null };
  const def = getBattlePassLevelDef(level);
  if (!def) return { save: null };
  const paid = payWithExtras(s, def[track], false, now);
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
      next = payWithExtras(next, reward, true, now).save;
      for (const r of [reward, ...(reward.also ?? [])]) {
        const same = summary.find((w) => w.kind === r.kind && w.id === r.id);
        if (same) same.amount += r.amount;
        else summary.push({ kind: r.kind, ...(r.id ? { id: r.id } : {}), amount: r.amount });
      }
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
