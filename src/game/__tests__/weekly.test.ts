import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSave, normalizeSave, SaveData } from '../engine';
import { recordDungeonRun } from '../statsTracking';
import { emptyStats, normalizeStats, recordHuntTime } from '../stats';
import T from '../tunables';
import {
  activeWeeklyGoals,
  claimStreak,
  claimWeeklyBonus,
  claimWeeklyGoal,
  DAY_MS,
  daysBetween,
  periodClaimable,
  rollSaveWeekly,
  sanitizeStreak,
  sanitizeWeekly,
  STREAK_DAYS,
  streakReward,
  streakStatus,
  utcDay,
  utcWeek,
  WEEKLY_GOAL_IDS,
  weeklyView,
} from '../weekly';

// Weekly goals and the login streak. Every boundary is UTC and every function takes `now`, so nothing here depends on the machine's time zone.
const MON = Date.UTC(2026, 9, 12, 0, 0, 0); // Monday 2026-10-12 00:00:00 UTC
const at = (days: number, hours = 12): number => MON + days * DAY_MS + hours * 3600 * 1000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(at(0));
});
afterEach(() => vi.useRealTimers());

const fresh = (): SaveData => normalizeSave(JSON.parse(JSON.stringify(defaultSave())));
const withStats = (s: SaveData, patch: Partial<SaveData['stats']>): SaveData => ({ ...s, stats: { ...s.stats, ...patch } });
const owner = (s: SaveData): SaveData => ({ ...s, hasBattlePass: true });

describe('UTC day and week boundaries', () => {
  it('a week runs Monday 00:00:00.000 UTC to the next Monday', () => {
    expect(utcWeek(MON)).toBe('2026-10-12');
    expect(utcWeek(MON - 1)).toBe('2026-10-05'); // Sunday 23:59:59.999
    expect(utcWeek(MON + 7 * DAY_MS - 1)).toBe('2026-10-12');
    expect(utcWeek(MON + 7 * DAY_MS)).toBe('2026-10-19');
    expect(utcWeek(Date.UTC(2026, 11, 31, 23, 59))).toBe('2026-12-28');
    expect(utcWeek(Date.UTC(2027, 0, 1, 0, 0))).toBe('2026-12-28'); // across the year
    expect(utcWeek(Date.UTC(2024, 1, 29, 12))).toBe('2024-02-26'); // a leap day
  });

  it('a day runs 00:00:00.000 to 23:59:59.999 UTC, whatever the local zone says', () => {
    expect(utcDay(MON)).toBe('2026-10-12');
    expect(utcDay(MON - 1)).toBe('2026-10-11');
    expect(utcDay(MON + DAY_MS - 1)).toBe('2026-10-12');
    expect(daysBetween('2026-10-11', '2026-10-12')).toBe(1);
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('nope', '2026-10-12')).toBeNaN();
  });
});

