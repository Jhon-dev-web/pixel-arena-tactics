import { playerLevel } from './engine';
import type { SaveData } from './engine';
import type { ConsumableId } from './consumables';
import { statsOf } from './stats';
import type { LifetimeStats } from './stats';
import T from './tunables';

// Weekly goals and the login streak (Round 13). Both live in the quests state (quests.ts QuestState.weekly / .streak) and are shown by the quests screen.
//
// Time: the week runs Monday 00:00 UTC to the next Monday 00:00 UTC, and the streak counts UTC calendar days, so the boundary is the same for every player on every
// machine (the daily quests still use the local day: they are an older system and a different promise). Nothing here reads the clock by itself: every function takes `now`.
//
// The goals never add a counter to the hot paths. They are the DIFFERENCE between the lifetime statistics (stats.ts) and a snapshot of them taken when the week began, so
// every way of doing the activity (the screens, "Resgatar tudo", the progression simulator) counts the same, and an old save simply starts its first week at zero.
//
// Rewards are claimed by the player (a button), never granted by a load. The progression simulator never calls the claim functions below, so nothing here can move its
// medians; the sizes are in tunables.ts (weekly / streak) and docs/BALANCE_CHANGES.md.

export const DAY_MS = 24 * 3600 * 1000;
export const WEEK_MS = 7 * DAY_MS;
// 1970-01-05 was a Monday: the week index counts whole weeks from there.
const FIRST_MONDAY_MS = 4 * DAY_MS;

const pad = (n: number): string => String(n).padStart(2, '0');
const dayKey = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

// 'YYYY-MM-DD' of the UTC day `ms` falls on.
export const utcDay = (ms: number): string => dayKey(ms);
export const weekIndex = (ms: number): number => Math.floor((ms - FIRST_MONDAY_MS) / WEEK_MS);
// 'YYYY-MM-DD' of the Monday (UTC) that starts the week `ms` falls in.
export const utcWeek = (ms: number): string => dayKey(FIRST_MONDAY_MS + weekIndex(ms) * WEEK_MS);
// Start (ms) of the week after the one `ms` is in: when the goals reset.
export const nextWeekStart = (ms: number): number => FIRST_MONDAY_MS + (weekIndex(ms) + 1) * WEEK_MS;
// Whole UTC days from `from` ('YYYY-MM-DD') to `to`; NaN when either is not a day key.
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / DAY_MS) : NaN;
}

// ---------------------------------------------------------------------------------------------------------------------------------- weekly goals

export type WeeklyGoalId = 'hunt' | 'deliveries' | 'gather' | 'forge' | 'floors';
export const WEEKLY_GOAL_IDS: WeeklyGoalId[] = ['hunt', 'deliveries', 'gather', 'forge', 'floors'];

// The counters a goal reads (all from the lifetime statistics): hunt time in seconds, orders completed, units that reached the bag (ore + wood + plants), pieces forged, dungeon floors cleared.
export type WeeklyBase = Record<WeeklyGoalId, number>;
export const weeklyCounters = (stats: LifetimeStats): WeeklyBase => ({
  hunt: stats.huntSeconds ?? 0,
  deliveries: stats.deliveries,
  gather: stats.oreGathered + stats.woodGathered + stats.plantsHarvested,
  forge: stats.itemsForged,
  floors: stats.dungeonFloors ?? 0,
});

// The four bands by character level (paragon counts as 100): band 1 is levels 1-24, 2 is 25-49, 3 is 50-99, 4 is level 100 and beyond. The weekly goals take the band
// of the hero when the week begins (WeeklyState.band); the login streak takes the band of the hero on the day it is claimed.
export type WeeklyBand = 1 | 2 | 3 | 4;
export const weeklyBand = (level: number): WeeklyBand => (level >= 100 ? 4 : level >= 50 ? 3 : level >= 25 ? 2 : 1);
const bandOf = (raw: unknown, level: number): WeeklyBand => (raw === 1 || raw === 2 || raw === 3 || raw === 4 ? raw : weeklyBand(level));
// The band tables live in tunables.ts as <name> (band 1) and <name>2..4.
const tv = (name: string, band: WeeklyBand): number => {
  const w = T.weekly as unknown as Record<string, number>;
  return band === 1 ? w[name] : w[`${name}${band}`];
};
// Gold multiplier of a band (1 for band 1): goals, the weekly bonus and the login streak.
export const weeklyGoldMult = (band: WeeklyBand): number => (band === 1 ? 1 : (T.weekly as unknown as Record<string, number>)[`goldMult${band}`]);

