import { describe, expect, it } from 'vitest';
import { QUESTS_ACHIEVEMENTS, questProgress, emptyQuestState } from '../quests';
import { buildCombatStats, defaultSave, normalizeSave, playerLevel, SaveData, xpToReachLevel } from '../engine';
import { DEPTH_BOSS_POOLS, depthBossPool, depthOfStage, depthScale, dungeonEnemyKindForFloor, isDepthStage, isDungeonBoss, isDungeonCheckpoint, MAX_DUNGEON_FLOOR, recommendedCpForFloor, stageOfDepth } from '../dungeon';
import { deepestDepth, depthRewardInfo, depthsUnlocked, nextBossDepth, nextDepthStage, recommendedCpForDepth } from '../depths';
import { getEnemyDef, ENEMIES } from '../enemies';
import { paragonDamageBonus, paragonLevel, paragonLevelXp, paragonProgress, paragonStartXp } from '../paragon';
import { emptyStats, normalizeStats } from '../stats';
import { recordDungeonRun } from '../statsTracking';
import { dungeonEnemyVisualForFloor } from '../sprites';
import { stageEnemyDmg, stageEnemyHp, waveRewards } from '../waves';
import { depthUniqueChance, rollDepthBossRelics, rollDepthBossUniques, UNIQUE_BOSS_DROPS } from '../uniques';
import { CODEX_MONSTERS, monsterDrops } from '../codex';
import { getTitleDef } from '../titles';
import T from '../tunables';
import en from '../../locales/en.json';
import pt from '../../locales/pt.json';

// The pre-Profundezas formulas, written out again here: floors 1-100 must keep giving exactly these numbers.
// Round 15: past floor 50 the enemies carry one more piecewise-linear factor (T.battle.lateHpGrowth / lateDmgGrowth, 1 up to floor 50): the Round 14 formulas below times that factor.
const lateFactor = (stage: number, g1: number, g2: number): number => 1 + g1 * Math.min(25, Math.max(0, stage - 50)) + g2 * Math.max(0, stage - 75);
const oldHp = (kind: ReturnType<typeof dungeonEnemyKindForFloor>, stage: number): number => {
  const def = ENEMIES[kind];
  const B = T.battle;
  const bossTable = [
    { hp: B.boss25HpMult, dmg: B.boss25DmgMult },
    { hp: B.boss50HpMult, dmg: B.boss50DmgMult },
    { hp: B.boss75HpMult, dmg: B.boss75DmgMult },
    { hp: B.boss100HpMult, dmg: B.boss100DmgMult },
  ];
  const bossMult = bossTable[Math.min(4, Math.max(1, Math.round(stage / B.bossEvery))) - 1];
  const base = def.hp * (1 + B.hpGrowth * (stage - 1)) * lateFactor(stage, B.lateHpGrowth, B.lateHpGrowth2);
  const mult = stage % B.bossEvery === 0 ? B.bossHpMult * bossMult.hp : stage % B.miniBossEvery === 0 ? B.miniBossHpMult : 1;
  return Math.round(base * mult);
};
const oldDmg = (kind: ReturnType<typeof dungeonEnemyKindForFloor>, stage: number): number => {
  const def = ENEMIES[kind];
  const B = T.battle;
  const bossTable = [
    { hp: B.boss25HpMult, dmg: B.boss25DmgMult },
    { hp: B.boss50HpMult, dmg: B.boss50DmgMult },
    { hp: B.boss75HpMult, dmg: B.boss75DmgMult },
    { hp: B.boss100HpMult, dmg: B.boss100DmgMult },
  ];
  const bossMult = bossTable[Math.min(4, Math.max(1, Math.round(stage / B.bossEvery))) - 1];
  const base = def.dmg * (1 + B.dmgGrowth * (stage - 1)) * lateFactor(stage, B.lateDmgGrowth, B.lateDmgGrowth2);
  const mult = stage % B.bossEvery === 0 ? B.bossDmgMult * bossMult.dmg : def.boss ? B.bossDmgMult : stage % B.miniBossEvery === 0 ? B.miniBossDmgMult : 1;
  return Math.round(base * mult);
};