describe('weekly goals', () => {
  it('four of the five activities each week, and every activity takes a turn out', () => {
    const left: string[] = [];
    for (let w = 0; w < 5; w++) {
      const goals = activeWeeklyGoals(MON + w * 7 * DAY_MS).map((g) => g.id);
      expect(goals).toHaveLength(4);
      expect(new Set(goals).size).toBe(4);
      left.push(WEEKLY_GOAL_IDS.find((id) => !goals.includes(id))!);
    }
    expect(new Set(left).size).toBe(5);
  });

  it('progress is the gain since the week began, in the unit of the goal, capped at the target', () => {
    const goals = activeWeeklyGoals(at(0)).map((g) => g.id);
    expect(goals).toContain('hunt');
    const s = fresh();
    expect(weeklyView(s, at(0)).goals.every((g) => g.progress === 0 && !g.complete)).toBe(true);
    const after = withStats(s, { huntSeconds: 3 * 3600, deliveries: 99, itemsForged: 2 });
    const view = weeklyView(after, at(1));
    const hunt = view.goals.find((g) => g.def.id === 'hunt')!;
    expect(hunt.progress).toBeCloseTo(3, 5);
    expect(hunt.complete).toBe(false);
    const orders = view.goals.find((g) => g.def.id === 'deliveries');
    if (orders) {
      expect(orders.progress).toBe(T.weekly.deliveries); // capped
      expect(orders.complete).toBe(true);
    }
  });

  it('a veteran save starts the first week at zero: only what happens after the snapshot counts', () => {
    const veteran = withStats(fresh(), { huntSeconds: 500 * 3600, itemsForged: 400, deliveries: 80, dungeonFloors: 900, oreGathered: 5000 });
    const loaded = normalizeSave(JSON.parse(JSON.stringify({ ...veteran, quests: { ...veteran.quests, weekly: undefined, streak: undefined } })));
    expect(loaded.quests.weekly.week).toBe(utcWeek(at(0)));
    expect(weeklyView(loaded, at(0)).goals.every((g) => g.progress === 0)).toBe(true);
    expect(weeklyView(loaded, at(0)).claimable).toBe(0);
  });

  it('claiming pays once, the bonus needs all four, and pays once', () => {
    let s = fresh();
    s = withStats(s, { huntSeconds: 10 * 3600, deliveries: 10, oreGathered: 500, itemsForged: 10, dungeonFloors: 100 });
    // stats moved after the snapshot: the base is the fresh zero
    const view = weeklyView(s, at(2));
    expect(view.claimable).toBe(4);
    expect(claimWeeklyBonus(s, at(2))).toBeNull(); // not before the four goals are claimed
    const gold0 = s.gold;
    for (const g of view.goals) {
      const claim = claimWeeklyGoal(s, g.def.id, at(2))!;
      expect(claim).not.toBeNull();
      expect(claimWeeklyGoal(claim.save, g.def.id, at(2))).toBeNull(); // twice: nothing
      s = claim.save;
    }
    expect(s.gold).toBe(gold0 + 4 * T.weekly.goldPerGoal);
    const bonus = claimWeeklyBonus(s, at(2))!;
    expect(bonus.save.gold).toBe(s.gold + T.weekly.bonusGold);
    expect(bonus.save.shards).toBe(s.shards + T.weekly.bonusShards);
    expect(claimWeeklyBonus(bonus.save, at(2))).toBeNull();
    expect(weeklyView(bonus.save, at(2)).claimable).toBe(0);
  });

  it('a goal that is not done, or not one of this week\'s four, cannot be claimed', () => {
    const s = fresh();
    expect(claimWeeklyGoal(s, 'hunt', at(1))).toBeNull();
    const leftOut = WEEKLY_GOAL_IDS.find((id) => !activeWeeklyGoals(at(1)).some((g) => g.id === id))!;
    expect(claimWeeklyGoal(withStats(s, { huntSeconds: 99 * 3600, deliveries: 99, oreGathered: 9999, itemsForged: 99, dungeonFloors: 999 }), leftOut, at(1))).toBeNull();
  });

  it('resets at Monday 00:00 UTC: the last second of Sunday still pays into the old week, the next second starts a new one', () => {
    let s = withStats(fresh(), { huntSeconds: 99 * 3600, deliveries: 9, oreGathered: 999, itemsForged: 9, dungeonFloors: 99 });
    const sunday = MON + 7 * DAY_MS - 1;
    expect(weeklyView(s, sunday).claimable).toBe(4);
    s = claimWeeklyGoal(s, activeWeeklyGoals(sunday)[0].id, sunday)!.save;
    const nextMonday = MON + 7 * DAY_MS;
    const rolled = rollSaveWeekly(s, nextMonday);
    expect(rolled.quests.weekly.week).toBe('2026-10-19');
    expect(rolled.quests.weekly.claimed).toEqual([]);
    expect(rolled.quests.weekly.bonusClaimed).toBe(false);
    // the snapshot is the counters of that moment: last week's work does not count again
    expect(weeklyView(rolled, nextMonday).goals.every((g) => g.progress === 0)).toBe(true);
    expect(rollSaveWeekly(rolled, nextMonday)).toBe(rolled); // idempotent
    // a claim that arrives before anything rolled the state does it first
    expect(weeklyView(s, nextMonday).claimable).toBe(0);
  });

  it('a clock set back does not give a second round of the same week', () => {
    const s = fresh();
    const later = rollSaveWeekly(s, MON + 14 * DAY_MS);
    expect(rollSaveWeekly(later, MON).quests.weekly.week).toBe(later.quests.weekly.week);
  });

  it('corrupt or missing weekly data loads as a fresh week', () => {
    const stats = emptyStats();
    expect(sanitizeWeekly(undefined, stats, at(0)).week).toBe('2026-10-12');
    expect(sanitizeWeekly({ week: 7, base: 'x' }, stats, at(0)).claimed).toEqual([]);
    const w = sanitizeWeekly({ week: '2026-10-12', base: { hunt: -5, forge: 'x', floors: 12.7 }, claimed: ['hunt', 'nope'], bonusClaimed: 'yes' }, stats, at(0));
    expect(w.base).toEqual({ hunt: 0, deliveries: 0, gather: 0, forge: 0, floors: 12 });
    expect(w.claimed).toEqual(['hunt']);
    expect(w.bonusClaimed).toBe(false);
  });

  it('survives a save and reload', () => {
    let s = withStats(fresh(), { huntSeconds: 99 * 3600, deliveries: 9, oreGathered: 999, itemsForged: 9, dungeonFloors: 99 });
    s = claimWeeklyGoal(s, activeWeeklyGoals(at(0))[0].id, at(0))!.save;
    const again = normalizeSave(JSON.parse(JSON.stringify(s)));
    expect(again.quests.weekly).toEqual(s.quests.weekly);
  });
});

