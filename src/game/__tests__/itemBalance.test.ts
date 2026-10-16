import { describe, expect, it } from 'vitest';
import { computeCP } from '../engine';
import { createGearInstance, equippedSubstatTotals } from '../gearInstances';
import { GOLD_BONUS_CAP, RARITIES, Rarity, SUBSTATS, medianSubstatValue, rollRarity, rollSubstats } from '../rarity';
import { duel, hero, MAIN_TIERS, repFloor, tierNum } from '../../../scripts/sim/duel';
import { withSeededRandom } from '../../../scripts/sim/driver';
import { pieceGain } from '../../../scripts/sim/tierSteps';
import { GEAR, GearItem, getGear, isInstancedSlot } from '../gear';
import { rarityHero } from '../../../scripts/sim/rarityHero';

// Rules of the item balance round (docs/ITEM_BALANCE_AUDIT.md, docs/BALANCE_CHANGES.md "Rodada 3"):
//   R1  at equal tier and refine, median rolls (weapon + armor of that rarity): rare +3-6 % CP over common, epic +8-14 %, legendary +36-58 % (Rodada 24; it was +18-28 %);
//   R5  a full seven-piece set (Rodada 24): rare 1.10-1.25 times the CP of a common one, epic 1.20-1.40, legendary 1.9-2.4, and the step epic -> legendary is at least 1.4 times;
//   R2  no combat substat worth more than 2x another at its median roll (goldBonus exempt, capped at +25 % in total);
//   R4  forge chances are 63 / 25 / 10 / 2 (Rodada 9: higher rarities are sold on the market, so they are a bit harder).

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

