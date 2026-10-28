import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hero } from '../../../scripts/sim/duel';
import { buildHero, wearFullSet } from '../../../scripts/sim/ladder';
import { BEST_GEAR_INDEX, equipmentIndex } from '../gearIndex';
import { buildCombatStats, buildHuntSimSetup, computeCP, computeHuntingStatus, cpOfStats, huntPromotionRequiredWins, playerLevel, SaveData, xpToReachLevel } from '../engine';
import { applyHuntStart } from '../huntLifecycle';
import { estimateHuntYield } from '../huntEstimate';
import { simulateHuntingSession } from '../huntCombat';
import { HuntSession } from '../huntSession';
import { getHuntingZone, HUNTING_ZONES, isDepthUnlocked, isZoneOpen, isZoneUnlocked, openZoneIds, depthGearRequired, recommendedCpForDepth, subLevelGearRequired, unlockedZoneIds, zoneReferenceXpPerHour } from '../huntingZones';
import { startBlockedReason, zoneLockedText, zoneState } from '../huntView';
import T from '../tunables';
import pt from '../../locales/pt.json';
import en from '../../locales/en.json';

// Rodada 22 (docs/BALANCE_CHANGES.md): zone 3 asks hero level 40 and zone 4 level 60 besides their Dungeon floors; zone 4 pays +2% XP per sub-level above 1 (+18% at 10) and
// promotes the hero to a sub-level only while his CP is at least recommendedCp x 1.18^(sub-level - 1). Rodada 24 made it +4.5% a sub-level (+40.5% at 10) and x 1.25, with the base XP 10,000 -> 8,750; Rodada 26 +5% (+45% at 10) and x 1.23, base 8,800.
// 28/10 (classes reform, phase 8): the gate asks an EQUIPMENT INDEX (gearIndex.ts), not a CP: the CP is measured from the stats and moved by class and by every change of combat (see huntingZones.ts subLevelGear).
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
    expect(HUNTING_ZONES.map((z) => z.unlockLevel ?? 0)).toEqual([0, 0, 40, 60, 75]); // zone 5 (classes reform, phase 7) asks level 75
    expect(isZoneOpen(rift, 51, 39)).toBe(false);
    expect(isZoneOpen(rift, 51, 40)).toBe(true);
    expect(isZoneOpen(rift, 50, 100)).toBe(false); // the floor still counts
    expect(isZoneOpen(abyss, 76, 59)).toBe(false);
    expect(isZoneOpen(abyss, 76, 60)).toBe(true);
    expect(isZoneOpen(abyss, 75, 100)).toBe(false);
    expect(openZoneIds(100, 1)).toEqual(['demon_glade', 'blood_marsh']);
    expect(openZoneIds(100, 40)).toEqual(['demon_glade', 'blood_marsh', 'demon_rift']);
    expect(openZoneIds(100, 60)).toEqual(HUNTING_ZONES.slice(0, 4).map((z) => z.id));
    expect(openZoneIds(89, 100)).toEqual(HUNTING_ZONES.slice(0, 4).map((z) => z.id)); // the floor of zone 5 (90) counts
    expect(openZoneIds(90, 74)).toEqual(HUNTING_ZONES.slice(0, 4).map((z) => z.id)); // and so does its level
    expect(openZoneIds(90, 75)).toEqual(HUNTING_ZONES.map((z) => z.id));
  });

  it('the zone is still DISCOVERED by the floor alone (save.unlockedHuntingZones), the level is checked when a hunt starts', () => {
    expect(isZoneUnlocked(abyss, 76)).toBe(true);
    expect(unlockedZoneIds(76)).toContain('blood_abyss');
  });

  it('a hunt cannot start in a zone the level has not opened, and starts the moment it has', () => {
    const full = (level: number): SaveData => wearFullSet(at(level, 90), 5, 8); // the depth gate asks an equipment index, so the hero wears a whole set
    const low = full(59);
    expect(computeCP(low)).toBeGreaterThan(recommendedCpForDepth(abyss, 'shallow'));
    expect(equipmentIndex(low)).toBeGreaterThanOrEqual(depthGearRequired(abyss, 'shallow'));
    expect(applyHuntStart(low, 'blood_abyss', 'shallow', NOW)).toBeNull(); // the gear is enough, the level is not
    expect(applyHuntStart(full(60), 'blood_abyss', 'shallow', NOW)).not.toBeNull();
    expect(applyHuntStart(full(39), 'demon_rift', 'shallow', NOW)).toBeNull();
    expect(applyHuntStart(full(40), 'demon_rift', 'shallow', NOW)).not.toBeNull();
  });

  it('the Hunt screen says why: a locked zone with the floor AND the level, not the floor alone', () => {
    const low = at(59, 90);
    expect(zoneState(abyss, low, equipmentIndex(low))).toBe('locked');
    expect(zoneState(abyss, at(60, 90), 99)).not.toBe('locked');
    expect(startBlockedReason(low, abyss, 'shallow', equipmentIndex(low))).toEqual({ key: 'hunting.unlocksAtLevel', vars: { n: 76, lvl: 60 } });
    expect(zoneLockedText(getHuntingZone('blood_marsh')!)).toEqual({ key: 'hunting.startLocked', vars: { n: 26 } });
    for (const tree of [pt, en]) {
      const t = (tree as unknown as { hunting: Record<string, string> }).hunting.unlocksAtLevel;
      expect(t).toContain('{n}');
      expect(t).toContain('{lvl}');
    }
  });
});

