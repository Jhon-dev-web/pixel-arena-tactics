import { describe, expect, it } from 'vitest';
import { computeCP } from '../engine';
import { createGearInstance, equippedSubstatTotals } from '../gearInstances';
import { GOLD_BONUS_CAP, RARITIES, Rarity, SUBSTATS, medianSubstatValue, rollRarity, rollSubstats } from '../rarity';
import { duel, hero, MAIN_TIERS, repFloor, tierNum } from '../../../scripts/sim/duel';
import { withSeededRandom } from '../../../scripts/sim/driver';

// Rules of the item balance round (docs/ITEM_BALANCE_AUDIT.md, docs/BALANCE_CHANGES.md "Rodada 3"):
//   R1  at equal tier and refine, median rolls: rare +3-6 % CP over common, epic +8-14 %, legendary +18-28 %;
//   R2  no combat substat worth more than 2x another at its median roll (goldBonus exempt, capped at +25 % in total);
//   R4  forge chances stay 60 / 25 / 12 / 3.

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

describe('R4: forge rarity chances', () => {
  it('table is 60 / 25 / 12 / 3', () => {
    expect(RARITIES.map((r) => r.chance)).toEqual([0.6, 0.25, 0.12, 0.03]);
  });

  it('realised rates of createGearInstance over 120k seeded rolls are within 0.5 points of the table', () => {
    const N = 120_000;
    const counts: Record<string, number> = {};
    withSeededRandom(2024, () => {
      for (let i = 0; i < N; i++) {
        const r = rollRarity();
        counts[r] = (counts[r] ?? 0) + 1;
      }
    });
    for (const r of RARITIES) expect(Math.abs(counts[r.id] / N - r.chance)).toBeLessThan(0.005);
  });
});

describe('R1: rarity power at median substat rolls (weapon + armor of that rarity)', () => {
  const BANDS: Record<Exclude<Rarity, 'common'>, [number, number]> = { rare: [0.03, 0.06], epic: [0.08, 0.14], legendary: [0.18, 0.28] };
  for (const tk of MAIN_TIERS) {
    for (const refine of [0, 8]) {
      it(`tier ${tk} +${refine}`, () => {
        const t = tierNum(tk);
        const base = computeCP(hero(tk, refine));
        for (const r of ['rare', 'epic', 'legendary'] as const) {
          const cps = withSeededRandom(11 + t, () => {
            const out: number[] = [];
            for (let i = 0; i < 301; i++) out.push(computeCP(hero(tk, refine, { rarity: r, wSubs: rollSubstats(r, t), aSubs: rollSubstats(r, t) })));
            return out;
          });
          const gain = median(cps) / base - 1;
          expect(gain, `${r} gain ${(gain * 100).toFixed(1)} %`).toBeGreaterThanOrEqual(BANDS[r][0]);
          expect(gain, `${r} gain ${(gain * 100).toFixed(1)} %`).toBeLessThanOrEqual(BANDS[r][1]);
        }
      });
    }
  }
});

describe('R2: combat substats are worth about the same at their median roll', () => {
  for (const tk of MAIN_TIERS) {
    it(`tier ${tk}: max/min of the real combat value (duel margin) <= 2x`, () => {
      const t = tierNum(tk);
      const base = hero(tk, 4);
      const fl = repFloor(base);
      const baseP = duel(base, fl).P;
      const values = SUBSTATS.filter((d) => d.type !== 'goldBonus').map((d) => {
        const s = hero(tk, 4, { aSubs: [{ type: d.type, value: medianSubstatValue(d, t) }] });
        return Math.log(duel(s, fl).P / baseP);
      });
      expect(Math.min(...values)).toBeGreaterThan(0);
      expect(Math.max(...values) / Math.min(...values)).toBeLessThanOrEqual(2);
    });
  }

  it('goldBonus never passes +25 % in total, whatever is equipped', () => {
    expect(GOLD_BONUS_CAP).toBe(25);
    const s = hero('6', 0, { wSubs: [{ type: 'goldBonus', value: 20 }], aSubs: [{ type: 'goldBonus', value: 20 }] });
    expect(equippedSubstatTotals(s).goldBonus).toBe(25);
    // a single legendary piece stays far below the cap at every tier
    for (const d of SUBSTATS.filter((x) => x.type === 'goldBonus')) {
      const inst = createGearInstance('abyssal_greatblade', { origin: 'craft', rarity: 'legendary', substats: [{ type: 'goldBonus', value: medianSubstatValue(d, 6) }] });
      expect(inst.substats[0].value).toBeLessThan(10);
    }
  });
});