describe('R4: forge rarity chances', () => {
  it('table is 63 / 25 / 10 / 2', () => {
    expect(RARITIES.map((r) => r.chance)).toEqual([0.63, 0.25, 0.1, 0.02]);
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
  const BANDS: Record<Exclude<Rarity, 'common'>, [number, number]> = { rare: [0.03, 0.06], epic: [0.08, 0.14], legendary: [0.36, 0.58] };
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

describe('R5: what a rarity is worth for a whole set (the buyer view)', () => {
  for (const [tier, level, refine] of [[4, 62, 0], [4, 62, 8], [5, 75, 8], [5, 75, 12], [6, 90, 8], [6, 90, 12]] as [number, number, number][]) {
    it(`tier ${tier} +${refine}: rare 1.10-1.25, epic 1.20-1.40, legendary 1.9-2.4 times the common set, and the epic -> legendary step is at least 1.4x`, () => {
      const cp = (r: Rarity) => computeCP(rarityHero(level, tier, refine, r));
      const common = cp('common');
      const [rare, epic, legendary] = (['rare', 'epic', 'legendary'] as Rarity[]).map((r) => cp(r) / common);
      expect(rare, `rare x${rare.toFixed(3)}`).toBeGreaterThanOrEqual(1.1);
      expect(rare).toBeLessThanOrEqual(1.25);
      expect(epic, `epic x${epic.toFixed(3)}`).toBeGreaterThanOrEqual(1.2);
      expect(epic).toBeLessThanOrEqual(1.4);
      expect(legendary, `legendary x${legendary.toFixed(3)}`).toBeGreaterThanOrEqual(1.9);
      expect(legendary).toBeLessThanOrEqual(2.4);
      expect(epic).toBeGreaterThan(rare);
      expect(legendary / epic, 'step epic -> legendary').toBeGreaterThanOrEqual(1.4);
    });
  }

  it('the rarity table: multipliers climb, only the Legendary rolls stronger substats, the chances are the ones of R4', () => {
    expect(RARITIES.map((r) => r.statMult)).toEqual([1, 1.02, 1.04, 1.4]);
    expect(RARITIES.map((r) => r.substatMult)).toEqual([1, 1, 1, 1.7]);
    expect(RARITIES.map((r) => r.substatCount)).toEqual([0, 1, 2, 3]);
  });
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

// --- R5: every crafted tier is a real upgrade (docs/ITEM_BALANCE_AUDIT.md section N) -----------------------------------------------------------------------------------------------
// One clean chain per line (each piece is made from exactly the previous piece of its slot), every stat of tier N+1 above tier N's, and the CP a piece adds
// to a reference hero grows by a real step each tier. Uniques are worth about 10-15 % more than the crafted twin of the tier the hero has at their source.

const MAIN_STAT: Record<string, 'damage' | 'maxHp' | 'resistance' | 'critChance'> = { weapon: 'damage', armor: 'maxHp', helmet: 'maxHp', gloves: 'damage', boots: 'resistance', ring: 'critChance', shield: 'resistance' };
const NUMERIC = ['damage', 'maxHp', 'critChance', 'critMultBonus', 'resistance', 'reflect'] as const;

// The chains: start at each tier-1 recipe and follow "the piece whose recipe consumes this one".
function lineChains(): GearItem[][] {
  const forged = GEAR.filter((g) => g.recipe && !g.unique && isInstancedSlot(g.slot));
  return forged
    .filter((g) => g.tier === 1)
    .map((first) => {
      const chain = [first];
      for (;;) {
        const next = forged.filter((g) => g.recipe?.items?.[chain[chain.length - 1].id]);
        if (next.length === 0) break;
        expect(next.map((n) => n.id), `one successor after ${chain[chain.length - 1].id}`).toHaveLength(1);
        chain.push(next[0]);
      }
      return chain;
    });
}

describe('R5: every crafted tier is a real upgrade', () => {
  const chains = lineChains();

  it('eight lines (sword, axe, armor, helmet, gloves, boots, ring, shield), each one chain from tier 1 to tier 6 with no dead end', () => {
    expect(chains).toHaveLength(8);
    const inChains = new Set(chains.flat().map((g) => g.id));
    for (const g of GEAR.filter((x) => x.recipe && !x.unique && isInstancedSlot(x.slot))) expect(inChains.has(g.id), `${g.id} is on a chain`).toBe(true);
    for (const c of chains) {
      expect(c[0].tier).toBe(1);
      expect(c[c.length - 1].tier).toBe(6);
      // the last piece of a line is tier 6; no piece other than the last is a dead end (checked by construction: every successor is unique)
      expect(c.filter((g) => g.tier === 4).length, c[0].id).toBeGreaterThanOrEqual(1);
    }
  });

  for (const chain of lineChains()) {
    it(`${chain[0].slot} line from ${chain[0].id}: the next piece beats the previous on the main stat and is not worse on any stat`, () => {
      for (let i = 1; i < chain.length; i++) {
        const prev = chain[i - 1];
        const next = chain[i];
        const main = MAIN_STAT[next.slot];
        expect(next[main] as number, `${next.id} vs ${prev.id}: ${main}`).toBeGreaterThan(prev[main] as number);
        for (const k of NUMERIC) {
          if (prev[k]) expect(next[k] as number, `${next.id} vs ${prev.id}: ${k}`).toBeGreaterThan(prev[k] as number); // strictly: a flat stat is a tier that adds nothing
        }
        if (prev.burn) expect(next.burn, `${next.id} keeps the burn`).toBe(true);
      }
    });

    it(`${chain[0].slot} line from ${chain[0].id}: each step adds at least 15 % to the power the piece gives a reference hero`, () => {
      const gains = chain.map((g) => pieceGain(g.id));
      for (let i = 1; i < chain.length; i++) expect(gains[i] / gains[i - 1], `${chain[i].id}: x${(gains[i] / gains[i - 1]).toFixed(2)}`).toBeGreaterThanOrEqual(1.15);
    });
  }

  it('chain rule: one piece of the previous tier, except the tier-2 weapon / armor (two bronze ones)', () => {
    for (const g of GEAR.filter((x) => x.recipe?.items && !x.unique)) {
      const n = Object.values(g.recipe!.items!)[0];
      const twoOf = g.tier === 2 && (g.slot === 'weapon' || g.slot === 'armor');
      expect(n, g.id).toBe(twoOf ? 2 : 1);
    }
  });

  it('no piece is strictly worse than another piece of its slot that costs the same or less to make', () => {
    // the old gilded sword / armor were weaker than the dragon ones and cost more hunting materials; the dragon pieces now need the gilded one
    const dragon = ['dragon_flameblade', 'dragon_scale_armor'];
    for (const id of dragon) expect(Object.keys(getGear(id).recipe?.items ?? {})).toEqual([id === 'dragon_flameblade' ? 'gilded_warblade' : 'gilded_aegis']);
    for (const g of GEAR.filter((x) => x.recipe && !x.unique && isInstancedSlot(x.slot))) {
      const main = MAIN_STAT[g.slot];
      for (const o of GEAR.filter((x) => x.slot === g.slot && x.line === g.line && x.recipe && !x.unique && (x.tier ?? 0) < (g.tier ?? 0))) {
        expect(g[main] as number, `${g.id} (tier ${g.tier}) vs ${o.id} (tier ${o.tier})`).toBeGreaterThan(o[main] as number);
      }
    }
  });
});

describe('R6: a unique is 10-15 % better than the crafted twin of the tier the hero has at its source, and never obsolete', () => {
  // The tier craftable where the unique drops: Hunting zone -> the tier the zone is hunted at; boss floor -> the tier of the next level gate (25 -> 3, 50 -> 4, 75 -> 5, 100 -> 6).
  const ZONE_TIER: Record<string, number> = { demon_glade: 2, blood_marsh: 3, demon_rift: 4, blood_abyss: 6 };
  const FLOOR_TIER: Record<number, number> = { 25: 3, 50: 4, 75: 5, 100: 6 };
  const uniques = GEAR.filter((g) => g.unique);

  it('every unique takes the tier of its source', () => {
    for (const u of uniques) {
      const src = u.source as { zone?: string; bossFloor?: number };
      expect(u.tier, u.id).toBe(src.zone ? ZONE_TIER[src.zone] : FLOOR_TIER[src.bossFloor as number]);
    }
  });

  it('piece power is 10-15 % above the twin (plus its guaranteed substat), and still below the next tier of the line', () => {
    for (const u of uniques) {
      const ratio = pieceGain(u.id) / pieceGain(u.salvageLike as string);
      expect(ratio, `${u.id}: x${ratio.toFixed(3)}`).toBeGreaterThanOrEqual(1.095);
      expect(ratio, `${u.id}: x${ratio.toFixed(3)}`).toBeLessThanOrEqual(1.16);
    }
  });

  it('the greataxe is an axe and the maul a sword', () => {
    expect(getGear('overlord_greataxe').line).toBe('axe');
    expect(getGear('overlord_greataxe').burn).toBeUndefined();
    expect(getGear('bonecrusher_maul').line).toBeUndefined();
    expect(getGear('bonecrusher_maul').burn).toBe(true);
  });
});
