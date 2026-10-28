import type { LifetimeStats } from './stats';
import type { Rarity } from './rarity';
import type { SetFamily } from './gear';
import type { SkillId } from './skills';
import { emptyStreak, freshWeekly } from './weekly';
import type { StreakState, WeeklyState } from './weekly';

export type QuestKind = 'daily' | 'achievement';

// What an achievement measures. Parameterised ones carry `arg` (a zone id, a rarity, a set family or a skill id).
export type QuestMetric =
  | 'daily_kills'
  | 'daily_forge'
  | 'daily_purchases'
  | 'daily_deliveries'
  | 'total_kills'
  | 'zone_kills'
  | 'bosses'
  | 'dungeon_runs'
  | 'cp'
  | 'max_refine'
  | 'max_floor'
  | 'refine_success'
  | 'lapidations'
  | 'forged_total'
  | 'forged_rarity'
  | 'uniques'
  | 'set_complete'
  | 'sets_all'
  | 'skill_level'
  | 'skills_min'
  | 'gold_earned'
  | 'deliveries'
  | 'potions'
  | 'played_hours'
  | 'codex_pct'
  | 'max_depth'
  | 'wholesale_units'
  | 'wholesale_gold';

export type AchievementCategory = 'combat' | 'dungeon' | 'hunting' | 'forging' | 'sets' | 'professions' | 'economy' | 'collection';
export const ACHIEVEMENT_CATEGORIES: AchievementCategory[] = ['combat', 'dungeon', 'hunting', 'forging', 'sets', 'professions', 'economy', 'collection'];

export interface QuestDef {
  // Dailies: 'daily_*'. Achievements: a stable ASCII `ACH_*` id (also the id a Steam achievement of the same name would use), never renamed once shipped.
  id: string;
  kind: QuestKind;
  nameKey: string;
  descKey: string;
  target: number;
  gold: number;
  shards: number;
  metric: QuestMetric;
  arg?: string;
  category?: AchievementCategory;
  titleId?: string; // a title (titles.ts) the achievement unlocks
}

export interface QuestState {
  dailyDay: string;
  daily: { kills: number; forge: number; purchases: number; deliveries: number };
  dailyClaimed: string[];
  // maxRefineEver: highest refine level ever reached — survives salvaging / consuming the piece.
  counters: { kills: number; maxFloorCleared: number; maxRefineEver?: number };
  claimed: string[];
  // Round 13 (weekly.ts): this week's goals (a snapshot of the lifetime counters + what was claimed) and the 7-day login streak.
  weekly: WeeklyState;
  streak: StreakState;
}

// Everything an achievement can read besides the quest state. The statistics, the profession levels and the codex completion are optional so a caller that
// only has the old numbers (the progression simulator) still works: an achievement whose input is missing simply shows no progress.
export interface QuestContext {
  cp: number;
  maxRefine: number;
  stats?: LifetimeStats;
  skillLevels?: Partial<Record<SkillId, number>>;
  codexPct?: number; // 0..100, whole percent of the codex discovered (codex.ts)
}

export const QUESTS_DAILY: QuestDef[] = [
  { id: 'daily_hunter', kind: 'daily', nameKey: 'q_hunter', descKey: 'q_hunter_d', target: 15, gold: 150, shards: 1, metric: 'daily_kills' },
  { id: 'daily_forge', kind: 'daily', nameKey: 'q_forge', descKey: 'q_forge_d', target: 3, gold: 100, shards: 0, metric: 'daily_forge' },
  { id: 'daily_economy', kind: 'daily', nameKey: 'q_economy', descKey: 'q_economy_d', target: 2, gold: 80, shards: 1, metric: 'daily_purchases' },
  { id: 'daily_explorer', kind: 'daily', nameKey: 'q_explorer', descKey: 'q_explorer_d', target: 1, gold: 120, shards: 0, metric: 'daily_deliveries' },
];