describe('Profundezas: floors 1-100 behave exactly as before', () => {
  it('enemy HP and damage of every floor, the boss / checkpoint flags and the recommended CP are unchanged', () => {
    for (let floor = 1; floor <= MAX_DUNGEON_FLOOR; floor++) {
      const kind = dungeonEnemyKindForFloor(floor);
      const def = getEnemyDef(kind);
      expect(stageEnemyHp(def, floor), `hp ${floor}`).toBe(oldHp(kind, floor));
      expect(stageEnemyDmg(def, floor), `dmg ${floor}`).toBe(oldDmg(kind, floor));
      expect(isDungeonBoss(floor), `boss ${floor}`).toBe(floor % T.battle.bossEvery === 0);
      expect(isDungeonCheckpoint(floor), `checkpoint ${floor}`).toBe(floor % T.battle.miniBossEvery === 0);
      expect(isDepthStage(floor)).toBe(false);
    }
    // floors 1-50 are exactly the Round 14 numbers (the late factor is 1 there)
    for (let floor = 1; floor <= 50; floor++) expect(lateFactor(floor, T.battle.lateHpGrowth, T.battle.lateHpGrowth2) + lateFactor(floor, T.battle.lateDmgGrowth, T.battle.lateDmgGrowth2), `floor ${floor}`).toBe(2);
    expect(recommendedCpForFloor(50)).toBe(1848);
    expect(recommendedCpForFloor(75)).toBe(3862);
  });

  it('the floor-100 boss rewards are the same, and a floor run never reaches a depth reward', () => {
    const biome = { id: 'x', nameKey: 'x', enemyKind: 'boss' as const, startFloor: 76, endFloor: 100, goldMin: 15, goldMax: 21, drops: [] };
    const r = waveRewards(biome, 100);
    expect(r.shards).toBe(T.battle.bossShards);
    expect(waveRewards(biome, 99).shards).toBe(0);
  });
});

describe('Profundezas: the scaling rule', () => {
  const def = getEnemyDef('boss');
  const hp = (d: number) => stageEnemyHp(def, stageOfDepth(d));
  const dmg = (d: number) => stageEnemyDmg(def, stageOfDepth(d));

  it('stages past 100 are depths; a boss every 10 depths and never a checkpoint', () => {
    expect(isDepthStage(100)).toBe(false);
    expect(isDepthStage(101)).toBe(true);
    expect(depthOfStage(stageOfDepth(37))).toBe(37);
    for (let d = 1; d <= 100; d++) {
      expect(isDungeonBoss(stageOfDepth(d)), `depth ${d}`).toBe(d % T.depths.bossEvery === 0);
      expect(isDungeonCheckpoint(stageOfDepth(d))).toBe(false);
    }
  });

  it('HP and damage rise at a fixed percentage per depth and grow monotonically between boss depths', () => {
    for (let d = 1; d < 300; d++) {
      const next = d + 1;
      if (isDungeonBoss(stageOfDepth(d)) || isDungeonBoss(stageOfDepth(next))) continue;
      expect(hp(next), `hp ${d}`).toBeGreaterThan(hp(d));
      expect(dmg(next), `dmg ${d}`).toBeGreaterThan(dmg(d));
      if (d >= 5) {
        expect(hp(next) / hp(d)).toBeCloseTo(1 + T.depths.hpGrowth, 2);
        expect(dmg(next) / dmg(d)).toBeCloseTo(1 + T.depths.dmgGrowth, 2);
      }
    }
  });

  it('a boss depth is stronger than the depths around it, by the boss multipliers', () => {
    for (const d of [10, 20, 50, 100]) {
      expect(hp(d) / hp(d - 1)).toBeGreaterThan(T.depths.bossHpMult);
      expect(dmg(d) / dmg(d - 1)).toBeGreaterThan(T.depths.bossDmgMult);
      expect(hp(d)).toBeGreaterThan(hp(d + 1) * 0.99 * (T.depths.bossHpMult / (1 + T.depths.hpGrowth) / 1.0) * 0.9);
    }
  });

  it('depth 1 continues floor 99 smoothly (no cliff right after the last floor)', () => {
    const f99 = stageEnemyHp(def, 99);
    // Round 15: depth 0 is the floor-99 monster times baseHpMult / baseDmgMult (the late factor of floors 76-100 would otherwise be inherited whole), then one step of growth
    expect(hp(1) / f99).toBeCloseTo(T.depths.baseHpMult * (1 + T.depths.hpGrowth), 3);
    expect(dmg(1) / stageEnemyDmg(def, 99)).toBeCloseTo(T.depths.baseDmgMult * (1 + T.depths.dmgGrowth), 3);
  });

  it('the recommended CP follows the same curve by formula and never decreases between regular depths', () => {
    // depth 0 is the floor-99 line itself; depth 1 starts at the base multiple of it and the formula climbs from there
    expect(recommendedCpForDepth(0)).toBe(recommendedCpForFloor(99));
    let prev = recommendedCpForDepth(1);
    for (let d = 2; d <= 200; d++) {
      const cp = recommendedCpForDepth(d);
      if (!isDungeonBoss(stageOfDepth(d)) && !isDungeonBoss(stageOfDepth(d - 1))) expect(cp, `depth ${d}`).toBeGreaterThanOrEqual(prev);
      expect(Number.isFinite(cp)).toBe(true);
      prev = cp;
    }
    expect(recommendedCpForDepth(100)).toBeGreaterThan(recommendedCpForDepth(50) * 3); // Round 15: 2.5% a depth in CP terms, so 50 more depths are about x3.4
  });

  it('boss depths borrow the four biome boss sheets in turn, tinted and renamed; regular depths keep the death knight', () => {
    const seen = new Set<string>();
    for (let k = 1; k <= 8; k++) {
      const v = dungeonEnemyVisualForFloor(stageOfDepth(T.depths.bossEvery * k));
      expect(v.nameKey).toBe(`depthBoss${DEPTH_BOSS_POOLS[(k - 1) % 4]}`);
      expect(v.tintClass).toBe(`depth-tint-${DEPTH_BOSS_POOLS[(k - 1) % 4]}`);
      seen.add(v.nameKey);
      for (const tree of [pt, en]) expect(typeof (tree as unknown as { enemies: Record<string, string> }).enemies[v.nameKey]).toBe('string');
    }
    expect(seen.size).toBe(4);
    expect(dungeonEnemyVisualForFloor(stageOfDepth(7)).nameKey).toBe('deathKnight');
    expect(dungeonEnemyVisualForFloor(stageOfDepth(7)).tintClass).toBeUndefined();
  });
});

