import { describe, expect, it } from 'vitest';
import { defaultSave, MAX_LEVEL, normalizeSave, playerLevel, xpForNextLevel, xpForNextLevelWith, xpToReachLevel } from '../engine';
import { legacyLevelProgress, migrateLegacyXp, migrateV2Xp, XP_CURVE_VERSION } from '../xpCurve';
import { paragonLevel, paragonLevelXp, paragonStartXp } from '../paragon';
import T from '../tunables';

// Round 15: the hero XP curve above level 60 was made cheaper. These tests keep the shape of the new curve and the promise to older saves: nobody loses a level, and a hero
// keeps the level he had.

const OLD = { growth4: 1.21, growth5: 1.27 };
const oldReach = (level: number): number => {
  let t = 0;
  for (let l = 1; l < level; l++) t += xpForNextLevelWith(l, OLD);
  return t;
};

// A save the way the game stored it before the stamp: everything a real save had (it carries the gear schema), no xpCurve.
const legacySave = (xp: number): Record<string, unknown> => {
  const s = { ...defaultSave(), xp } as unknown as Record<string, unknown>;
  delete s.xpCurve;
  return s;
};

describe('the new hero XP curve', () => {
  it('is byte-identical to the old one up to level 60 (the first 60 levels cost exactly what they cost)', () => {
    for (let l = 1; l <= 60; l++) expect(xpForNextLevel(l), `level ${l}`).toBe(xpForNextLevelWith(l, OLD));
    expect(xpToReachLevel(61)).toBe(oldReach(61));
    // the pinned numbers of the first 47 levels the progression guard depends on
    expect(xpToReachLevel(47)).toBe(208467);
    expect(xpToReachLevel(50)).toBe(325729);
  });

  it('is continuous and never gets cheaper from one level to the next, with no cliff at a band edge', () => {
    for (let l = 2; l < MAX_LEVEL; l++) {
      expect(xpForNextLevel(l), `level ${l}`).toBeGreaterThanOrEqual(xpForNextLevel(l - 1));
      expect(xpForNextLevel(l) / xpForNextLevel(l - 1), `ratio at ${l}`).toBeLessThan(1.2);
    }
    // band 4 grows 2.3% a level from the cost of level 60 and band 5 3% from the cost of level 80 (Rodada 20); like every band of this curve a band starts at the price the one before it ended on
    expect(xpForNextLevel(61) / xpForNextLevel(60)).toBeCloseTo(1, 6);
    expect(xpForNextLevel(62) / xpForNextLevel(61)).toBeCloseTo(1.023, 3);
    expect(xpForNextLevel(81) / xpForNextLevel(80)).toBeCloseTo(1, 6);
    expect(xpForNextLevel(82) / xpForNextLevel(81)).toBeCloseTo(1.03, 3);
  });

  it('lands on the numbers the docs print (XP to reach level 50 / 60 / 70 / 80 / 90 / 100)', () => {
    const reach = [50, 60, 70, 80, 90, 100].map((l) => Math.round(xpToReachLevel(l) / 1000));
    expect(reach).toEqual([326, 1514, 4288, 7763, 12148, 18026]);
  });

  it('makes the paragon level cost 2 to 4 days of an active level-100 hero, and 50 levels about 5 months', () => {
    const day = 200_000; // what hunting the last zone (~12 h a day) pays a normal player
    expect(paragonLevelXp(1) / day).toBeGreaterThanOrEqual(2);
    expect(paragonLevelXp(50) / day).toBeLessThanOrEqual(5);
    let total = 0;
    for (let n = 1; n <= 50; n++) total += paragonLevelXp(n);
    expect(total / day).toBeGreaterThan(120);
    expect(total / day).toBeLessThan(180);
    expect(paragonLevel(paragonStartXp() + total)).toBe(50);
  });
});

