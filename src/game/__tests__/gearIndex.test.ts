import { describe, expect, it } from 'vitest';
import { BEST_GEAR_INDEX, equipmentIndex, gearSetFor, INDEX_SLOTS, RARITY_BONUS, REFINE_PER_LEVEL } from '../gearIndex';
import { HUNTING_ZONES, HUNTING_DEPTHS, subLevelGearRequired } from '../huntingZones';
import { maxRefineFor } from '../gear';
import { CLASS_MAIN, classHero } from '../../../scripts/sim/classHero';
import { buildHero } from '../../../scripts/sim/ladder';
import T from '../tunables';

// The equipment index the Hunting sub-level gate reads (gearIndex.ts). Three ways it could break without anybody seeing it on the screen.
describe('the equipment index', () => {
  it('an empty slot counts 0 and the divisor is always 7: taking a piece off LOWERS the index (otherwise the worst piece would be taken off to unlock more)', () => {
    const full = buildHero(100, 6, 8, 100);
    const index = equipmentIndex(full);
    expect(INDEX_SLOTS).toHaveLength(7);
    for (const slot of INDEX_SLOTS) {
      const off = equipmentIndex({ ...full, equipped: { ...full.equipped, [slot]: null } });
      expect(off, `without the ${slot}`).toBeLessThan(index);
    }
    // all seven slots of one tier / refine: exactly tier + 0.1 x refine
    expect(index).toBeCloseTo(6 + REFINE_PER_LEVEL * 8, 3);
    // the worst piece off must not beat the set: a tier 6 +8 set with the ring taken off is (6.8 x 6) / 7
    expect(equipmentIndex({ ...full, equipped: { ...full.equipped, ring: null } })).toBeCloseTo((6.8 * 6) / 7, 3);
  });

  it('is the SAME for the three classes in gear of the same tier, refine and rarity (that is why the gate reads it and not the CP)', () => {
    for (const [tier, level, refine] of [[3, 45, 8], [5, 75, 8], [6, 100, 12]] as [number, number, number][])
      for (const rarity of ['common', 'epic', 'legendary'] as const) {
        const idx = CLASS_MAIN.map((b) => equipmentIndex(classHero(b, level, tier, refine, 'real', 100, rarity)));
        expect(idx[1], `archer T${tier}+${refine} ${rarity}`).toBe(idx[0]);
        expect(idx[2], `mage T${tier}+${refine} ${rarity}`).toBe(idx[0]);
        expect(idx[0]).toBeCloseTo(tier + REFINE_PER_LEVEL * refine + RARITY_BONUS[rarity], 3);
      }
  });

  it('the set the text names ("your gear must match a tier N +R set") always reaches the requirement it names, in every gated zone, depth and sub-level, and never asks more than a piece can have', () => {
    for (const z of HUNTING_ZONES.filter((x) => x.subLevelGear))
      for (const d of HUNTING_DEPTHS)
        for (let n = 2; n <= T.hunting.subLevels; n++) {
          const need = subLevelGearRequired(z, d.id, n);
          const set = gearSetFor(need);
          expect(set.tier + REFINE_PER_LEVEL * set.refine + RARITY_BONUS[set.rarity], `${z.id} ${d.id} ${n}`).toBeGreaterThanOrEqual(need - 1e-9);
          expect(set.refine, `${z.id} ${d.id} ${n}`).toBeLessThanOrEqual(maxRefineFor({ tier: set.tier }));
        }
    expect(gearSetFor(BEST_GEAR_INDEX)).toEqual({ tier: 6, refine: 12, rarity: 'legendary' });
  });
});
