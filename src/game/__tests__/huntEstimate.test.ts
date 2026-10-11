import { describe, expect, it } from 'vitest';
import { hero } from '../../../scripts/sim/duel';
import { buildHuntSession, computeHuntingStatus, defaultSave, SaveData } from '../engine';
import { estimateHuntYield, ESTIMATE_HOURS } from '../huntEstimate';
import { HuntingDepth, HUNTING_ZONES } from '../huntingZones';
import T from '../tunables';

const HOUR = 3600 * 1000;
const START = 1_800_000_000_000;

// A hero at the max sub-level of every depth (no promotion can happen, so a real session stays on the level the estimate pins).
const withMaxLevels = (s: SaveData): SaveData => {
  const huntProgress: SaveData['huntProgress'] = {};
  for (const z of HUNTING_ZONES) for (const d of ['shallow', 'dense', 'deep'] as HuntingDepth[]) huntProgress[`${z.id}:${d}`] = { ceiling: T.hunting.subLevels, promotionWins: 0 };
  return { ...s, huntProgress, consumables: { ...s.consumables, small_hp: 0, large_hp: 0, greater_elixir: 0 } };
};

// What a real session of 1 h yields, per material, by the engine's own status computation.
const realHour = (s: SaveData, zoneId: string, depth: HuntingDepth) => {
  const hunting: SaveData = { ...s, activeHuntingZone: zoneId, activeHuntingDepth: depth, huntingOfflineStart: START, huntSession: buildHuntSession(s, START) };
  return computeHuntingStatus(hunting, START + HOUR);
};

const BUILDS: [string, () => SaveData, string, HuntingDepth][] = [
  ['tier 1 hero in the Demon Glade', () => withMaxLevels({ ...hero('1', 4, { level: 14 }), highestDungeonFloor: 90 }), 'demon_glade', 'shallow'],
  ['tier 3 hero in the Blood Marsh', () => withMaxLevels({ ...hero('3', 6, { level: 35 }), highestDungeonFloor: 90 }), 'blood_marsh', 'dense'],
  ['tier 5 hero in the Blood Abyss', () => withMaxLevels({ ...hero('5', 10, { level: 75 }), highestDungeonFloor: 90 }), 'blood_abyss', 'deep'],
];

describe('kill and defeat counters of a running session', () => {
  it('count fights without changing any outcome: a hero that never loses has no defeats, and every promotion win is also a kill', () => {
    const save = withMaxLevels({ ...hero('3', 6, { level: 35 }), highestDungeonFloor: 90 });
    const st = realHour(save, 'blood_marsh', 'shallow');
    expect(st.kills).toBeGreaterThan(50);
    expect(st.defeats).toBe(0);
    // a fresh hero is promoted through the levels during the hour: those fights are kills too
    const fresh = { ...hero('3', 6, { level: 35 }), highestDungeonFloor: 90, consumables: { ...save.consumables, small_hp: 0, large_hp: 0, greater_elixir: 0 } };
    const climbing = realHour(fresh, 'blood_marsh', 'shallow');
    expect(climbing.promotions).toBeGreaterThan(0);
    expect(climbing.kills).toBeGreaterThanOrEqual(climbing.promotions);
    expect(climbing.defeats).toBeGreaterThanOrEqual(climbing.promotionLosses);
  });
});

describe('estimateHuntYield', () => {
  it('is pure: the same input gives the same output and the save is left untouched', () => {
    const save = withMaxLevels({ ...hero('3', 4, { level: 30 }), highestDungeonFloor: 90 });
    const before = JSON.stringify(save);
    const a = estimateHuntYield(save, 'demon_rift', 'dense');
    const b = estimateHuntYield(save, 'demon_rift', 'dense');
    expect(a).toEqual(b);
    expect(JSON.stringify(save)).toBe(before);
    // and it does not feed on the real RNG: a Math.random that throws changes nothing (a fresh hero, so the cache is not what answers)
    const other = withMaxLevels({ ...hero('3', 5, { level: 30 }), highestDungeonFloor: 90 });
    const real = Math.random;
    Math.random = () => {
      throw new Error('estimate must not touch Math.random');
    };
    try {
      expect(() => estimateHuntYield(other, 'demon_rift', 'dense')).not.toThrow();
    } finally {
      Math.random = real;
    }
  });

  it('pins the sub-level: a level-1 hero is described at level 1 even when it would be promoted within the hour', () => {
    const fresh = { ...hero('3', 4, { level: 30 }), highestDungeonFloor: 90 };
    const e = estimateHuntYield(fresh, 'blood_marsh', 'shallow')!;
    expect(e.subLevel).toBe(1);
    expect(e.killsPerHour).toBeGreaterThan(0);
  });

  it('reports a hero that cannot win as such, and a missing zone as null', () => {
    const e = estimateHuntYield(defaultSave(), 'blood_abyss', 'deep')!;
    expect(e.outlook).toBe('cannot');
    expect(e.killsPerHour).toBe(0);
    expect(estimateHuntYield(defaultSave(), 'nope', 'shallow')).toBeNull();
  });

  for (const [name, make, zoneId, depth] of BUILDS) {
    it(`matches a real 1 h session within tolerance: ${name}`, () => {
      const save = make();
      const est = estimateHuntYield(save, zoneId, depth)!;
      const real = realHour(save, zoneId, depth);
      const kph = est.killsPerHour;
      expect(kph).toBeGreaterThan(20);
      expect(real.kills).toBeGreaterThan(0);
      expect(Math.abs(real.kills - kph) / kph).toBeLessThan(0.1);
      const zone = HUNTING_ZONES.find((z) => z.id === zoneId)!;
      // the commonest material is the one with enough units for a statistic (rares are a handful per hour)
      const common = zone.drops[0].material;
      const estUnits = est.materialsPerHour.find((m) => m.material === common)!.perHour;
      const realUnits = real.drops[common] ?? 0;
      expect(estUnits).toBeGreaterThan(5);
      expect(Math.abs(realUnits - estUnits) / estUnits).toBeLessThan(0.3);
      expect(Math.abs(real.xpReady - est.xpPerHour) / est.xpPerHour).toBeLessThan(0.1);
      expect(ESTIMATE_HOURS).toBeGreaterThan(1);
    });
  }
});
