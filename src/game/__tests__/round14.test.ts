import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSave, normalizeSave, SaveData, xpToReachLevel } from '../engine';
import { DeliveryOffer } from '../deliveryState';
import { deliveryTier, ensureDeliveryOffers, orderLevelFactor } from '../deliveries';
import { claimStreak, claimWeeklyBonus, claimWeeklyGoal, DAY_MS, rollSaveWeekly, sanitizeWeekly, streakReward, weeklyBand, weeklyBonusGold, weeklyGoalDefs, weeklyView, WEEKLY_GOAL_IDS } from '../weekly';
import { recordDungeonRun } from '../statsTracking';
import { stageOfDepth } from '../dungeon';
import T from '../tunables';
import { buildHero } from '../../../scripts/sim/ladder';
import { huntValue, merchantGoldPerHour } from '../../../scripts/sim/orderHero';
import { depthReach, gearHero } from '../../../scripts/sim/depthHero';
import { mulberry32 } from '../../../scripts/sim/driver';

const HOUR = 3600 * 1000;
const MON = Date.UTC(2026, 9, 12, 0, 0, 0);
const at = (days: number, hours = 12): number => MON + days * DAY_MS + hours * HOUR;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(at(0));
});
afterEach(() => vi.useRealTimers());

// What an order paid before the level factor: the Round 5 formula, written out again.
const DIST_BONUS = { local: 'goldBonusLocal', curta: 'goldBonusCurta', regional: 'goldBonusRegional', longa: 'goldBonusLonga', especial: 'goldBonusEspecial' } as const;
const unscaledGoldPerHour = (tier: number, dist: keyof typeof DIST_BONUS): number => T.deliveries.goldPerHourBase + T.deliveries.goldPerHourTier * tier + T.deliveries[DIST_BONUS[dist]];
const unscaledGold = (o: DeliveryOffer): number => Math.round((o.durationMs / HOUR) * unscaledGoldPerHour(o.tier, o.dist));
const unscaledXp = (o: DeliveryOffer): number => {
  const xp = { local: T.deliveries.xpPerHourLocal, curta: T.deliveries.xpPerHourCurta, regional: T.deliveries.xpPerHourRegional, longa: T.deliveries.xpPerHourLonga, especial: T.deliveries.xpPerHourEspecial };
  return Math.round((o.durationMs / HOUR) * xp[o.dist]);
};

const offersFor = (hero: SaveData, seed: number): DeliveryOffer[] => {
  const s = ensureDeliveryOffers(hero, at(0), mulberry32(seed), true);
  return s.deliveries.offers;
};

