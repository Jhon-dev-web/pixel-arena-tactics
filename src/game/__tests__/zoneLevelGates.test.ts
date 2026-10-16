import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hero } from '../../../scripts/sim/duel';
import { buildCombatStats, buildHuntSimSetup, computeCP, computeHuntingStatus, cpOfStats, huntPromotionRequiredWins, playerLevel, SaveData, xpToReachLevel } from '../engine';
import { applyHuntStart } from '../huntLifecycle';
import { estimateHuntYield } from '../huntEstimate';
import { simulateHuntingSession } from '../huntCombat';
import { HuntSession } from '../huntSession';
import { getHuntingZone, HUNTING_ZONES, isDepthUnlocked, isZoneOpen, isZoneUnlocked, openZoneIds, recommendedCpForDepth, subLevelCpRequired, unlockedZoneIds } from '../huntingZones';
import { startBlockedReason, zoneLockedText, zoneState } from '../huntView';
import T from '../tunables';
import pt from '../../locales/pt.json';
import en from '../../locales/en.json';

// Rodada 22 (docs/BALANCE_CHANGES.md): zone 3 asks hero level 40 and zone 4 level 60 besides their Dungeon floors; zone 4 pays +2% XP per sub-level above 1 (+18% at 10) and
// promotes the hero to a sub-level only while his CP is at least recommendedCp x 1.18^(sub-level - 1).
const HOUR = 3600 * 1000;
const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const at = (level: number, floor: number): SaveData => ({ ...hero('5', 8, { level, rarity: 'legendary' }), xp: xpToReachLevel(level), highestDungeonFloor: floor, unlockedHuntingZones: unlockedZoneIds(floor) });
const abyss = getHuntingZone('blood_abyss')!;
const rift = getHuntingZone('demon_rift')!;

describe('the hero level opens zones 3 and 4', () => {
  it('zone 3 asks level 40 and zone 4 level 60, the first two ask none', () => {
    expect(HUNTING_ZONES.map((z) => z.unlockLevel ?? 0)).toEqual([0, 0, 40, 60]);
    expect(isZoneOpen(rift, 51, 39)).toBe(false);
    expect(isZoneOpen(rift, 51, 40)).toBe(true);
    expect(isZoneOpen(rift, 50, 100)).toBe(false); // the floor still counts
    expect(isZoneOpen(abyss, 76, 59)).toBe(false);
    expect(isZoneOpen(abyss, 76, 60)).toBe(true);
    expect(isZoneOpen(abyss, 75, 100)).toBe(false);
    expect(openZoneIds(100, 1)).toEqual(['demon_glade', 'blood_marsh']);
    expect(openZoneIds(100, 40)).toEqual(['demon_glade', 'blood_marsh', 'demon_rift']);
    expect(openZoneIds(100, 60)).toEqual(HUNTING_ZONES.map((z) => z.id));
  });

  it('the zone is still DISCOVERED by the floor alone (save.unlockedHuntingZones), the level is checked when a hunt starts', () => {
    expect(isZoneUnlocked(abyss, 76)).toBe(true);
    expect(unlockedZoneIds(76)).toContain('blood_abyss');
  });

  it('a hunt cannot start in a zone the level has not opened, and starts the moment it has', () => {
    const low = at(59, 90);
    expect(computeCP(low)).toBeGreaterThan(recommendedCpForDepth(abyss, 'shallow'));
    expect(applyHuntStart(low, 'blood_abyss', 'shallow', NOW)).toBeNull();
    expect(applyHuntStart(at(60, 90), 'blood_abyss', 'shallow', NOW)).not.toBeNull();
    expect(applyHuntStart(at(39, 90), 'demon_rift', 'shallow', NOW)).toBeNull();
    expect(applyHuntStart(at(40, 90), 'demon_rift', 'shallow', NOW)).not.toBeNull();
  });

  it('the Hunt screen says why: a locked zone with the floor AND the level, not the floor alone', () => {
    const low = at(59, 90);
    expect(zoneState(abyss, low, computeCP(low))).toBe('locked');
    expect(zoneState(abyss, at(60, 90), 99999)).not.toBe('locked');
    expect(startBlockedReason(low, abyss, 'shallow', computeCP(low))).toEqual({ key: 'hunting.unlocksAtLevel', vars: { n: 76, lvl: 60 } });
    expect(zoneLockedText(getHuntingZone('blood_marsh')!)).toEqual({ key: 'hunting.startLocked', vars: { n: 26 } });
    for (const tree of [pt, en]) {
      const t = (tree as unknown as { hunting: Record<string, string> }).hunting.unlocksAtLevel;
      expect(t).toContain('{n}');
      expect(t).toContain('{lvl}');
    }
  });
});