export interface WeeklyState {
  week: string; // 'YYYY-MM-DD' of the Monday this state belongs to
  band: WeeklyBand; // the hero's band when the week began: it fixes the targets and the Gold of every goal of the week
  base: WeeklyBase; // the counters when the week began (or when the save first saw it)
  claimed: WeeklyGoalId[];
  bonusClaimed: boolean;
}

export interface WeeklyGoalDef {
  id: WeeklyGoalId;
  nameKey: string; // quests.* locale key
  descKey: string;
  target: number; // in `unit`
  unit: 'hours' | 'count';
  gold: number;
  shards: number;
}

export function weeklyGoalDefs(band: WeeklyBand = 1): Record<WeeklyGoalId, WeeklyGoalDef> {
  const gold = Math.round(T.weekly.goldPerGoal * weeklyGoldMult(band));
  const goal = (id: WeeklyGoalId, target: number, unit: 'hours' | 'count'): WeeklyGoalDef => ({ id, nameKey: `w_${id}`, descKey: `w_${id}_d`, target, unit, gold, shards: 0 });
  return {
    hunt: goal('hunt', tv('huntHours', band), 'hours'),
    deliveries: goal('deliveries', tv('deliveries', band), 'count'),
    gather: goal('gather', tv('gathered', band), 'count'),
    forge: goal('forge', tv('forged', band), 'count'),
    floors: goal('floors', tv('floors', band), 'count'),
  };
}

// The Gold for finishing all four goals of a week of this band (the Éter never scales).
export const weeklyBonusGold = (band: WeeklyBand): number => Math.round(T.weekly.bonusGold * weeklyGoldMult(band));

// The four goals of the week `ms` falls in: the five activities take turns being left out, one per week, so no week repeats the last one's set.
export function activeWeeklyGoals(ms: number, band: WeeklyBand = 1): WeeklyGoalDef[] {
  const defs = weeklyGoalDefs(band);
  const leftOut = ((weekIndex(ms) % WEEKLY_GOAL_IDS.length) + WEEKLY_GOAL_IDS.length) % WEEKLY_GOAL_IDS.length;
  return WEEKLY_GOAL_IDS.filter((_, i) => i !== leftOut).map((id) => defs[id]);
}

export const emptyWeeklyBase = (): WeeklyBase => ({ hunt: 0, deliveries: 0, gather: 0, forge: 0, floors: 0 });

export function freshWeekly(stats: LifetimeStats | undefined, now: number, level = 1): WeeklyState {
  return { week: utcWeek(now), band: weeklyBand(level), base: stats ? weeklyCounters(stats) : emptyWeeklyBase(), claimed: [], bonusClaimed: false };
}

// Whatever the save holds (absent, partial, corrupt) as a trusted state. Does not roll the week: see rollWeekly.
export function sanitizeWeekly(raw: unknown, stats: LifetimeStats | undefined, now: number, level = 1): WeeklyState {
  const r = raw && typeof raw === 'object' ? (raw as Partial<Record<keyof WeeklyState, unknown>>) : null;
  if (!r || typeof r.week !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.week)) return freshWeekly(stats, now, level);
  const base = emptyWeeklyBase();
  const rb = r.base && typeof r.base === 'object' ? (r.base as Record<string, unknown>) : {};
  for (const id of WEEKLY_GOAL_IDS) {
    const n = Math.floor(Number(rb[id]));
    base[id] = Number.isFinite(n) && n > 0 ? n : 0;
  }
  const claimed = Array.isArray(r.claimed) ? WEEKLY_GOAL_IDS.filter((id) => (r.claimed as unknown[]).includes(id)) : [];
  // A week saved before the bands existed has none: it takes the band of the hero as it is now (the first time the save is seen).
  return { week: r.week, band: bandOf(r.band, level), base, claimed, bonusClaimed: r.bonusClaimed === true };
}

// The state for the week `now` is in: the same object when it is already that week, a fresh one (snapshot of the counters, nothing claimed) when a new week has begun.
// A clock set back (a stored week later than now) keeps the stored week rather than handing out a second round.
export function rollWeekly(weekly: WeeklyState, stats: LifetimeStats | undefined, now: number, level = 1): WeeklyState {
  return weekly.week >= utcWeek(now) ? weekly : freshWeekly(stats, now, level);
}