describe('Profundezas: rewards and their caps', () => {
  const biome = { id: 'minotaur_lair', nameKey: 'floor4', enemyKind: 'boss' as const, startFloor: 76, endFloor: 100, goldMin: 15, goldMax: 21, drops: [] };

  it('Aether only at boss depths (T.depths.bossShards), gold and a gem at the boss, plain gold otherwise', () => {
    for (let d = 1; d <= 60; d++) {
      const r = waveRewards(biome, stageOfDepth(d));
      expect(r.gold).toBeGreaterThan(0);
      if (d % T.depths.bossEvery === 0) {
        expect(r.shards).toBe(T.depths.bossShards);
        expect(Object.keys(r.gems)).toHaveLength(1);
      } else {
        expect(r.shards).toBe(0);
        expect(r.uniques).toHaveLength(0);
        expect(r.relics).toHaveLength(0);
        expect(Object.keys(r.gems)).toHaveLength(0);
      }
    }
  });

  it('the unique / relic chance rises slowly with depth and is capped', () => {
    let prev = 0;
    for (let d = 0; d <= 500; d += 10) {
      const p = depthUniqueChance(d);
      expect(p).toBeGreaterThanOrEqual(prev);
      expect(p).toBeLessThanOrEqual(T.depths.uniqueChanceCap);
      prev = p;
    }
    expect(depthUniqueChance(10)).toBeCloseTo(0.03, 5);
    expect(depthUniqueChance(1000)).toBe(T.depths.uniqueChanceCap);
    expect(depthRewardInfo(10).uniqueChance).toBe(depthUniqueChance(10));
    expect(depthRewardInfo(7).uniqueChance).toBe(0);
  });

  it('the long-run rate stays under one piece per ~15-20 days: a depth boss pays once, and one boss per 3 days is the fastest a hero can push', () => {
    // Expected pieces per boss depth cleared: every unique of the borrowed boss plus its relic, each at the (capped) chance.
    const worst = Math.max(...DEPTH_BOSS_POOLS.map((p) => ((UNIQUE_BOSS_DROPS[p]?.length ?? 0) + 1) * T.depths.uniqueChanceCap));
    expect(worst).toBeLessThanOrEqual(0.15 + 1e-9);
    // A depth is banked, so it can only be cleared (and rolled) once: the next run starts one below the deepest cleared.
    const s = recordDungeonRun(defaultSave(), stageOfDepth(1), 12);
    expect(nextDepthStage(s)).toBe(stageOfDepth(13));
    // days per piece when the hero clears a boss depth every 3 days (a very fast push at the frontier) -> at least 20
    expect(3 / worst).toBeGreaterThanOrEqual(20 - 1e-6);
  });

  it('depth bosses roll the pieces of the borrowed biome boss only', () => {
    const all = (d: number) => {
      let u = 0;
      let r = 0;
      for (let i = 0; i < 4000; i++) {
        const pieces = rollDepthBossUniques(d, Math.random);
        for (const p of pieces) expect(UNIQUE_BOSS_DROPS[depthBossPool(d)]).toContain(p.templateId);
        u += pieces.length;
        r += rollDepthBossRelics(d, Math.random).length;
      }
      return [u, r];
    };
    const [u, r] = all(10);
    const expected = 4000 * depthUniqueChance(10);
    expect(r).toBeGreaterThan(expected * 0.5);
    expect(r).toBeLessThan(expected * 1.7);
    expect(u).toBeGreaterThanOrEqual(0);
    // luck (Sorte Grande) multiplies the same draw
    expect(rollDepthBossUniques(10, () => 0.9 * depthUniqueChance(10), 1)).toHaveLength(UNIQUE_BOSS_DROPS[25].length);
    expect(rollDepthBossUniques(10, () => 1.5 * depthUniqueChance(10), 1)).toHaveLength(0);
    expect(rollDepthBossUniques(10, () => 1.5 * depthUniqueChance(10), 2)).toHaveLength(UNIQUE_BOSS_DROPS[25].length);
  });

  it('the depths unlock with the floor-100 boss, and the next boss depth is read from the deepest one', () => {
    const s = defaultSave();
    expect(depthsUnlocked(s)).toBe(false);
    expect(depthsUnlocked({ ...s, dungeonCheckpoints: [25, 50, 75, 100] })).toBe(true);
    expect(nextBossDepth(1)).toBe(10);
    expect(nextBossDepth(10)).toBe(10);
    expect(nextBossDepth(11)).toBe(20);
  });
});