// ACH_FOO_BAR -> locale keys a_foo_bar / a_foo_bar_d (quests.* in both languages).
function ach(
  id: string,
  category: AchievementCategory,
  metric: QuestMetric,
  target: number,
  gold: number,
  shards: number,
  extra: { arg?: string; titleId?: string } = {},
): QuestDef {
  const key = `a_${id.slice(4).toLowerCase()}`;
  return { id, kind: 'achievement', nameKey: key, descKey: `${key}_d`, target, gold, shards, metric, category, ...extra };
}

// Rewards are small and one-time (Gold, a few Éter, now and then a title): they are a thank-you, not a progression source. The first six are the original
// achievements (same numbers, their ids upper-cased); the rest are new.
//
// The progression simulator (scripts/sim/driver.ts claimQuests) claims every achievement it can see, and it sees the kills, CP, floor and refine ones (the counters
// of the old save format). Even 20 Gold moves its medians, so the new achievements on those metrics (KILLS_*, CP1000+, FLOOR_*) pay NOTHING (prestige only,
// the highest one with a title). Everything else reads the lifetime statistics, which the simulator does not pass, and pays its small Gold; the ones a
// player reaches in the first week pay no Éter either, because Éter buys extra dungeon sessions. quests.test.ts guards both rules.
export const QUESTS_ACHIEVEMENTS: QuestDef[] = [
  // combat
  ach('ACH_FIRST_BLOOD', 'combat', 'total_kills', 1, 50, 1),
  ach('ACH_KILLS_1K', 'combat', 'total_kills', 1000, 0, 0),
  ach('ACH_KILLS_10K', 'combat', 'total_kills', 10000, 0, 0),
  ach('ACH_KILLS_100K', 'combat', 'total_kills', 100000, 0, 0, { titleId: 'title_slayer' }),
  ach('ACH_CP150', 'combat', 'cp', 150, 300, 3),
  ach('ACH_CP500', 'combat', 'cp', 500, 1000, 10),
  ach('ACH_CP1000', 'combat', 'cp', 1000, 0, 0),
  ach('ACH_CP2500', 'combat', 'cp', 2500, 0, 0),
  ach('ACH_CP5000', 'combat', 'cp', 5000, 0, 0),
  ach('ACH_BOSS_10', 'combat', 'bosses', 10, 400, 2),
  ach('ACH_BOSS_50', 'combat', 'bosses', 50, 1500, 4, { titleId: 'title_boss_hunter' }),
  // dungeon
  ach('ACH_FLOOR_10', 'dungeon', 'max_floor', 10, 0, 0),
  ach('ACH_FLOOR_25', 'dungeon', 'max_floor', 25, 0, 0),
  ach('ACH_FLOOR_50', 'dungeon', 'max_floor', 50, 0, 0),
  ach('ACH_CRYPT', 'dungeon', 'max_floor', 51, 500, 4),
  ach('ACH_FLOOR_75', 'dungeon', 'max_floor', 75, 0, 0),
  ach('ACH_MINOTAUR', 'dungeon', 'max_floor', 100, 2000, 15),
  // Profundezas (depths.ts): they read the lifetime statistics, which the progression simulator does not pass, and the simulator never gets past floor 100 anyway, so they can pay.
  ach('ACH_DEPTH_1', 'dungeon', 'max_depth', 1, 300, 1),
  ach('ACH_DEPTH_10', 'dungeon', 'max_depth', 10, 800, 3),
  ach('ACH_DEPTH_25', 'dungeon', 'max_depth', 25, 1500, 5),
  ach('ACH_DEPTH_50', 'dungeon', 'max_depth', 50, 2500, 8, { titleId: 'title_depths_walker' }),
  ach('ACH_DEPTH_100', 'dungeon', 'max_depth', 100, 3000, 10),
  ach('ACH_RUNS_10', 'dungeon', 'dungeon_runs', 10, 150, 0),
  ach('ACH_RUNS_100', 'dungeon', 'dungeon_runs', 100, 800, 0),
  // hunting zones
  ach('ACH_HUNT_GLADE', 'hunting', 'zone_kills', 500, 150, 0, { arg: 'demon_glade' }),
  ach('ACH_HUNT_MARSH', 'hunting', 'zone_kills', 1000, 300, 0, { arg: 'blood_marsh' }),
  ach('ACH_HUNT_RIFT', 'hunting', 'zone_kills', 1500, 500, 0, { arg: 'demon_rift' }),
  ach('ACH_HUNT_ABYSS', 'hunting', 'zone_kills', 2000, 800, 2, { arg: 'blood_abyss' }),
  // forging
  ach('ACH_FORGE_1', 'forging', 'forged_total', 1, 50, 0),
  ach('ACH_FORGE_25', 'forging', 'forged_total', 25, 200, 0),
  ach('ACH_FORGE_100', 'forging', 'forged_total', 100, 600, 2),
  ach('ACH_FORGE_EPIC', 'forging', 'forged_rarity', 1, 300, 2, { arg: 'epic' }),
  ach('ACH_FORGE_LEGENDARY', 'forging', 'forged_rarity', 1, 1000, 5, { arg: 'legendary', titleId: 'title_grand_smith' }),
  ach('ACH_BLACKSMITH', 'forging', 'max_refine', 8, 800, 5),
  ach('ACH_REFINE_25', 'forging', 'refine_success', 25, 300, 0),
  ach('ACH_REFINE_100', 'forging', 'refine_success', 100, 1000, 3),
  // Round 16 (docs/BALANCE_CHANGES.md): the refinement past +8 reads max_refine, which the progression simulator sees, so these three pay nothing; Lapidar reads the lifetime statistics.
  ach('ACH_REFINE_9', 'forging', 'max_refine', 9, 0, 0),
  ach('ACH_REFINE_10', 'forging', 'max_refine', 10, 0, 0),
  ach('ACH_REFINE_12', 'forging', 'max_refine', 12, 0, 0),
  ach('ACH_LAPIDAR_1', 'forging', 'lapidations', 1, 300, 1),
  ach('ACH_LAPIDAR_25', 'forging', 'lapidations', 25, 1500, 4),
  ach('ACH_UNIQUE_1', 'forging', 'uniques', 1, 500, 3),
  ach('ACH_UNIQUE_10', 'forging', 'uniques', 10, 3000, 10, { titleId: 'title_treasure_seeker' }),
  // full sets worn (setBonuses.ts families)
  ach('ACH_SET_BRONZE', 'sets', 'set_complete', 1, 100, 0, { arg: 'bronze' }),
  ach('ACH_SET_IRON', 'sets', 'set_complete', 1, 200, 0, { arg: 'iron' }),
  ach('ACH_SET_STEEL', 'sets', 'set_complete', 1, 300, 0, { arg: 'steel' }),
  ach('ACH_SET_GILDED', 'sets', 'set_complete', 1, 500, 2, { arg: 'gilded' }),
  ach('ACH_SET_DRAGON', 'sets', 'set_complete', 1, 500, 2, { arg: 'dragon' }),
  ach('ACH_SET_VOIDSTEEL', 'sets', 'set_complete', 1, 800, 3, { arg: 'voidsteel' }),
  ach('ACH_SET_ABYSSAL', 'sets', 'set_complete', 1, 1200, 4, { arg: 'abyssal' }),
  // the leather families (classes reform, phase 2a): the reward of the plate family of the same tier, no new number
  ach('ACH_SET_HIDE', 'sets', 'set_complete', 1, 100, 0, { arg: 'hide' }),
  ach('ACH_SET_SCOUT', 'sets', 'set_complete', 1, 200, 0, { arg: 'scout' }),
  ach('ACH_SET_RANGER', 'sets', 'set_complete', 1, 300, 0, { arg: 'ranger' }),
  ach('ACH_SET_HUNTER', 'sets', 'set_complete', 1, 500, 2, { arg: 'hunter' }),
  ach('ACH_SET_NIGHTSTALKER', 'sets', 'set_complete', 1, 800, 3, { arg: 'nightstalker' }),
  ach('ACH_SET_ABYSSALHIDE', 'sets', 'set_complete', 1, 1200, 4, { arg: 'abyssalhide' }),
  // the cloth families (classes reform, phase 2b): the reward of the plate family of the same tier, no new number
  ach('ACH_SET_LINEN', 'sets', 'set_complete', 1, 100, 0, { arg: 'linen' }),
  ach('ACH_SET_HOMESPUN', 'sets', 'set_complete', 1, 200, 0, { arg: 'homespun' }),
  ach('ACH_SET_SILK', 'sets', 'set_complete', 1, 300, 0, { arg: 'silk' }),
  ach('ACH_SET_ARCANE', 'sets', 'set_complete', 1, 500, 2, { arg: 'arcane' }),
  ach('ACH_SET_LUNAR', 'sets', 'set_complete', 1, 800, 3, { arg: 'lunar' }),
  ach('ACH_SET_VOIDWEAVE', 'sets', 'set_complete', 1, 1200, 4, { arg: 'voidweave' }),
  ach('ACH_SET_ALL', 'sets', 'sets_all', 7, 3000, 10, { titleId: 'title_set_collector' }),
  // professions (level 75 is the cap)
  ach('ACH_MINING_25', 'professions', 'skill_level', 25, 200, 0, { arg: 'mining' }),
  ach('ACH_MINING_50', 'professions', 'skill_level', 50, 500, 1, { arg: 'mining' }),
  ach('ACH_MINING_75', 'professions', 'skill_level', 75, 1500, 3, { arg: 'mining' }),
  ach('ACH_WOOD_25', 'professions', 'skill_level', 25, 200, 0, { arg: 'woodcutting' }),
  ach('ACH_WOOD_50', 'professions', 'skill_level', 50, 500, 1, { arg: 'woodcutting' }),
  ach('ACH_WOOD_75', 'professions', 'skill_level', 75, 1500, 3, { arg: 'woodcutting' }),
  ach('ACH_GARDEN_25', 'professions', 'skill_level', 25, 200, 0, { arg: 'gardening' }),
  ach('ACH_GARDEN_50', 'professions', 'skill_level', 50, 500, 1, { arg: 'gardening' }),
  ach('ACH_GARDEN_75', 'professions', 'skill_level', 75, 1500, 3, { arg: 'gardening' }),
  ach('ACH_ARTISAN', 'professions', 'skills_min', 75, 2000, 5, { titleId: 'title_artisan' }),
  // economy
  ach('ACH_GOLD_10K', 'economy', 'gold_earned', 10000, 100, 0),
  ach('ACH_GOLD_100K', 'economy', 'gold_earned', 100000, 500, 0),
  ach('ACH_GOLD_1M', 'economy', 'gold_earned', 1000000, 3000, 5, { titleId: 'title_tycoon' }),
  ach('ACH_DELIVERY_10', 'economy', 'deliveries', 10, 200, 0),
  ach('ACH_DELIVERY_50', 'economy', 'deliveries', 50, 800, 2),
  ach('ACH_POTIONS_25', 'economy', 'potions', 25, 150, 0),
  // Round 18 (wholesale.ts): they read the lifetime statistics (the progression simulator does not pass them, and the merchant opens at floor 75, after day 21), so they can pay.
  ach('ACH_WHOLESALE_1K', 'economy', 'wholesale_units', 1000, 150, 0),
  ach('ACH_WHOLESALE_25K', 'economy', 'wholesale_gold', 25000, 600, 1),
  ach('ACH_PLAYED_10H', 'economy', 'played_hours', 10, 100, 0),
  ach('ACH_PLAYED_100H', 'economy', 'played_hours', 100, 1000, 3),
  // collection (the codex, codex.ts)
  ach('ACH_CODEX_25', 'collection', 'codex_pct', 25, 200, 0),
  ach('ACH_CODEX_50', 'collection', 'codex_pct', 50, 500, 1),
  ach('ACH_CODEX_75', 'collection', 'codex_pct', 75, 1000, 3),
  ach('ACH_CODEX_100', 'collection', 'codex_pct', 100, 3000, 10, { titleId: 'title_codex_sage' }),
];