describe('uniques are rare per player (Rodada 22)', () => {
  it('the last zone drops each of its uniques at 0.000008 a roll (it was 0.000024), the others at most that', () => {
    expect(abyss.uniques!.map((u) => u.chance)).toEqual([0.000008, 0.000008]);
    for (const z of HUNTING_ZONES) for (const u of z.uniques ?? []) expect(u.chance, `${z.id}/${u.itemId}`).toBeLessThanOrEqual(0.000008);
  });
});

describe('zone 4: a bonus XP per sub-level and a CP for each', () => {
  it('the index of sub-level N is the zone\'s base + the depth\'s offset + 0.375 per sub-level, and only the two last zones have a gate', () => {
    expect(abyss.xpPerSubLevel).toBe(0.05);
    expect(abyss.subLevelGear).toEqual({ base: 3.7, step: 0.375 });
    expect(getHuntingZone('abyss_throne')!.subLevelGear).toEqual({ base: 4.5, step: 0.375 });
    expect(HUNTING_ZONES.filter((z) => z.subLevelGear).map((z) => z.id)).toEqual(['blood_abyss', 'abyss_throne']);
    expect(subLevelGearRequired(abyss, 'deep', 1)).toBe(0);
    expect(subLevelGearRequired(abyss, 'shallow', 2)).toBe(4.075);
    expect(subLevelGearRequired(abyss, 'deep', 2)).toBe(4.575);
    expect(subLevelGearRequired(abyss, 'deep', 10)).toBe(7.575);
    expect(subLevelGearRequired(rift, 'deep', 10)).toBe(0);
    // each sub-level asks more than the one before, at every depth, and a deeper depth asks more than a shallower one
    for (const depth of ['shallow', 'dense', 'deep'] as const) for (let n = 2; n <= 10; n++) expect(subLevelGearRequired(abyss, depth, n)).toBeGreaterThan(subLevelGearRequired(abyss, depth, n - 1));
    for (let n = 2; n <= 10; n++) {
      expect(subLevelGearRequired(abyss, 'dense', n)).toBeGreaterThan(subLevelGearRequired(abyss, 'shallow', n));
      expect(subLevelGearRequired(abyss, 'deep', n)).toBeGreaterThan(subLevelGearRequired(abyss, 'dense', n));
    }
  });

  // THE RULE (28/10): the last sub-level of the deepest depth of every gated zone is reachable with the best gear in the game. The throne of phase 7 copied the abyss's curve on a base 2.24x bigger and its
  // sub-level 10 asked more than any hero can have; nothing noticed for a day.
  it('the last sub-level of the deepest depth of EVERY gated zone can be reached with the best gear the game has', () => {
    const gated = HUNTING_ZONES.filter((z) => z.subLevelGear);
    expect(gated.length).toBeGreaterThan(0);
    for (const z of gated) {
      const ask = subLevelGearRequired(z, 'deep', T.hunting.subLevels);
      expect(ask, `${z.id} deep sub-level ${T.hunting.subLevels} asks ${ask}, the best gear is ${BEST_GEAR_INDEX}`).toBeLessThanOrEqual(BEST_GEAR_INDEX);
    }
  });

  it('every depth of every zone can be STARTED with the best gear the game has, and a deeper depth never asks less than a shallower one (the depth gate is an equipment index since 28/10)', () => {
    for (const z of HUNTING_ZONES) {
      expect(depthGearRequired(z, 'shallow'), z.id).toBeLessThanOrEqual(depthGearRequired(z, 'dense'));
      expect(depthGearRequired(z, 'dense'), z.id).toBeLessThanOrEqual(depthGearRequired(z, 'deep'));
      expect(depthGearRequired(z, 'deep'), z.id).toBeLessThanOrEqual(BEST_GEAR_INDEX);
    }
    // a brand-new hero (no gear, index 0) starts the first zone, which is the only way into the game
    expect(depthGearRequired(HUNTING_ZONES[0], 'shallow')).toBe(0);
    // the zones ask more and more equipment
    for (let i = 1; i < HUNTING_ZONES.length; i++) expect(depthGearRequired(HUNTING_ZONES[i], 'shallow')).toBeGreaterThan(depthGearRequired(HUNTING_ZONES[i - 1], 'shallow'));
  });

  it('a won fight pays its sub-level\'s XP: sub-level 1 the base, 6 +25%, 10 +45%; a zone without the field stays flat', () => {
    const h = at(100, 100);
    const per = (zone: string, level: number) => {
      const s = { ...h, huntProgress: { [`${zone}:shallow`]: { ceiling: level, promotionWins: 0 } } };
      return estimateHuntYield(s, zone, 'shallow')!.xpPerHour;
    };
    const base = per('blood_abyss', 1);
    expect(base).toBeGreaterThan(zoneReferenceXpPerHour(abyss) * 0.9);
    // Rodada 31: XP is per kill, so the sub-level's +% is the kill's; a deeper sub-level's monsters also take longer, which can pull a hero out of the pace cap by a couple of points
    expect(per('blood_abyss', 6) / base).toBeCloseTo(1 + 5 * abyss.xpPerSubLevel!, 1);
    expect(per('blood_abyss', 10) / base).toBeCloseTo(1 + 9 * abyss.xpPerSubLevel!, 1);
    expect(per('demon_rift', 10) / per('demon_rift', 1)).toBeCloseTo(1, 1);
  });

  const sessionOf = (save: SaveData, depth: 'shallow' | 'deep') => {
    const stats = buildCombatStats(save);
    const session: HuntSession = { stats, blessed: false, strength: [], attack: [], pass: [], tonics: {} };
    const { build, zoneCfg, timeline, potionCfg } = buildHuntSimSetup(save, abyss, depth, session, 0, []);
    return { build, zoneCfg, timeline, potionCfg, cp: cpOfStats(stats) };
  };

  it('the zone config carries the per-sub-level XP; a promotion that is not allowed is not attempted, one that is allowed happens', () => {
    const { build, zoneCfg, timeline, potionCfg } = sessionOf(at(100, 100), 'shallow');
    expect(zoneCfg.xpPerSubLevel).toBe(abyss.xpPerSubLevel);
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

  it('computeHuntingStatus wires the gate: a hero under the index of the next sub-level stays, one over it climbs, and the status says what the next one asks', () => {
    const strong = { ...buildHero(100, 6, 8, 100), highestDungeonFloor: 100, unlockedHuntingZones: unlockedZoneIds(100) };
    const index = equipmentIndex(strong);
    const need = subLevelGearRequired(abyss, 'shallow', 2);
    expect(index).toBeGreaterThan(need); // this hero (a full tier 6 +8 set) is over the first gate
    const progress = { 'blood_abyss:shallow': { ceiling: 1, promotionWins: huntPromotionRequiredWins(1) } };
    const started = applyHuntStart({ ...strong, huntProgress: progress }, 'blood_abyss', 'shallow', NOW - 3 * HOUR)!;
    const status = computeHuntingStatus(started, NOW);
    expect(status.ceilingSubLevel).toBeGreaterThan(1);
    // the same hero with the gate pushed above his index stays on sub-level 1
    const was = abyss.subLevelGear;
    try {
      abyss.subLevelGear = { base: index + 2, step: 0.375 };
      const stuck = computeHuntingStatus(started, NOW);
      expect(stuck.ceilingSubLevel).toBe(1);
      expect(stuck.nextSubLevelGear).toBe(subLevelGearRequired(abyss, 'shallow', 2));
      expect(stuck.nextSubLevelGear).toBeGreaterThan(index);
    } finally {
      abyss.subLevelGear = was;
    }
    expect(computeHuntingStatus(applyHuntStart({ ...strong, unlockedHuntingZones: unlockedZoneIds(100) }, 'demon_rift', 'shallow', NOW - HOUR)!, NOW).nextSubLevelGear).toBe(0);
  });

  it('the index is FROZEN with the session: a piece taken off after the start does not close a sub-level the hero was promoted to', () => {
    const strong = { ...buildHero(100, 6, 8, 100), highestDungeonFloor: 100, unlockedHuntingZones: unlockedZoneIds(100) };
    const progress = { 'blood_abyss:shallow': { ceiling: 1, promotionWins: huntPromotionRequiredWins(1) } };
    const started = applyHuntStart({ ...strong, huntProgress: progress }, 'blood_abyss', 'shallow', NOW - 3 * HOUR)!;
    expect(started.huntSession?.gearIndex).toBe(equipmentIndex(strong));
    const stripped = { ...started, equipped: { ...started.equipped, armor: null, weapon: null, helmet: null, gloves: null, boots: null, shield: null, ring: null } };
    expect(computeHuntingStatus(stripped, NOW).ceilingSubLevel).toBe(computeHuntingStatus(started, NOW).ceilingSubLevel);
  });

  it('a hero with a weapon and an armor of a tier-5 set at +8 opens the deep depth, and sub-level 10 asks a good deal more than he has', () => {
    const t5 = { ...buildHero(60, 5, 8, 90), highestDungeonFloor: 90, unlockedHuntingZones: unlockedZoneIds(90) };
    expect(isDepthUnlocked(abyss, 'deep', computeCP(t5))).toBe(true);
    expect(equipmentIndex(t5)).toBeLessThan(subLevelGearRequired(abyss, 'deep', 10));
    expect(playerLevel(t5.xp)).toBe(60);
  });
});