describe('Profundezas: record, achievements, title, codex', () => {
  it('a run records the deepest depth; floor runs never do; the record only goes up', () => {
    let s = recordDungeonRun(defaultSave(), 95, 6); // floors 95..100
    expect(deepestDepth(s)).toBe(0);
    s = recordDungeonRun(s, stageOfDepth(1), 5);
    expect(deepestDepth(s)).toBe(5);
    s = recordDungeonRun(s, stageOfDepth(6), 3);
    expect(deepestDepth(s)).toBe(8);
    s = recordDungeonRun(s, stageOfDepth(9), 0); // died on the first wave
    expect(deepestDepth(s)).toBe(8);
    expect(s.stats.bossesKilled).toBe(1);
    s = recordDungeonRun(s, stageOfDepth(9), 2); // depths 9 and 10: a boss among them
    expect(deepestDepth(s)).toBe(10);
    expect(s.stats.bossesKilled).toBe(2);
    expect(s.stats.dungeonKills.depthBoss25).toBe(1);
  });

  it('five achievements and one title, all small, none of them visible to the progression simulator', () => {
    const depthQ = QUESTS_ACHIEVEMENTS.filter((q) => q.metric === 'max_depth');
    expect(depthQ.map((q) => q.target)).toEqual([1, 10, 25, 50, 100]);
    expect(depthQ.filter((q) => q.titleId)).toHaveLength(1);
    for (const q of depthQ) {
      expect(q.gold).toBeLessThanOrEqual(3000);
      expect(q.shards).toBeLessThanOrEqual(15);
      // the simulator passes no lifetime statistics, so the metric reads 0 for it
      expect(questProgress(q, emptyQuestState(), { cp: 99999, maxRefine: 8 })).toBe(0);
      expect(questProgress(q, emptyQuestState(), { cp: 0, maxRefine: 0, stats: { ...emptyStats(), deepestDepth: 60 } })).toBe(60);
      for (const tree of [pt, en]) {
        const quests = (tree as unknown as { quests: Record<string, string> }).quests;
        expect(typeof quests[q.nameKey]).toBe('string');
        expect(typeof quests[q.descKey]).toBe('string');
      }
    }
    expect(getTitleDef('title_depths_walker')).toBeDefined();
  });

  it('the four depth bosses are in the codex with the pieces of their borrowed boss', () => {
    const depth = CODEX_MONSTERS.filter((m) => m.depthPool);
    expect(depth.map((m) => m.depthPool)).toEqual([...DEPTH_BOSS_POOLS]);
    for (const m of depth) {
      expect(monsterDrops(m).length).toBeGreaterThan(0);
      for (const tree of [pt, en]) expect(typeof (tree as unknown as { enemies: Record<string, string> }).enemies[m.nameKey]).toBe('string');
    }
  });
});