// The achievements of the first save format used lower-case ids (ach_first_blood); they are the ACH_* ones now.
export function migrateAchievementId(id: string): string {
  return /^ach_[a-z0-9_]+$/.test(id) ? id.toUpperCase() : id;
}

export function emptyQuestState(now: number = Date.now()): QuestState {
  return {
    dailyDay: '',
    daily: { kills: 0, forge: 0, purchases: 0, deliveries: 0 },
    dailyClaimed: [],
    counters: { kills: 0, maxFloorCleared: 0, maxRefineEver: 0 },
    claimed: [],
    weekly: freshWeekly(undefined, now),
    streak: emptyStreak(),
  };
}

export function questProgress(def: QuestDef, quests: QuestState, ctx: QuestContext): number {
  const st = ctx.stats;
  switch (def.metric) {
    case 'daily_kills':
      return quests.daily.kills ?? 0;
    case 'daily_forge':
      return quests.daily.forge ?? 0;
    case 'daily_purchases':
      return quests.daily.purchases ?? 0;
    case 'daily_deliveries':
      return quests.daily.deliveries ?? 0;
    case 'total_kills':
      return Math.max(quests.counters.kills ?? 0, st?.kills ?? 0);
    case 'zone_kills':
      return st && def.arg ? st.killsByZone[def.arg] ?? 0 : 0;
    case 'bosses':
      return st?.bossesKilled ?? 0;
    case 'dungeon_runs':
      return st?.dungeonRuns ?? 0;
    case 'cp':
      return ctx.cp;
    case 'max_refine':
      return ctx.maxRefine;
    case 'max_floor':
      return quests.counters.maxFloorCleared ?? 0;
    case 'refine_success':
      return st?.refineSuccess ?? 0;
    case 'lapidations':
      return st?.lapidations ?? 0;
    case 'forged_total':
      return st?.itemsForged ?? 0;
    case 'forged_rarity':
      return st && def.arg ? st.forgedByRarity[def.arg as Rarity] ?? 0 : 0;
    case 'uniques':
      return st?.uniquesFound ?? 0;
    case 'set_complete':
      return st && def.arg && st.completedSets.includes(def.arg as SetFamily) ? 1 : 0;
    case 'sets_all':
      return st?.completedSets.length ?? 0;
    case 'skill_level':
      return def.arg ? ctx.skillLevels?.[def.arg as SkillId] ?? 0 : 0;
    case 'skills_min': {
      const levels = ctx.skillLevels;
      return levels ? Math.min(levels.mining ?? 0, levels.woodcutting ?? 0, levels.gardening ?? 0) : 0;
    }
    case 'gold_earned':
      return st?.goldEarned ?? 0;
    case 'deliveries':
      return st?.deliveries ?? 0;
    case 'potions':
      return st?.potionsBrewed ?? 0;
    case 'played_hours':
      return st ? Math.floor(st.secondsPlayed / 3600) : 0;
    case 'codex_pct':
      return ctx.codexPct ?? 0;
    case 'max_depth':
      return st?.deepestDepth ?? 0;
    case 'wholesale_units':
      return st?.wholesaleUnits ?? 0;
    case 'wholesale_gold':
      return st?.wholesaleGold ?? 0;
    default:
      return 0;
  }
}

export function isClaimed(def: QuestDef, quests: QuestState): boolean {
  return def.kind === 'daily' ? quests.dailyClaimed.includes(def.id) : quests.claimed.includes(def.id);
}

export function isComplete(def: QuestDef, quests: QuestState, ctx: QuestContext): boolean {
  return questProgress(def, quests, ctx) >= def.target;
}

export function claimableCount(quests: QuestState, ctx: QuestContext): number {
  const all = [...QUESTS_DAILY, ...QUESTS_ACHIEVEMENTS];
  return all.filter((q) => isComplete(q, quests, ctx) && !isClaimed(q, quests)).length;
}

// "Resgatados / total" of the achievements, for the header of the screen.
export function achievementSummary(quests: QuestState): { done: number; total: number } {
  return { done: QUESTS_ACHIEVEMENTS.filter((q) => quests.claimed.includes(q.id)).length, total: QUESTS_ACHIEVEMENTS.length };
}