describe('the counters the goals read', () => {
  it('a hunt adds the seconds that counted, a dungeon run adds the floors it cleared', () => {
    const s = recordHuntTime(fresh(), 90 * 60 * 1000);
    expect(s.stats.huntSeconds).toBe(5400);
    expect(recordHuntTime(s, NaN)).toBe(s);
    expect(recordHuntTime(s, -5)).toBe(s);
    const run = recordDungeonRun(fresh(), 10, 7);
    expect(run.stats.dungeonFloors).toBe(7);
    expect(recordDungeonRun(run, 17, 3).stats.dungeonFloors).toBe(10);
  });

  it('an old save without them loads with zero, and the loader keeps what was stored', () => {
    expect(normalizeStats({ kills: 5 }).huntSeconds).toBe(0);
    expect(normalizeStats({ kills: 5 }).dungeonFloors).toBe(0);
    expect(normalizeStats({ huntSeconds: 3600.9, dungeonFloors: 42 })).toMatchObject({ huntSeconds: 3600, dungeonFloors: 42 });
  });
});

describe('login streak', () => {
  it('starts at day 1, nothing is claimed by loading, and the claim is once per UTC day', () => {
    const s = fresh();
    expect(s.quests.streak).toEqual({ last: '', count: 0, saverWeek: '' });
    const st = streakStatus(s.quests.streak, at(0), false);
    expect(st).toMatchObject({ claimedToday: false, day: 1, broken: false });
    const claim = claimStreak(s, at(0), false)!;
    expect(claim.day).toBe(1);
    expect(claim.save.gold).toBe(s.gold + T.streak.gold1);
    expect(claimStreak(claim.save, at(0, 23), false)).toBeNull(); // later the same day
    expect(streakStatus(claim.save.quests.streak, at(0, 23), false).claimedToday).toBe(true);
  });

  it('walks days 1 to 7 on consecutive UTC days and starts over after day 7', () => {
    let s = fresh();
    for (let d = 0; d < STREAK_DAYS; d++) {
      const claim = claimStreak(s, at(d), false)!;
      expect(claim.day).toBe(d + 1);
      s = claim.save;
    }
    expect(s.consumables.hunter_lure).toBe(1); // day 3
    expect(s.consumables.repair_kit).toBe(1); // day 5
    expect(s.consumables.armor_polish).toBe(1); // day 7
    expect(streakReward(7)).toMatchObject({ gold: T.streak.gold7, shards: T.streak.shards7 });
    expect(claimStreak(s, at(STREAK_DAYS), false)!.day).toBe(1);
  });

  it('the day changes at 00:00 UTC, not at the local midnight', () => {
    let s = fresh();
    s = claimStreak(s, MON + DAY_MS - 1000, false)!.save; // 23:59:59 UTC
    expect(claimStreak(s, MON + DAY_MS - 1, false)).toBeNull();
    expect(claimStreak(s, MON + DAY_MS, false)!.day).toBe(2); // 00:00:00 UTC next day
  });

  it('a missed day starts over at day 1 for everyone without the Pass', () => {
    let s = claimStreak(claimStreak(fresh(), at(0), false)!.save, at(1), false)!.save;
    expect(s.quests.streak.count).toBe(2);
    const st = streakStatus(s.quests.streak, at(3), false);
    expect(st).toMatchObject({ claimedToday: false, day: 1, broken: true, saver: false });
    s = claimStreak(s, at(3), false)!.save;
    expect(s.quests.streak.count).toBe(1);
  });

  it('the Pass streak saver bridges ONE missed day a week, never two, and only once a week', () => {
    let s = owner(claimStreak(claimStreak(fresh(), at(0), true)!.save, at(1), true)!.save); // Mon, Tue claimed
    const wed = at(2);
    s = owner(s);
    // Thursday: Wednesday was missed, the saver keeps the streak going (day 3)
    const thu = at(3);
    const st = streakStatus(s.quests.streak, thu, true);
    expect(st).toMatchObject({ day: 3, saver: true, broken: false });
    expect(wed).toBeLessThan(thu);
    const saved = claimStreak(s, thu, true)!;
    expect(saved.usedSaver).toBe(true);
    expect(saved.save.quests.streak).toMatchObject({ last: utcDay(thu), count: 3, saverWeek: utcWeek(thu) });
    // used for this week: a second missed day in the same week resets
    const sun = at(6);
    expect(streakStatus(saved.save.quests.streak, sun, true)).toMatchObject({ day: 1, saver: false, broken: true, saverAvailable: false });
    // next week it is available again
    expect(streakStatus({ ...saved.save.quests.streak, last: utcDay(at(7)), count: 4 }, at(9), true)).toMatchObject({ day: 5, saver: true });
    // two missed days is more than a saver covers
    expect(streakStatus(s.quests.streak, at(4), true)).toMatchObject({ day: 1, broken: true, saver: false });
    // a free player never gets one
    expect(streakStatus(s.quests.streak, thu, false)).toMatchObject({ day: 1, broken: true, saver: false, saverAvailable: false });
  });

  it('the saver is off when the tunable is 0', () => {
    const old = T.battlePass.streakSavers;
    T.battlePass.streakSavers = 0;
    try {
      const s = claimStreak(fresh(), at(0), true)!.save;
      expect(streakStatus(s.quests.streak, at(2), true)).toMatchObject({ day: 1, saver: false, saverAvailable: false });
    } finally {
      T.battlePass.streakSavers = old;
    }
  });

  it('a clock set back never pays the same days twice', () => {
    const s = claimStreak(fresh(), at(3), false)!.save;
    expect(claimStreak(s, at(1), false)).toBeNull();
    expect(streakStatus(s.quests.streak, at(1), false).claimedToday).toBe(true);
  });

  it('corrupt streak data loads as no streak; a valid one survives a reload', () => {
    expect(sanitizeStreak({ last: 'x', count: 5 })).toEqual({ last: '', count: 0, saverWeek: '' });
    expect(sanitizeStreak({ last: '2026-10-12', count: 99, saverWeek: '2026-10-12' })).toEqual({ last: '2026-10-12', count: 7, saverWeek: '2026-10-12' });
    const s = claimStreak(fresh(), at(0), false)!.save;
    expect(normalizeSave(JSON.parse(JSON.stringify(s))).quests.streak).toEqual(s.quests.streak);
  });
});