describe('Paragon', () => {
  const start = paragonStartXp();
  const atLevel = (n: number): number => {
    let xp = start;
    for (let i = 1; i <= n; i++) xp += paragonLevelXp(i);
    return xp;
  };

  it('starts where hero level 100 begins, and a hero below it has paragon level 0', () => {
    expect(start).toBe(xpToReachLevel(100));
    expect(playerLevel(start)).toBe(100);
    expect(paragonLevel(0)).toBe(0);
    expect(paragonLevel(start - 1)).toBe(0);
    expect(paragonLevel(start)).toBe(0);
    expect(paragonLevel(Number.NaN)).toBe(0);
  });

  it('levels come from the XP, one at a time, each a little dearer than the last', () => {
    for (let n = 1; n <= 60; n++) {
      expect(paragonLevel(atLevel(n))).toBe(n);
      expect(paragonLevel(atLevel(n) - 1)).toBe(n - 1);
      expect(paragonLevelXp(n + 1)).toBeGreaterThanOrEqual(paragonLevelXp(n));
    }
    const p = paragonProgress(atLevel(3) + 10);
    expect([p.level, p.into]).toEqual([3, 10]);
  });

  it('the damage bonus is +1% per level (Rodada 15) and capped at +50%, reached at paragon level 50', () => {
    expect(paragonDamageBonus(0)).toBe(0);
    expect(paragonDamageBonus(10)).toBeCloseTo(0.1);
    expect(paragonDamageBonus(50)).toBeCloseTo(0.5);
    expect(paragonDamageBonus(5000)).toBe(T.paragon.maxBonus);
    expect(T.paragon.maxBonus / T.paragon.damagePerLevel).toBeCloseTo(50, 6);
  });

  it('raises the hero damage by exactly the bonus, and changes nothing below level 100', () => {
    const base = { ...defaultSave(), xp: start - 1 };
    const withParagon = { ...defaultSave(), xp: atLevel(20) };
    const plain = buildCombatStats({ ...defaultSave(), xp: start });
    expect(buildCombatStats(withParagon).dmgBase / plain.dmgBase).toBeCloseTo(1 + paragonDamageBonus(20), 6);
    // bit-identical below the cap: the bonus term is exactly 1
    expect(buildCombatStats(base).dmgBase).toBe(buildCombatStats({ ...base }).dmgBase);
    expect(paragonDamageBonus(paragonLevel(base.xp))).toBe(0);
  });

  it('XP past level 100 survives a save round trip (it used to be reset to zero); a tampered giant does not', () => {
    const paragon: SaveData = { ...defaultSave(), xp: atLevel(12) };
    const back = normalizeSave(JSON.parse(JSON.stringify(paragon)) as SaveData);
    expect(back.xp).toBe(paragon.xp);
    expect(paragonLevel(back.xp)).toBe(12);
    const giant = normalizeSave(JSON.parse(JSON.stringify({ ...paragon, xp: 1e300 })) as SaveData);
    expect(giant.xp).toBe(0);
  });
});

describe('Profundezas: saves', () => {
  it('an old save (no depth record) loads with depth 0 and the same everything else; the stats parser tolerates garbage', () => {
    const old = JSON.parse(JSON.stringify(defaultSave())) as SaveData;
    delete (old.stats as Partial<typeof old.stats>).deepestDepth;
    const loaded = normalizeSave(old);
    expect(loaded.stats.deepestDepth).toBe(0);
    expect(deepestDepth(loaded)).toBe(0);
    expect(loaded.highestDungeonFloor).toBe(defaultSave().highestDungeonFloor);
    expect(normalizeStats({ deepestDepth: 'x' }).deepestDepth).toBe(0);
    expect(normalizeStats({ deepestDepth: -4 }).deepestDepth).toBe(0);
    expect(normalizeStats({ deepestDepth: 37.9 }).deepestDepth).toBe(37);
    expect(normalizeStats({ deepestDepth: 1e30 }).deepestDepth).toBeLessThanOrEqual(1e12);
    const deep = normalizeSave(JSON.parse(JSON.stringify({ ...defaultSave(), stats: { ...emptyStats(), deepestDepth: 44 } })) as SaveData);
    expect(deep.stats.deepestDepth).toBe(44);
    expect(deep.highestDungeonFloor).toBeLessThanOrEqual(MAX_DUNGEON_FLOOR);
  });
});

describe('Profundezas: the stage maths stays total', () => {
  it('scale is finite for absurd depths and recommends a finite CP', () => {
    for (const d of [0, 1, 99, 100, 1000]) {
      const s = depthScale(stageOfDepth(d));
      expect(Number.isFinite(s.hp) && Number.isFinite(s.dmg)).toBe(true);
    }
  });
});