describe('Round 14: delivery orders scale with the hero', () => {
  it('the factor is 1 up to level 40, grows with the level and hits its anchors', () => {
    for (let l = 1; l <= 40; l++) expect(orderLevelFactor(l)).toBe(1);
    let prev = 1;
    for (let l = 41; l <= 100; l++) {
      expect(orderLevelFactor(l)).toBeGreaterThan(prev);
      prev = orderLevelFactor(l);
    }
    expect(orderLevelFactor(50)).toBeCloseTo(T.deliveries.levelScale50);
    expect(orderLevelFactor(75)).toBeCloseTo(T.deliveries.levelScale75);
    expect(orderLevelFactor(100)).toBeCloseTo(T.deliveries.levelScale100);
    expect(orderLevelFactor(100)).toBe(orderLevelFactor(5000));
  });

  it('levels 1 to 30 pay exactly what they paid before (well inside +/-10%), Gold and XP', () => {
    for (const [level, floor] of [[1, 1], [10, 12], [20, 26], [30, 51]] as const) {
      const hero = buildHero(level, 0, 0, floor);
      for (let seed = 1; seed <= 6; seed++) {
        for (const o of offersFor(hero, seed)) {
          expect(o.gold, `L${level} gold`).toBe(unscaledGold(o));
          expect(o.xp, `L${level} xp`).toBe(unscaledXp(o));
        }
      }
    }
  });

  it('a level-100 hero is paid the factor more, the cargo is the same, and a 30 minute order is worth having', () => {
    const low = buildHero(30, 0, 0, 100);
    const top = buildHero(100, 0, 0, 100);
    expect(deliveryTier(top)).toBe(3);
    for (let seed = 1; seed <= 6; seed++) {
      for (const o of offersFor(top, seed)) {
        expect(o.gold / unscaledGold(o)).toBeCloseTo(T.deliveries.levelScale100, 1);
        // Round 15: the XP of an order stops scaling at xpFactorMax, the Gold keeps scaling to the level-100 anchor
        expect(o.xp / unscaledXp(o)).toBeCloseTo(T.deliveries.xpFactorMax, 1);
      }
    }
    // the same seed on the same tier asks for the same materials whatever the level: only the pay moves
    const a = offersFor(low, 3);
    const b = offersFor(top, 3);
    expect(b.map((o) => o.items)).toEqual(a.map((o) => o.items));
    expect(b.map((o) => o.durationMs)).toEqual(a.map((o) => o.durationMs));
    const halfHour = 0.5 * unscaledGoldPerHour(3, 'local') * orderLevelFactor(100);
    expect(halfHour).toBeGreaterThan(100); // it was +17 before
  });

  it('from level 50 up an order pays about what the same hours of Hunting would pay if sold to the merchant (0.8 to 1.2)', () => {
    for (const [level, tier, refine, floor] of [[50, 4, 4, 76], [75, 5, 4, 100], [100, 6, 8, 100]] as const) {
      const hero = buildHero(level, tier, refine, floor);
      const hunt = huntValue(hero, 5);
      expect(hunt, `L${level}`).not.toBeNull();
      const dists = ['local', 'curta', 'regional', 'longa', 'especial'] as const;
      const orderPerHour = (dists.reduce((sum, d) => sum + unscaledGoldPerHour(deliveryTier(hero), d), 0) / dists.length) * orderLevelFactor(level);
      const ratio = orderPerHour / merchantGoldPerHour(hunt!);
      expect(ratio, `L${level}`).toBeGreaterThanOrEqual(0.8);
      expect(ratio, `L${level}`).toBeLessThanOrEqual(1.2);
    }
  });
});