// Returns the save with its weekly state rolled to the week `now` is in (the same object when nothing changed).
export function rollSaveWeekly(save: SaveData, now: number): SaveData {
  const weekly = rollWeekly(save.quests.weekly, statsOf(save), now, playerLevel(save.xp));
  return weekly === save.quests.weekly ? save : { ...save, quests: { ...save.quests, weekly } };
}

export interface WeeklyGoalView {
  def: WeeklyGoalDef;
  progress: number; // in def.unit, clamped to the target
  complete: boolean;
  claimed: boolean;
}

export interface WeeklyView {
  week: string;
  band: WeeklyBand; // the band the goals of this week were fixed in
  bonusGold: number; // the Gold of the weekly bonus in that band
  resetsAt: number;
  goals: WeeklyGoalView[];
  allClaimed: boolean; // the four goals are claimed: the bonus can be taken
  bonusClaimed: boolean;
  claimable: number; // goals ready to claim, plus the bonus when it is ready
}

export function weeklyView(save: Pick<SaveData, 'quests' | 'stats'> & { xp?: number }, now: number): WeeklyView {
  const stats = statsOf(save);
  const weekly = rollWeekly(save.quests.weekly, stats, now, playerLevel(save.xp ?? 0));
  const counters = weeklyCounters(stats);
  const goals = activeWeeklyGoals(now, weekly.band).map((def): WeeklyGoalView => {
    const gained = Math.max(0, counters[def.id] - weekly.base[def.id]);
    const value = def.unit === 'hours' ? gained / 3600 : gained;
    return { def, progress: Math.min(def.target, value), complete: value >= def.target, claimed: weekly.claimed.includes(def.id) };
  });
  const allClaimed = goals.every((g) => g.claimed);
  const claimable = goals.filter((g) => g.complete && !g.claimed).length + (allClaimed && !weekly.bonusClaimed ? 1 : 0);
  return { week: weekly.week, band: weekly.band, bonusGold: weeklyBonusGold(weekly.band), resetsAt: nextWeekStart(now), goals, allClaimed, bonusClaimed: weekly.bonusClaimed, claimable };
}

export interface WeeklyClaim {
  save: SaveData;
  gold: number;
  shards: number;
}

// Claims one goal; null when the id is not one of this week's goals, is not done yet or was already claimed.
export function claimWeeklyGoal(save: SaveData, id: WeeklyGoalId, now: number): WeeklyClaim | null {
  const view = weeklyView(save, now);
  const goal = view.goals.find((g) => g.def.id === id);
  if (!goal || !goal.complete || goal.claimed) return null;
  const weekly = rollWeekly(save.quests.weekly, statsOf(save), now, playerLevel(save.xp));
  const next: WeeklyState = { ...weekly, claimed: [...weekly.claimed, id] };
  return {
    save: { ...save, gold: save.gold + goal.def.gold, shards: save.shards + goal.def.shards, quests: { ...save.quests, weekly: next } },
    gold: goal.def.gold,
    shards: goal.def.shards,
  };
}