describe('the sidebar dot and the old saves', () => {
  it('counts what is waiting: today\'s streak day and finished goals, none once claimed', () => {
    const s = fresh();
    expect(periodClaimable(s, at(0), false)).toBe(1); // the streak
    const claimed = claimStreak(s, at(0), false)!.save;
    expect(periodClaimable(claimed, at(0), false)).toBe(0);
    expect(periodClaimable(withStats(claimed, { itemsForged: 99, deliveries: 99, oreGathered: 999, huntSeconds: 99 * 3600, dungeonFloors: 99 }), at(0), false)).toBe(4);
    expect(periodClaimable(claimed, at(1), false)).toBe(1); // a new day
  });

  it('an old save (no weekly, no streak, no hunt/floor counters) loads and gets nothing for free', () => {
    const raw = JSON.parse(JSON.stringify(defaultSave()));
    delete raw.quests.weekly;
    delete raw.quests.streak;
    delete raw.stats.huntSeconds;
    delete raw.stats.dungeonFloors;
    raw.gold = 1234;
    const s = normalizeSave(raw);
    expect(s.gold).toBe(1234);
    expect(s.quests.streak).toEqual({ last: '', count: 0, saverWeek: '' });
    expect(s.quests.weekly.claimed).toEqual([]);
    expect(s.stats.huntSeconds).toBe(0);
    expect(s.stats.dungeonFloors).toBe(0);
  });
});