describe('an older save keeps its level on the new curve', () => {
  it('reads the old curve back exactly (level 100 cost 3.3 billion XP)', () => {
    expect(Math.round(oldReach(100))).toBeGreaterThan(3.3e9);
    expect(legacyLevelProgress(oldReach(75)).level).toBe(75);
    expect(legacyLevelProgress(oldReach(75) - 1).level).toBe(74);
    expect(legacyLevelProgress(oldReach(75) + xpForNextLevelWith(75, OLD) / 2).share).toBeCloseTo(0.5, 6);
  });

  it('keeps every level from 1 to 99 at the start, the middle and the end of the level, and the XP unchanged up to level 60', () => {
    for (let level = 1; level < MAX_LEVEL; level++) {
      for (const share of [0, 0.37, 0.999]) {
        const xp = Math.floor(oldReach(level) + share * xpForNextLevelWith(level, OLD));
        const loaded = normalizeSave(legacySave(xp));
        expect(playerLevel(loaded.xp), `level ${level} share ${share}`).toBe(level);
        expect(loaded.xpCurve).toBe(XP_CURVE_VERSION);
        if (level <= 60) expect(loaded.xp, `xp unchanged at ${level}`).toBe(xp);
        else {
          // the same share of the level on the new curve (to within the rounding of a whole XP)
          const into = (loaded.xp - xpToReachLevel(level)) / xpForNextLevel(level);
          expect(into).toBeGreaterThanOrEqual(share - 0.001);
          expect(into).toBeLessThanOrEqual(share + 0.001);
        }
      }
    }
  });

  it('never loses a level for any XP, and never gains one either', () => {
    for (let level = 1; level < MAX_LEVEL; level++) {
      const lo = oldReach(level);
      const hi = oldReach(level + 1);
      for (const xp of [lo, lo + 1, Math.floor((lo + hi) / 2), hi - 1]) {
        expect(playerLevel(migrateLegacyXp(xp)), `xp ${xp}`).toBe(level);
      }
    }
  });

  it('a hero who had finished level 100 keeps level 100 (and a whole paragon level of the old price stays a paragon level)', () => {
    const start = oldReach(100);
    const loaded = normalizeSave(legacySave(Math.floor(start + 1)));
    expect(playerLevel(loaded.xp)).toBe(MAX_LEVEL);
    expect(paragonLevel(loaded.xp)).toBe(0);
    const old1 = Math.round(xpForNextLevelWith(MAX_LEVEL - 1, OLD) * 0.05);
    const loaded2 = normalizeSave(legacySave(Math.floor(start + old1 + 5)));
    expect(paragonLevel(loaded2.xp)).toBe(1);
  });

  it('leaves a save that already carries the new stamp, and a bare object with no stamp at all, exactly as it is', () => {
    const stamped = normalizeSave({ ...defaultSave(), xp: 2_000_000 });
    expect(stamped.xp).toBe(2_000_000);
    expect(normalizeSave(JSON.parse(JSON.stringify(stamped))).xp).toBe(2_000_000);
    // nothing but an xp: not a real save, the new curve only ever makes a level cheaper
    expect(normalizeSave({ xp: 2_000_000 }).xp).toBe(2_000_000);
    // loading twice changes nothing (the stamp is written the first time)
    const once = normalizeSave(legacySave(Math.floor(oldReach(75) + 10)));
    expect(normalizeSave(JSON.parse(JSON.stringify(once))).xp).toBe(once.xp);
  });

  it('knows the shipped tunables are the ones the tests above assume', () => {
    expect(T.progression.heroGrowth4).toBe(1.023);
    expect(T.progression.heroGrowth5).toBe(1.03);
    expect(XP_CURVE_VERSION).toBe(3);
  });
});

// Rodada 20: the stamp is 3. A save stamped 2 (Round 15 to 19, bands 4 and 5 at 3%) keeps its level and its share of the level.
const V2 = { growth4: 1.03, growth5: 1.03 };
const v2Reach = (level: number): number => {
  let t = 0;
  for (let l = 1; l < level; l++) t += xpForNextLevelWith(l, V2);
  return t;
};
const stamped2 = (xp: number): Record<string, unknown> => ({ ...defaultSave(), xp, xpCurve: 2 });

describe('a save from the curve of Round 15 to 19 keeps its level on the Rodada 20 curve', () => {
  it('keeps every level from 1 to 99 at the start, the middle and the end of the level, and the XP unchanged up to level 60', () => {
    for (let level = 1; level < MAX_LEVEL; level++) {
      for (const share of [0, 0.37, 0.999]) {
        const xp = Math.floor(v2Reach(level) + share * xpForNextLevelWith(level, V2));
        const loaded = normalizeSave(stamped2(xp));
        expect(playerLevel(loaded.xp), `level ${level} share ${share}`).toBe(level);
        expect(loaded.xpCurve).toBe(XP_CURVE_VERSION);
        if (level <= 60) expect(loaded.xp).toBe(xp);
        else {
          const into = (loaded.xp - xpToReachLevel(level)) / xpForNextLevel(level);
          expect(into).toBeGreaterThanOrEqual(share - 0.001);
          expect(into).toBeLessThanOrEqual(share + 0.001);
        }
      }
    }
  });

  it('a level-100 hero keeps level 100 and a whole paragon level, and loading twice changes nothing', () => {
    const start = v2Reach(100);
    const loaded = normalizeSave(stamped2(Math.floor(start + 1)));
    expect(playerLevel(loaded.xp)).toBe(MAX_LEVEL);
    expect(paragonLevel(loaded.xp)).toBe(0);
    const oneParagon = Math.round(xpForNextLevelWith(MAX_LEVEL - 1, V2) * T.paragon.xpShare);
    const loaded2 = normalizeSave(stamped2(Math.floor(start + oneParagon + 5)));
    expect(paragonLevel(loaded2.xp)).toBe(1);
    expect(normalizeSave(JSON.parse(JSON.stringify(loaded2))).xp).toBe(loaded2.xp);
    expect(migrateV2Xp(0)).toBe(0);
    expect(migrateV2Xp(NaN)).toBe(0);
  });
});