// The bonus for finishing (and claiming) all four goals of the week.
export function claimWeeklyBonus(save: SaveData, now: number): WeeklyClaim | null {
  const view = weeklyView(save, now);
  if (!view.allClaimed || view.bonusClaimed) return null;
  const weekly = rollWeekly(save.quests.weekly, statsOf(save), now, playerLevel(save.xp));
  const gold = view.bonusGold;
  const shards = T.weekly.bonusShards;
  return {
    save: { ...save, gold: save.gold + gold, shards: save.shards + shards, quests: { ...save.quests, weekly: { ...weekly, bonusClaimed: true } } },
    gold,
    shards,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------- login streak

export const STREAK_DAYS = 7;

export interface StreakState {
  last: string; // the UTC day of the last claim ('' = never)
  count: number; // the streak day that claim was (1..7)
  saverWeek: string; // the week (utcWeek) the Pass owner's streak saver was last used in ('' = never)
}

export const emptyStreak = (): StreakState => ({ last: '', count: 0, saverWeek: '' });

export function sanitizeStreak(raw: unknown): StreakState {
  const r = raw && typeof raw === 'object' ? (raw as Partial<Record<keyof StreakState, unknown>>) : {};
  const day = (v: unknown): string => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
  const count = Math.floor(Number(r.count));
  const last = day(r.last);
  return { last, count: last && Number.isFinite(count) ? Math.max(1, Math.min(STREAK_DAYS, count)) : 0, saverWeek: day(r.saverWeek) };
}

export interface StreakReward {
  gold: number;
  shards: number;
  item?: { id: ConsumableId; n: number };
}

// Escalating small rewards, one per streak day; tunables.ts streak.* holds the Gold and Éter, the consumables are the Round 12 recipes (a streak is one more way to get one).
export function streakReward(day: number, band: WeeklyBand = 1): StreakReward {
  const raw = streakRewardBase(day);
  const mult = weeklyGoldMult(band);
  return mult === 1 || raw.gold === 0 ? raw : { ...raw, gold: Math.round(raw.gold * mult) };
}

function streakRewardBase(day: number): StreakReward {
  const s = T.streak;
  switch (Math.max(1, Math.min(STREAK_DAYS, Math.floor(day)))) {
    case 1:
      return { gold: s.gold1, shards: 0 };
    case 2:
      return { gold: s.gold2, shards: 0 };
    case 3:
      return { gold: 0, shards: 0, item: { id: 'hunter_lure', n: 1 } };
    case 4:
      return { gold: s.gold4, shards: 0 };
    case 5:
      return { gold: 0, shards: 0, item: { id: 'repair_kit', n: 1 } };
    case 6:
      return { gold: s.gold6, shards: 0 };
    default:
      return { gold: s.gold7, shards: s.shards7, item: { id: 'armor_polish', n: 1 } };
  }
}

export interface StreakStatus {
  today: string;
  claimedToday: boolean;
  day: number; // the streak day today's claim is (1..7); once claimed, the day that was claimed
  broken: boolean; // a missed day reset the streak: today starts again at day 1 (false for a brand-new player)
  saver: boolean; // the Pass owner's streak saver keeps the streak alive today (one missed day)
  saverAvailable: boolean; // an owner who has not used this week's saver (shown even when it is not needed)
  reward: StreakReward;
}

export function streakStatus(streak: StreakState, now: number, ownsPass: boolean, level = 1): StreakStatus {
  const band = weeklyBand(level);
  const today = utcDay(now);
  const gap = streak.last ? daysBetween(streak.last, today) : NaN;
  const saverAvailable = ownsPass && T.battlePass.streakSavers > 0 && streak.saverWeek !== utcWeek(now);
  // Claimed today, or the stored day lies in the future (a clock set back): nothing to claim, and no second round for the same days.
  if (streak.last && Number.isFinite(gap) && gap <= 0) {
    return { today, claimedToday: true, day: streak.count, broken: false, saver: false, saverAvailable, reward: streakReward(streak.count, band) };
  }
  const continues = streak.count > 0 && gap === 1;
  const saved = streak.count > 0 && gap === 2 && saverAvailable;
  const day = continues || saved ? (streak.count >= STREAK_DAYS ? 1 : streak.count + 1) : 1;
  return { today, claimedToday: false, day, broken: streak.count > 0 && !continues && !saved, saver: saved, saverAvailable, reward: streakReward(day, band) };
}

export interface StreakClaim {
  save: SaveData;
  day: number;
  reward: StreakReward;
  usedSaver: boolean;
}

// Claims today's streak reward; null when it was already claimed today.
export function claimStreak(save: SaveData, now: number, ownsPass: boolean): StreakClaim | null {
  const status = streakStatus(save.quests.streak, now, ownsPass, playerLevel(save.xp));
  if (status.claimedToday) return null;
  const reward = status.reward;
  const consumables = reward.item ? { ...save.consumables, [reward.item.id]: (save.consumables[reward.item.id] ?? 0) + reward.item.n } : save.consumables;
  const streak: StreakState = { last: status.today, count: status.day, saverWeek: status.saver ? utcWeek(now) : save.quests.streak.saverWeek };
  return {
    save: { ...save, gold: save.gold + reward.gold, shards: save.shards + reward.shards, consumables, quests: { ...save.quests, streak } },
    day: status.day,
    reward,
    usedSaver: status.saver,
  };
}

// What the sidebar dot counts from this file: goals (and the bonus) ready to claim, plus today's streak reward when it has not been taken.
export function periodClaimable(save: Pick<SaveData, 'quests' | 'stats'> & { xp?: number }, now: number, ownsPass: boolean): number {
  return weeklyView(save, now).claimable + (streakStatus(save.quests.streak, now, ownsPass, playerLevel(save.xp ?? 0)).claimedToday ? 0 : 1);
}