describe('zone 4: +2% XP per sub-level and a CP for each', () => {
  it('the CP of sub-level N is the zone\'s recommended CP at the depth x 1.18^(N - 1), and only the last zone has a gate', () => {
    expect(abyss.xpPerSubLevel).toBe(0.02);
    expect(abyss.subLevelCpGrowth).toBe(1.18);
    expect(HUNTING_ZONES.filter((z) => z.subLevelCpGrowth).map((z) => z.id)).toEqual(['blood_abyss']);
    expect(subLevelCpRequired(abyss, 'deep', 1)).toBe(0);
    expect(subLevelCpRequired(abyss, 'deep', 2)).toBe(Math.round(recommendedCpForDepth(abyss, 'deep') * 1.18));
    expect(subLevelCpRequired(abyss, 'deep', 10)).toBe(Math.round(recommendedCpForDepth(abyss, 'deep') * Math.pow(1.18, 9)));
    expect(subLevelCpRequired(abyss, 'deep', 10)).toBeGreaterThan(9000); // a tier 4 set never gets there (CP ~3,000 to 4,700), tier 5 and 6 do
    expect(subLevelCpRequired(rift, 'deep', 10)).toBe(0);
    // each sub-level asks more than the one before, at every depth
    for (const depth of ['shallow', 'dense', 'deep'] as const) for (let n = 2; n <= 10; n++) expect(subLevelCpRequired(abyss, depth, n)).toBeGreaterThan(subLevelCpRequired(abyss, depth, n - 1));
  });

  it('a won fight pays its sub-level\'s XP: sub-level 1 the base, 6 +10%, 10 +18%; a zone without the field stays flat', () => {
    const h = at(100, 100);
    const per = (zone: string, level: number) => {
      const s = { ...h, huntProgress: { [`${zone}:shallow`]: { ceiling: level, promotionWins: 0 } } };
      return estimateHuntYield(s, zone, 'shallow')!.xpPerHour;
    };
    const base = per('blood_abyss', 1);
    expect(base).toBeGreaterThan(abyss.xpPerHour * 0.9);
    expect(per('blood_abyss', 6) / base).toBeCloseTo(1.1, 2);
    expect(per('blood_abyss', 10) / base).toBeCloseTo(1.18, 2);
    expect(per('demon_rift', 10) / per('demon_rift', 1)).toBeCloseTo(1, 2);
  });

  const sessionOf = (save: SaveData, depth: 'shallow' | 'deep') => {
    const stats = buildCombatStats(save);
    const session: HuntSession = { stats, blessed: false, strength: [], attack: [], pass: [], tonics: {} };
    const { build, zoneCfg, timeline, potionCfg } = buildHuntSimSetup(save, abyss, depth, session, 0, []);
    return { build, zoneCfg, timeline, potionCfg, cp: cpOfStats(stats) };
  };

  it('the zone config carries the per-sub-level XP; a promotion that is not allowed is not attempted, one that is allowed happens', () => {
    const { build, zoneCfg, timeline, potionCfg } = sessionOf(at(100, 100), 'shallow');
    expect(zoneCfg.xpPerSubLevel).toBe(0.02);
    const need = huntPromotionRequiredWins(1);
    const run = (allowed: (next: number) => boolean) =>
      simulateHuntingSession(build, zoneCfg, { ceiling: 1, promotionWins: need }, 2 * HOUR, potionCfg, 'gate', { maxLevel: T.hunting.subLevels, requiredWins: huntPromotionRequiredWins, allowed }, timeline);
    const blocked = run(() => false);
    expect(blocked.ceilingSubLevel).toBe(1);
    expect(blocked.promotions).toBe(0);
    expect(blocked.promotionLosses).toBe(0); // no fight was spent on the attempt
    expect(blocked.promotionWins).toBeGreaterThan(need); // the wins keep counting
    const open = run(() => true);
    expect(open.ceilingSubLevel).toBeGreaterThan(1);
    // without the callback the old behaviour is exactly the open one
    const old = simulateHuntingSession(build, zoneCfg, { ceiling: 1, promotionWins: need }, 2 * HOUR, potionCfg, 'gate', { maxLevel: T.hunting.subLevels, requiredWins: huntPromotionRequiredWins }, timeline);
    expect(old).toEqual(open);
  });

  it('computeHuntingStatus wires the gate: a hero under the CP of the next sub-level stays, one over it climbs, and the status says what the next one asks', () => {
    const strong = at(100, 100);
    const cp = computeCP(strong);
    const need = subLevelCpRequired(abyss, 'shallow', 2);
    expect(cp).toBeGreaterThan(need); // this hero is over the first gate
    const progress = { 'blood_abyss:shallow': { ceiling: 1, promotionWins: huntPromotionRequiredWins(1) } };
    const started = applyHuntStart({ ...strong, huntProgress: progress }, 'blood_abyss', 'shallow', NOW - 3 * HOUR)!;
    const status = computeHuntingStatus(started, NOW);
    expect(status.ceilingSubLevel).toBeGreaterThan(1);
    // the same hero with the gate pushed above his CP stays on sub-level 1
    const was = abyss.subLevelCpGrowth;
    try {
      abyss.subLevelCpGrowth = (cp * 2) / recommendedCpForDepth(abyss, 'shallow');
      const stuck = computeHuntingStatus(started, NOW);
      expect(stuck.ceilingSubLevel).toBe(1);
      expect(stuck.nextSubLevelCp).toBe(subLevelCpRequired(abyss, 'shallow', 2));
      expect(stuck.nextSubLevelCp).toBeGreaterThan(cp);
    } finally {
      abyss.subLevelCpGrowth = was;
    }
    expect(computeHuntingStatus(applyHuntStart(at(100, 100), 'demon_rift', 'shallow', NOW - HOUR)!, NOW).nextSubLevelCp).toBe(0);
  });

  it('a hero with a weapon and an armor of a tier-5 set at +8 opens the deep depth, and sub-level 10 asks a good deal more than he has', () => {
    const t5 = at(60, 90);
    expect(isDepthUnlocked(abyss, 'deep', computeCP(t5))).toBe(true);
    expect(computeCP(t5)).toBeLessThan(subLevelCpRequired(abyss, 'deep', 10));
    expect(playerLevel(t5.xp)).toBe(60);
  });
});
