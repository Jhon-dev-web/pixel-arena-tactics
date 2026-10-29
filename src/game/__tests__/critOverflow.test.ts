import { describe, expect, it } from 'vitest';
import { CLASS_MAIN, classHero } from '../../../scripts/sim/classHero';
import { buildCombatStats, computeCP, SaveData } from '../engine';
import { createGearInstance } from '../gearInstances';
import { critOverflow } from '../derivedStats';

// THE RULE: crit chance past 100 % must not vanish. engine.ts holds the chance at 1 (it is a probability), and for a long time the excess was simply dropped, so a hero at the cap gained NOTHING from a tier 6 piece
// over a tier 4 one (measured 29/10: a rare bow at tier 4 +8 with a crit substat on all 7 pieces already hits 1.002, and tiers 5 and 6 add 0.10 and 0.19 that were thrown away). Nothing on screen shows it, the
// number just does not move. The excess now comes back as crit multiplier (derivedStats.ts critOverflow), in the SAME stats the fight and the CP both read.
const ARCHER = CLASS_MAIN[1];

// The archer of a tier, every worn piece rare with ONE crit-chance substat of `pct` percent (the worst case: the substat is rolled among 6 types, so a real hero has about 1 piece in 7 with it).
function archerWithCritSubs(tier: number, pct: number): SaveData {
  const hero = classHero(ARCHER, 100, tier, 8, 'real', 100, 'common');
  const instances = { ...hero.gearInstances };
  for (const id of Object.values(hero.equipped as unknown as Record<string, string | undefined>)) {
    const old = id ? instances[id] : undefined;
    if (old) instances[id as string] = createGearInstance(old.templateId, { id: old.id, origin: 'craft', rarity: 'rare', substats: [{ type: 'critRate', value: pct }], upgrade: old.upgrade });
  }
  return { ...hero, gearInstances: instances };
}
// The expected damage factor of a swing: what the fight and CP both multiply the base hit by.
const critFactor = (s: { critChance: number; critMult: number }) => 1 + s.critChance * (s.critMult - 1);

describe('crit chance past 100 %', () => {
  it('a stronger crit substat on a hero already over the cap still raises its damage and its CP', () => {
    const lo = archerWithCritSubs(6, 6.5); // the median roll of tier 6: 0.737 + 7 x 0.065 = 1.19 raw
    const hi = archerWithCritSubs(6, 9);
    const a = buildCombatStats(lo);
    const b = buildCombatStats(hi);
    expect(a.critChance).toBe(1);
    expect(b.critChance).toBe(1);
    expect(b.critMult).toBeGreaterThan(a.critMult);
    expect(critFactor(b)).toBeGreaterThan(critFactor(a));
    // The CP reads the same stats: if it did not see the excess it would call the two heroes equal while the fight tells them apart.
    expect(computeCP(hi)).toBeGreaterThan(computeCP(lo));
  });

  it('a hero exactly at 100 % gets nothing for free, and one below the cap keeps the multiplier it had', () => {
    const bare = buildCombatStats(archerWithCritSubs(6, 2)); // raw 0.737 + 7 x 0.02 = 0.877
    const below = buildCombatStats(archerWithCritSubs(6, 3)); // 0.947
    expect(below.critChance).toBeLessThan(1);
    expect(below.critMult).toBeCloseTo(bare.critMult, 9);
    // 7 pieces x pct = (1 - 0.737) x 100 -> raw exactly 1.
    const bare0 = buildCombatStats(archerWithCritSubs(6, 0)).critChance;
    const exact = buildCombatStats(archerWithCritSubs(6, ((1 - bare0) * 100) / 7));
    expect(exact.critChance).toBeCloseTo(1, 9);
    expect(exact.critMult).toBeCloseTo(bare.critMult, 9);
  });

  it('critOverflow: nothing at or below 100 %, a share of the chance\'s worth above it, and never a chance over 1', () => {
    expect(critOverflow(0.4, 2.5, 0.5)).toEqual({ chance: 0.4, mult: 2.5 });
    expect(critOverflow(1, 2.5, 0.5)).toEqual({ chance: 1, mult: 2.5 });
    const over = critOverflow(1.2, 2.5, 0.5);
    expect(over.chance).toBe(1);
    expect(over.mult).toBeCloseTo(2.5 + 0.5 * 0.2 * 1.5, 12);
    // share 1 = as if the chance had never been capped: the expected factor is exactly the uncapped one.
    expect(critFactor((({ chance, mult }) => ({ critChance: chance, critMult: mult }))(critOverflow(1.2, 2.5, 1)))).toBeCloseTo(1 + 1.2 * 1.5, 12);
    // a broken input never makes NaN or a multiplier below the one it came with
    expect(critOverflow(Number.NaN, 2.5, 0.5).mult).toBe(2.5);
    expect(critOverflow(2, 0.5, 0.5).mult).toBeGreaterThanOrEqual(0.5);
  });
});
