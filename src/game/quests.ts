export type QuestKind = 'daily' | 'achievement';

export type QuestMetric =
  | 'daily_kills'
  | 'daily_forge'
  | 'daily_purchases'
  | 'daily_expeditions'
  | 'total_kills'
  | 'cp'
  | 'max_refine'
  | 'max_floor';

export interface QuestDef {
  id: string;
  kind: QuestKind;
  nameKey: string;
  descKey: string;
  target: number;
  gold: number;
  shards: number;
  metric: QuestMetric;
}

export interface QuestState {
  dailyDay: string;
  daily: { kills: number; forge: number; purchases: number; expeditions: number };
  dailyClaimed: string[];
  counters: { kills: number; maxFloorCleared: number };
  claimed: string[];
}

export interface QuestContext {
  cp: number;
  maxRefine: number;
}

export const QUESTS_DAILY: QuestDef[] = [
  { id: 'daily_hunter', kind: 'daily', nameKey: 'q_hunter', descKey: 'q_hunter_d', target: 15, gold: 150, shards: 1, metric: 'daily_kills' },
  { id: 'daily_forge', kind: 'daily', nameKey: 'q_forge', descKey: 'q_forge_d', target: 3, gold: 100, shards: 0, metric: 'daily_forge' },
  { id: 'daily_economy', kind: 'daily', nameKey: 'q_economy', descKey: 'q_economy_d', target: 2, gold: 80, shards: 1, metric: 'daily_purchases' },
  { id: 'daily_explorer', kind: 'daily', nameKey: 'q_explorer', descKey: 'q_explorer_d', target: 1, gold: 120, shards: 0, metric: 'daily_expeditions' },
];

export const QUESTS_ACHIEVEMENTS: QuestDef[] = [
  { id: 'ach_first_blood', kind: 'achievement', nameKey: 'a_first_blood', descKey: 'a_first_blood_d', target: 1, gold: 50, shards: 1, metric: 'total_kills' },
  { id: 'ach_cp150', kind: 'achievement', nameKey: 'a_cp150', descKey: 'a_cp150_d', target: 150, gold: 300, shards: 3, metric: 'cp' },
  { id: 'ach_cp500', kind: 'achievement', nameKey: 'a_cp500', descKey: 'a_cp500_d', target: 500, gold: 1000, shards: 10, metric: 'cp' },
  { id: 'ach_blacksmith', kind: 'achievement', nameKey: 'a_blacksmith', descKey: 'a_blacksmith_d', target: 8, gold: 800, shards: 5, metric: 'max_refine' },
  { id: 'ach_crypt', kind: 'achievement', nameKey: 'a_crypt', descKey: 'a_crypt_d', target: 3, gold: 500, shards: 4, metric: 'max_floor' },
  { id: 'ach_minotaur', kind: 'achievement', nameKey: 'a_minotaur', descKey: 'a_minotaur_d', target: 4, gold: 2000, shards: 15, metric: 'max_floor' },
];

export function emptyQuestState(): QuestState {
  return {
    dailyDay: '',
    daily: { kills: 0, forge: 0, purchases: 0, expeditions: 0 },
    dailyClaimed: [],
    counters: { kills: 0, maxFloorCleared: 0 },
    claimed: [],
  };
}

export function questProgress(def: QuestDef, quests: QuestState, ctx: QuestContext): number {
  switch (def.metric) {
    case 'daily_kills':
      return quests.daily.kills ?? 0;
    case 'daily_forge':
      return quests.daily.forge ?? 0;
    case 'daily_purchases':
      return quests.daily.purchases ?? 0;
    case 'daily_expeditions':
      return quests.daily.expeditions ?? 0;
    case 'total_kills':
      return quests.counters.kills ?? 0;
    case 'cp':
      return ctx.cp;
    case 'max_refine':
      return ctx.maxRefine;
    case 'max_floor':
      return quests.counters.maxFloorCleared ?? 0;
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