describe('Round 14: weekly goals and the streak in four bands', () => {
  const heroAt = (level: number): SaveData => ({ ...normalizeSave(JSON.parse(JSON.stringify(defaultSave()))), xp: xpToReachLevel(level) });
  const finish = (s: SaveData): SaveData => ({ ...s, stats: { ...s.stats, huntSeconds: 99 * 3600, deliveries: 99, oreGathered: 9999, itemsForged: 99, dungeonFloors: 999 } });

  it('the bands are 1-24, 25-49, 50-99 and 100 with paragon', () => {
    expect([1, 24, 25, 49, 50, 99, 100, 130].map(weeklyBand)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('band 1 is exactly what it was; the other bands only ask for more and pay more, and the Runas never scale', () => {
    const b1 = weeklyGoalDefs(1);
    expect([b1.hunt.target, b1.deliveries.target, b1.gather.target, b1.forge.target, b1.floors.target]).toEqual([6, 3, 150, 4, 25]);
    expect(WEEKLY_GOAL_IDS.map((id) => b1[id].gold)).toEqual([150, 150, 150, 150, 150]);
    expect(weeklyBonusGold(1)).toBe(400);
    for (const id of WEEKLY_GOAL_IDS) {
      for (const band of [2, 3, 4] as const) {
        const prev = weeklyGoalDefs((band - 1) as 1 | 2 | 3)[id];
        const cur = weeklyGoalDefs(band)[id];
        expect(cur.target, `${id} band ${band}`).toBeGreaterThan(prev.target);
        expect(cur.gold).toBeGreaterThan(prev.gold);
        expect(cur.shards).toBe(0);
      }
    }
    expect(T.weekly.bonusShards).toBe(3);
    expect(streakReward(7, 4).shards).toBe(streakReward(7, 1).shards);
  });

  it('the band is fixed when the week begins: levelling up mid-week changes nothing until Monday', () => {
    let s = rollSaveWeekly(heroAt(24), at(0));
    expect(s.quests.weekly.band).toBe(1);
    s = { ...s, xp: xpToReachLevel(60) };
    expect(rollSaveWeekly(s, at(3)).quests.weekly.band).toBe(1);
    expect(weeklyView(s, at(3)).goals.map((g) => g.def.target)).toEqual(weeklyView(heroAt(24), at(3)).goals.map((g) => g.def.target));
    const next = rollSaveWeekly(s, at(7));
    expect(next.quests.weekly.band).toBe(3);
  });

  it('a week saved before the bands existed takes the band of the hero it meets', () => {
    expect(sanitizeWeekly({ week: '2026-10-12', base: {}, claimed: [], bonusClaimed: false }, undefined, at(0), 60).band).toBe(3);
    expect(sanitizeWeekly({ week: '2026-10-12', band: 2, base: {}, claimed: [] }, undefined, at(0), 60).band).toBe(2);
    expect(sanitizeWeekly({ week: '2026-10-12', band: 9, base: {}, claimed: [] }, undefined, at(0), 60).band).toBe(3);
  });

  it('the Gold of goals, of the bonus and of the streak follows the band', () => {
    for (const [level, band] of [[10, 1], [30, 2], [75, 3], [100, 4]] as const) {
      // a new week for a save made in the previous one: the band is read from the hero as he is on Monday
      let s = finish(rollSaveWeekly(heroAt(level), at(7)));
      expect(s.quests.weekly.band).toBe(band);
      const view = weeklyView(s, at(9));
      expect(view.band).toBe(band);
      const mult = band === 1 ? 1 : (T.weekly as unknown as Record<string, number>)[`goldMult${band}`];
      let gold = s.gold;
      for (const g of view.goals) {
        const claim = claimWeeklyGoal(s, g.def.id, at(9))!;
        expect(claim.gold).toBe(Math.round(T.weekly.goldPerGoal * mult));
        s = claim.save;
      }
      const bonus = claimWeeklyBonus(s, at(9))!;
      expect(bonus.gold).toBe(Math.round(T.weekly.bonusGold * mult));
      expect(view.bonusGold).toBe(bonus.gold); // the screen shows what the claim pays
      expect(bonus.shards).toBe(T.weekly.bonusShards);
      gold += bonus.gold + view.goals.reduce((n, g) => n + g.def.gold, 0);
      expect(bonus.save.gold).toBe(gold);
      const streak = claimStreak(heroAt(level), at(0), false)!;
      expect(streak.reward.gold).toBe(Math.round(T.streak.gold1 * mult));
    }
  });

  it('the floors goal counts Profundezas depths too', () => {
    const s = defaultSave();
    const after = recordDungeonRun(s, stageOfDepth(1), 12, 0);
    expect(after.stats.dungeonFloors).toBe(12);
  });
});

describe('Round 14: how deep end-game heroes get in the Profundezas', () => {
  const reach = (rarity: 'common' | 'epic' | 'legendary', paragon: number) => depthReach(gearHero(rarity, paragon));

  it('a level-100 hero in T6 +8 gear (no paragon) clears about depth 20 to 25, no longer a wall at 10 to 25', () => {
    const r = reach('common', 0);
    expect(r).toBeGreaterThanOrEqual(20);
    expect(r).toBeLessThanOrEqual(25);
  });

  it('each 10 paragon levels buy about 3 to 5 more depths (to level 20, before the next wall)', () => {
    const p0 = reach('common', 0);
    const p10 = reach('common', 10);
    const p20 = reach('common', 20);
    expect(p10 - p0).toBeGreaterThanOrEqual(3);
    expect(p10 - p0).toBeLessThanOrEqual(5);
    expect(p20 - p10).toBeGreaterThanOrEqual(3);
    expect(p20 - p10).toBeLessThanOrEqual(5);
  });

  it('depth 50 needs both Legendary-heavy gear and near-max paragon', () => {
    expect(reach('common', 50)).toBeLessThan(50);
    expect(reach('epic', 50)).toBeLessThan(50);
    expect(reach('legendary', 0)).toBeLessThan(50);
    expect(reach('legendary', 30)).toBeLessThan(50);
    expect(reach('legendary', 50)).toBeGreaterThanOrEqual(50);
  });
});
