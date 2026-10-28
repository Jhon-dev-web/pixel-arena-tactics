import { describe, expect, it } from 'vitest';
import { buildCombatStats, computeCP, effectiveRotation } from '../engine';
import { affinityBonuses } from '../affinity';
import { getGear } from '../gear';
import { bossKill, gearOnly, realHero, withMode } from '../../../scripts/sim/duel';
import { runDungeon, withSeededRandom } from '../../../scripts/sim/driver';
import { CLASS_MAIN, CLASS_VARIANTS, classHero } from '../../../scripts/sim/classHero';
import { buildHero, ladder } from '../../../scripts/sim/ladder';

// The tools of the class balance round (phase 8, docs/CLASSES_E_EQUIPAMENTOS.md 2.5): the heroes it measures must be the heroes it says, and the measure must be the real loop.
const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();

describe('class heroes of the balance tools', () => {
  for (const b of [...CLASS_MAIN, ...CLASS_VARIANTS]) {
    it(`${b.id}: seven pieces of the tier, the weapon of its family, the class affinity active, a full automatic rotation`, () => {
      for (const tier of [2, 3, 6]) {
        const h = classHero(b, 100, tier, 8);
        const worn = Object.values(h.equipped).filter(Boolean) as string[];
        expect(worn, `tier ${tier}`).toHaveLength(7);
        const items = worn.map((id) => getGear(h.gearInstances[id].templateId));
        expect(items.every((g) => g.tier === tier), `tier ${tier}`).toBe(true);
        const a = affinityBonuses(items);
        expect(a.classActive, `${b.id} T${tier}`).toBe(true);
        expect(a.weight).toBe(b.cls === 'warrior' ? 'plate' : b.cls === 'archer' ? 'leather' : 'cloth');
        expect(effectiveRotation(h), `${b.id} T${tier}`).toHaveLength(4);
      }
    });
  }

  it('the modes switch exactly what they say: gear = no rotation and no affinity, rotation = abilities only, real = both', () => {
    const base = classHero(CLASS_MAIN[1], 100, 6, 8, 'gear');
    expect(effectiveRotation(base)).toEqual([]);
    expect(buildCombatStats(withMode(base, 'gear')).rotation ?? []).toEqual([]);
    const rot = withMode(base, 'rotation');
    expect(effectiveRotation(rot)).toHaveLength(4);
    expect(rot.noAffinity).toBe(true);
    const real = realHero(base);
    expect(effectiveRotation(real)).toHaveLength(4);
    expect(real.noAffinity).toBeUndefined();
    // the rotation and the affinity are worth CP, in that order
    expect(computeCP(rot)).toBeGreaterThan(computeCP(gearOnly(base)));
    expect(computeCP(real)).toBeGreaterThan(computeCP(rot));
  });

  it('buildHero stays gear-only by default (the equipment audits and round14 / round17 depend on it) and the recommended-CP ladder is the rotation one', () => {
    expect(effectiveRotation(buildHero(50, 3, 4))).toEqual([]);
    expect(buildHero(50, 3, 4).noAffinity).toBe(true);
    expect(effectiveRotation(ladder()[ladder().length - 1].hero).length).toBeGreaterThan(0);
  });
});

describe('the real-loop measure of the boss', () => {
  it('an immortal hero finishes a fight he would lose, and only a run that asks for the waves carries them', () => {
    const weak = buildHero(1, 0, 0, 100);
    const mortal = withSeededRandom(1, () => runDungeon({ ...weak, highestDungeonFloor: 60 }, NOW, 1));
    expect(mortal.outcome).toBe('defeat');
    expect('waveMs' in mortal).toBe(false);
    const immortal = withSeededRandom(1, () => runDungeon({ ...weak, highestDungeonFloor: 60 }, NOW, 1, undefined, { immortal: true, trackWaves: true }));
    expect(immortal.stages).toBe(1);
    expect(immortal.waveMs).toHaveLength(1);
    expect(immortal.waveMs![0]).toBeGreaterThan(0);
    expect(immortal.waveTaken![0]).toBeGreaterThan(0);
  });

  it('bossKill is deterministic, and a hero with the rotation kills a boss no slower than the same hero without it', () => {
    const real = classHero(CLASS_MAIN[0], 100, 6, 8, 'rotation');
    const gear = classHero(CLASS_MAIN[0], 100, 6, 8, 'gear');
    const a = bossKill(real, 50, NOW, 6);
    expect(bossKill(real, 50, NOW, 6)).toEqual(a);
    expect(a.ms).toBeLessThanOrEqual(bossKill(gear, 50, NOW, 6).ms);
  });
});
