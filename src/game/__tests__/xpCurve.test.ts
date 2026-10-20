import { describe, expect, it } from 'vitest';
import { defaultSave, MAX_LEVEL, normalizeSave, playerLevel, xpForNextLevel, xpForNextLevelWith, xpToReachLevel } from '../engine';
import { legacyLevelProgress, migrateLegacyXp, migrateV2Xp, migrateV3Xp, XP_CURVE_VERSION } from '../xpCurve';
import { paragonLevel, paragonLevelXp, paragonStartXp } from '../paragon';
import T from '../tunables';

// Round 15: the hero XP curve above level 60 was made cheaper. These tests keep the shape of the new curve and the promise to older saves: nobody loses a level, and a hero
// keeps the level he had.

const OLD = { growth4: 1.21, growth5: 1.27, early: false };
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
  it('is byte-identical to the old one from level 27 to 60 and costs more before it (Rodada 28: the first levels were too fast)', () => {
    expect(xpForNextLevel(1)).toBe(100);
    for (let l = 27; l <= 60; l++) expect(xpForNextLevel(l), `level ${l}`).toBe(xpForNextLevelWith(l, OLD));
    for (let l = 2; l <= 16; l++) expect(xpForNextLevel(l) / xpForNextLevelWith(l, OLD), `level ${l}`).toBeCloseTo(3.3, 1);
    for (let l = 17; l < 27; l++) expect(xpForNextLevel(l), `level ${l}`).toBeGreaterThan(xpForNextLevelWith(l, OLD));
    // the pinned numbers the progression guard depends on: the extra XP is fixed (about 17 thousand) from level 27 on
    expect(xpToReachLevel(15)).toBe(10461);
    expect(xpToReachLevel(24)).toBe(26052);
    expect(xpToReachLevel(47) - oldReach(47)).toBe(xpToReachLevel(27) - oldReach(27));
    expect(xpToReachLevel(50) - oldReach(50)).toBeLessThan(18_000);
  });

  it('is continuous and never gets cheaper from one level to the next, with no cliff at a band edge', () => {
    for (let l = 2; l < MAX_LEVEL; l++) {
      expect(xpForNextLevel(l), `level ${l}`).toBeGreaterThanOrEqual(xpForNextLevel(l - 1));
      // level 2 jumps (the early multiplier starts there; level 1 stays at 100 XP so the very first level is quick)
      if (l > 2) expect(xpForNextLevel(l) / xpForNextLevel(l - 1), `ratio at ${l}`).toBeLessThan(1.2);
    }
    // band 4 grows 2.3% a level from the cost of level 60 and band 5 3% from the cost of level 80 (Rodada 20); like every band of this curve a band starts at the price the one before it ended on
    expect(xpForNextLevel(61) / xpForNextLevel(60)).toBeCloseTo(1, 6);
    expect(xpForNextLevel(62) / xpForNextLevel(61)).toBeCloseTo(1.023, 3);
    expect(xpForNextLevel(81) / xpForNextLevel(80)).toBeCloseTo(1, 6);
    expect(xpForNextLevel(82) / xpForNextLevel(81)).toBeCloseTo(1.03, 3);
  });

  it('lands on the numbers the docs print (XP to reach level 50 / 60 / 70 / 80 / 90 / 100)', () => {
    const reach = [50, 60, 70, 80, 90, 100].map((l) => Math.round(xpToReachLevel(l) / 1000));
    expect(reach).toEqual([343, 1531, 4305, 7780, 12165, 18043]);
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

  it('keeps every level from 1 to 99 at the start, the middle and the end of the level, and the same share of it', () => {
    for (let level = 1; level < MAX_LEVEL; level++) {
      for (const share of [0, 0.37, 0.999]) {
        const xp = Math.floor(oldReach(level) + share * xpForNextLevelWith(level, OLD));
        const loaded = normalizeSave(legacySave(xp));
        expect(playerLevel(loaded.xp), `level ${level} share ${share}`).toBe(level);
        expect(loaded.xpCurve).toBe(XP_CURVE_VERSION);
        {
          // the same share of the level on the new curve (to within the rounding of a whole XP)
          const into = (loaded.xp - xpToReachLevel(level)) / xpForNextLevel(level);
          expect(into).toBeGreaterThanOrEqual(share - 0.001 - 2 / xpForNextLevelWith(level, { early: false }));
          expect(into).toBeLessThanOrEqual(share + 0.001 + 2 / xpForNextLevelWith(level, { early: false }));
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
    expect(XP_CURVE_VERSION).toBe(4);
    expect(T.progression.heroEarlyMult).toBe(3.3);
    expect(T.progression.heroEarlyPlateauTo).toBe(16);
    expect(T.progression.heroEarlyFadeTo).toBe(27);
  });
});

// Rodada 28: the stamp is 4 (Rodada 20 made it 3). A save stamped 2 (Round 15 to 19, bands 4 and 5 at 3%) keeps its level and its share of the level.
const V2 = { growth4: 1.03, growth5: 1.03, early: false };
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
        {
          const into = (loaded.xp - xpToReachLevel(level)) / xpForNextLevel(level);
          expect(into).toBeGreaterThanOrEqual(share - 0.001 - 2 / xpForNextLevelWith(level, { early: false }));
          expect(into).toBeLessThanOrEqual(share + 0.001 + 2 / xpForNextLevelWith(level, { early: false }));
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

// Rodada 28: the stamp is 4. A save stamped 3 (Rodada 20 to 27, no early multiplier) keeps its level and its share of the level: its XP rises, nobody loses a level.
const V3 = { early: false };
const v3Reach = (level: number): number => {
  let t = 0;
  for (let l = 1; l < level; l++) t += xpForNextLevelWith(l, V3);
  return t;
};
const stamped3 = (xp: number): Record<string, unknown> => ({ ...defaultSave(), xp, xpCurve: 3 });

describe('a save from the curve of Rodada 20 to 27 keeps its level on the Rodada 28 curve', () => {
  it('keeps every level from 1 to 99 at the start, the middle and the end of the level, and the same share of it', () => {
    for (let level = 1; level < MAX_LEVEL; level++) {
      for (const share of [0, 0.37, 0.999]) {
        const xp = Math.floor(v3Reach(level) + share * xpForNextLevelWith(level, V3));
        const loaded = normalizeSave(stamped3(xp));
        expect(playerLevel(loaded.xp), `level ${level} share ${share}`).toBe(level);
        expect(loaded.xpCurve).toBe(XP_CURVE_VERSION);
        expect(loaded.xp).toBeGreaterThanOrEqual(xp);
        const into = (loaded.xp - xpToReachLevel(level)) / xpForNextLevel(level);
        expect(into).toBeGreaterThanOrEqual(share - 0.001 - 2 / xpForNextLevelWith(level, { early: false }));
        expect(into).toBeLessThanOrEqual(share + 0.001 + 2 / xpForNextLevelWith(level, { early: false }));
      }
    }
  });

  it('a hero of level 1 with no XP stays at none, and a level-100 hero keeps level 100 and a whole paragon level, and loading twice changes nothing', () => {
    expect(migrateV3Xp(0)).toBe(0);
    expect(migrateV3Xp(NaN)).toBe(0);
    const loaded = normalizeSave(stamped3(Math.floor(v3Reach(100) + 1)));
    expect(playerLevel(loaded.xp)).toBe(MAX_LEVEL);
    expect(paragonLevel(loaded.xp)).toBe(0);
    const loaded2 = normalizeSave(stamped3(Math.floor(v3Reach(100) + paragonLevelXp(1) + 5)));
    expect(paragonLevel(loaded2.xp)).toBe(1);
    expect(normalizeSave(JSON.parse(JSON.stringify(loaded2))).xp).toBe(loaded2.xp);
  });
});
