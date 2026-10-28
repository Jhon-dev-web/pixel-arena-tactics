import { describe, expect, it } from 'vitest';
import { buildCombatStats, computeCP, SaveData } from '../engine';
import { createGearInstance, equippedSubstatTotals } from '../gearInstances';
import { cargoReferenceValue } from '../economy';
import type { MaterialId } from '../materials';
import { GOLD_BONUS_CAP, RARITIES, Rarity, SUBSTATS, medianSubstatValue, rollRarity, rollSubstats } from '../rarity';
import { duel, hero, MAIN_TIERS, repFloor, tierNum, withNeutralReturns, withoutSetBonuses } from '../../../scripts/sim/duel';
import { withSeededRandom } from '../../../scripts/sim/driver';
import { pieceGain } from '../../../scripts/sim/tierSteps';
import { CLOTH_LINES, GEAR, GearItem, LEATHER_LINES, SWORD_TWINS, WEAPON_CRIT_KEEP, WEAPON_KEEP, WEAPON_LINES, gearRequiredLevel, getGear, isInstancedSlot, setFamiliesOf } from '../gear';
import { buildHero } from '../../../scripts/sim/ladder';
import { rarityHero } from '../../../scripts/sim/rarityHero';
import { getHuntingZone, subLevelGearRequired } from '../huntingZones';
import { equipmentIndex } from '../gearIndex';
import T from '../tunables';

// Rules of the item balance round (docs/ITEM_BALANCE_AUDIT.md, docs/BALANCE_CHANGES.md "Rodada 3"):
//   R1  at equal tier and refine, median rolls (weapon + armor of that rarity): rare +3-6 % CP over common, epic +13-20 %, legendary +40-65 % (Rodada 26; Rodada 24 had +8-14 % and +36-58 %);
//   R5  a full seven-piece set (Rodada 26): rare 1.10-1.25 times the CP of a common one, epic 1.30-1.55, legendary 1.9-2.4, and the step epic -> legendary is at least 1.5 times;
//   R2  no combat substat worth more than 2x another at its median roll (goldBonus exempt, capped at +25 % in total);
//   R4  forge chances are 61 / 25 / 10 / 4 (Rodada 9 had 63 / 25 / 10 / 2; Rodada 26 doubled the Legendary because the market had too few and added a pity after 40 forges of tier 4+).

// The parity tests of the light lines judge the numbers the GENERATOR solves (gear.ts RETURNS_BASE: the CP-parity solution); the live pieces carry the phase 8 dial on top of them (gear.ts RETURN_SCALE), which is
// the class balance and is measured on the axes (scripts/sim/classBalance.sim.ts), not on CP. This keeps the guard on a stale generated block exactly as strict as it was.
const neutral = (fn: () => void) => () => withNeutralReturns(fn);

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

describe('R4: forge rarity chances', () => {
  it('table is 61 / 25 / 10 / 4', () => {
    expect(RARITIES.map((r) => r.chance)).toEqual([0.61, 0.25, 0.1, 0.04]);
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
  const BANDS: Record<Exclude<Rarity, 'common'>, [number, number]> = { rare: [0.03, 0.06], epic: [0.13, 0.2], legendary: [0.4, 0.65] };
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
    it(`tier ${tier} +${refine}: rare 1.10-1.25, epic 1.30-1.55, legendary 1.9-2.4 times the common set, and the epic -> legendary step is at least 1.5x`, () => {
      const cp = (r: Rarity) => computeCP(rarityHero(level, tier, refine, r));
      const common = cp('common');
      const [rare, epic, legendary] = (['rare', 'epic', 'legendary'] as Rarity[]).map((r) => cp(r) / common);
      expect(rare, `rare x${rare.toFixed(3)}`).toBeGreaterThanOrEqual(1.1);
      expect(rare).toBeLessThanOrEqual(1.25);
      expect(epic, `epic x${epic.toFixed(3)}`).toBeGreaterThanOrEqual(1.3);
      expect(epic).toBeLessThanOrEqual(1.55);
      expect(legendary, `legendary x${legendary.toFixed(3)}`).toBeGreaterThanOrEqual(1.9);
      expect(legendary).toBeLessThanOrEqual(2.4);
      expect(epic).toBeGreaterThan(rare);
      expect(legendary / epic, 'step epic -> legendary').toBeGreaterThanOrEqual(1.5);
    });
  }

  // Rodada 26: the Hunting sub-levels (the Abyss gate, an equipment index since 28/10) are where a rarity becomes levels. Same full set, same refine: the Epic opens two sub-levels more than the Common, the Legendary two more than the Epic
  // (the last one at tier 6, where the ten sub-levels run out).
  for (const [tier, level, refine] of [[4, 62, 8], [5, 75, 8], [6, 90, 8]] as [number, number, number][]) {
    it(`tier ${tier} +${refine}: the Epic set opens two more sub-levels than the Common one, the Legendary reaches the top`, () => {
      const zone = getHuntingZone('blood_abyss')!;
      const reach = (r: Rarity): number => {
        const index = equipmentIndex(rarityHero(level, tier, refine, r));
        let n = 1;
        while (n < T.hunting.subLevels && index >= subLevelGearRequired(zone, 'deep', n + 1)) n++;
        return n;
      };
      expect(reach('epic') - reach('common'), 'epic over common').toBeGreaterThanOrEqual(2);
      expect(reach('legendary') - reach('epic'), 'legendary over epic').toBeGreaterThanOrEqual(tier === 6 ? 1 : 2);
      expect(reach('legendary')).toBeGreaterThanOrEqual(tier === 4 ? 6 : 9);
    });
  }

  it('the rarity table: multipliers climb, only the Legendary rolls stronger substats, the chances are the ones of R4', () => {
    expect(RARITIES.map((r) => r.statMult)).toEqual([1, 1.02, 1.15, 1.5]);
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
const NUMERIC = ['damage', 'maxHp', 'critChance', 'critMultBonus', 'resistance', 'reflect', 'attackSpeedBonus', 'hpRegenPct'] as const;

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

  it('twenty-two lines (the eight plate ones - sword, axe, armor, helmet, gloves, boots, ring, shield - the five leather and the five cloth ones, and the four weapon lines of the classes reform), each one chain from tier 1 to tier 6 with no dead end', () => {
    expect(chains).toHaveLength(8 + 5 + 5 + 4);
    // the weapon chains never mix: sword (no `line`), axe, bow, crossbow, staff, scepter, six lines of six pieces
    expect(chains.filter((c) => c[0].slot === 'weapon').map((c) => c[0].line ?? 'sword').sort()).toEqual(['axe', 'bow', 'crossbow', 'scepter', 'staff', 'sword']);
    for (const c of chains.filter((x) => x[0].slot === 'weapon' && x[0].line)) expect(new Set(c.map((g) => g.line)).size, c[0].id).toBe(1);
    expect(chains.filter((c) => c[0].weight === 'leather').map((c) => c[0].slot).sort()).toEqual(['armor', 'boots', 'gloves', 'helmet', 'shield']);
    expect(chains.filter((c) => c[0].weight === 'cloth').map((c) => c[0].slot).sort()).toEqual(['armor', 'boots', 'gloves', 'helmet', 'shield']);
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
      // inside a weight: plate and leather of one slot trade the main stat for crit and speed, so the higher tier of a lighter weight is judged against its own line here and against the
      // plate line by the power it adds (the next test)
      for (const o of GEAR.filter((x) => x.slot === g.slot && x.line === g.line && x.weight === g.weight && x.recipe && !x.unique && (x.tier ?? 0) < (g.tier ?? 0))) {
        expect(g[main] as number, `${g.id} (tier ${g.tier}) vs ${o.id} (tier ${o.tier})`).toBeGreaterThan(o[main] as number);
      }
    }
  });
});

// --- R7: the leather line (classes reform, phase 2a; docs/CLASSES_E_EQUIPAMENTOS.md 2.4) ---------------------------------------------------------------------------------------------
// Parity is measured, not asserted by construction: the numbers come from scripts/sim/weightBudget.gen.ts, which solves them against the real CP, and this test fails when they go stale
// (a plate number changed, or somebody edited LEATHER_CONVERSION by hand).
describe('R7: the leather line', () => {
  const TIER_LEVEL = [1, 10, 25, 50, 70, 90];
  // the reference hero of tier t with the five weight pieces swapped for the leather ones (or not)
  const setHero = (t: number, leather: boolean, refine: number): SaveData => {
    const h = buildHero(TIER_LEVEL[t - 1], t, refine);
    if (!leather) return h;
    const instances = { ...h.gearInstances };
    const equipped = { ...h.equipped } as unknown as Record<string, string | null>;
    for (const l of LEATHER_LINES) {
      const inst = createGearInstance(l.ids[t - 1], { id: `gi_leather_${l.ids[t - 1]}`, origin: 'craft', rarity: 'common', substats: [], upgrade: refine });
      instances[inst.id] = inst;
      equipped[l.slot] = inst.id;
    }
    return { ...h, gearInstances: instances, equipped: equipped as unknown as SaveData['equipped'] };
  };

  for (const t of [1, 2, 3, 4, 5, 6]) {
    it(`tier ${t}: a full leather set (armor, helmet, gloves, boots, quiver) is within +-5 % of the CP of the full plate set, at +0, +4 and +8, with and without the set bonuses`, neutral(() => {
      for (const refine of [0, 4, 8]) {
        const plateNo = computeCP_noSets(setHero(t, false, refine));
        const leatherNo = computeCP_noSets(setHero(t, true, refine));
        expect(leatherNo / plateNo, `+${refine} pieces only`).toBeGreaterThanOrEqual(0.95);
        expect(leatherNo / plateNo, `+${refine} pieces only`).toBeLessThanOrEqual(1.05);
        const r = computeCP(setHero(t, true, refine)) / computeCP(setHero(t, false, refine));
        expect(r, `+${refine} with the set bonuses`).toBeGreaterThanOrEqual(0.95);
        expect(r, `+${refine} with the set bonuses`).toBeLessThanOrEqual(1.05);
      }
    }));
  }

  it('every leather piece is the lighter twin of a plate piece: same price and level gate, 60 % of the defense, crit and attack speed instead of reflect, and its own set family and look', () => {
    for (const l of LEATHER_LINES) {
      l.ids.forEach((id, i) => {
        const p = getGear(id);
        const twin = getGear(l.twins[i]);
        expect(p.weight, id).toBe('leather');
        expect(p.materialKey, id).toBe('material_leather');
        expect(p.tier, id).toBe(i + 1);
        expect(p.cost, id).toBe(twin.cost);
        expect(gearRequiredLevel(p), id).toBe(gearRequiredLevel(twin));
        expect(p.critChance ?? 0, id).toBeGreaterThan(0);
        expect(p.attackSpeedBonus ?? 0, id).toBeGreaterThan(0);
        expect(p.reflect, id).toBeUndefined();
        if (twin.maxHp) expect(p.maxHp, id).toBe(Math.round(twin.maxHp * 0.6));
        if (twin.resistance) expect(p.resistance!, id).toBeCloseTo(twin.resistance * 0.6, 4);
        expect(p.setFamily, id).toBe((['hide', 'scout', 'ranger', 'hunter', 'nightstalker', 'abyssalhide'] as const)[i]);
        if (l.slot === 'armor') expect(p.look, id).toBe(twin.look);
      });
    }
  });

  // (the cross-line check "adds more CP than the piece of the tier before" lived here until 28/10. CP stopped being the judge of class fairness (docs/CLASSES_E_EQUIPAMENTOS.md 2.5) and stopped opening and
  // closing anything (the Hunting depth and sub-level gates read the equipment index now, gearIndex.ts), so it no longer protects a promise. What replaces it is TWO guards: R8 at the end of this file (no piece
  // is strictly dominated by a lower-tier one) and classAxes.test.ts (each class beats its own axis by 15-20 % and none falls more than 10 % behind on the others).)

  it('cost parity: from tier 3 a leather piece asks for every hunting / refined family its plate twin asks for, and the total reference cost (Gold + materials) is within 15 % of the twin', () => {
    const own = (id: string): number => {
      const g = getGear(id);
      const r = g.recipe!;
      const gems = Object.values(r.gems ?? {}).reduce((a, b) => a + (b as number), 0);
      return g.cost + cargoReferenceValue((r.materials ?? {}) as Partial<Record<MaterialId, number>>) + (gems + (r.shards ?? 0)) * 4;
    };
    for (const l of LEATHER_LINES) {
      l.ids.forEach((id, i) => {
        const ratio = own(id) / own(l.twins[i]);
        expect(ratio, `${id}: ${ratio.toFixed(3)}`).toBeGreaterThanOrEqual(0.85);
        expect(ratio, `${id}: ${ratio.toFixed(3)}`).toBeLessThanOrEqual(1.15);
        if (i >= 2) {
          const mine = getGear(id).recipe!.materials!;
          for (const m of Object.keys(getGear(l.twins[i]).recipe!.materials!)) if (m !== 'leather' && m !== 'leather_scrap' && !m.startsWith('wood_handle_')) expect(mine[m as MaterialId], `${id} asks for ${m}`).toBeGreaterThan(0);
        }
      });
    }
  });

  it('the recipes follow the supply: leather + sinew (+ feather in the quiver, + the wood handle of the tier elsewhere), the quantities a few Hunting sessions can pay', () => {
    const HANDLES = ['wood_handle_common', 'wood_handle_oak', 'wood_handle_ebony', 'wood_handle_elven', 'wood_handle_ancient', 'wood_handle_ancient'];
    for (const l of LEATHER_LINES) {
      l.ids.forEach((id, i) => {
        const m = getGear(id).recipe!.materials!;
        expect(m.leather, id).toBeGreaterThan(0);
        // a 4 h session gives about 17 sinew to a new hero and 48 to a strong one; 32 feathers
        expect(m.beast_sinew, id).toBeGreaterThan(0);
        expect(m.beast_sinew!, id).toBeLessThanOrEqual(48);
        if (l.feather) {
          expect(m.feather!, id).toBeGreaterThan(0);
          expect(m.feather!, id).toBeLessThanOrEqual(32);
        } else expect(m.feather, id).toBeUndefined();
        const handles = Object.keys(m).filter((k) => k.startsWith('wood_handle_'));
        expect(handles, id).toEqual(l.handle ? [HANDLES[i]] : []);
      });
    }
  });
});

// --- R7 (cloth): the cloth line (classes reform, phase 2b; docs/CLASSES_E_EQUIPAMENTOS.md 2.4) ----------------------------------------------------------------------------------------
// Same rules as the leather line, with the cloth's own profile: crit multiplier + regeneration instead of crit chance + attack speed. The numbers come from the same generator (CLOTH_CONVERSION).
describe('R7: the cloth line', () => {
  const TIER_LEVEL = [1, 10, 25, 50, 70, 90];
  const setHero = (t: number, cloth: boolean, refine: number): SaveData => {
    const h = buildHero(TIER_LEVEL[t - 1], t, refine);
    if (!cloth) return h;
    const instances = { ...h.gearInstances };
    const equipped = { ...h.equipped } as unknown as Record<string, string | null>;
    for (const l of CLOTH_LINES) {
      const inst = createGearInstance(l.ids[t - 1], { id: `gi_cloth_${l.ids[t - 1]}`, origin: 'craft', rarity: 'common', substats: [], upgrade: refine });
      instances[inst.id] = inst;
      equipped[l.slot] = inst.id;
    }
    return { ...h, gearInstances: instances, equipped: equipped as unknown as SaveData['equipped'] };
  };

  for (const t of [1, 2, 3, 4, 5, 6]) {
    it(`tier ${t}: a full cloth set (robe, hood, gloves, boots, tome) is within +-5 % of the CP of the full plate set, at +0, +4 and +8, with and without the set bonuses`, neutral(() => {
      for (const refine of [0, 4, 8]) {
        const noSets = computeCP_noSets(setHero(t, true, refine)) / computeCP_noSets(setHero(t, false, refine));
        expect(noSets, `+${refine} pieces only`).toBeGreaterThanOrEqual(0.95);
        expect(noSets, `+${refine} pieces only`).toBeLessThanOrEqual(1.05);
        const sets = computeCP(setHero(t, true, refine)) / computeCP(setHero(t, false, refine));
        expect(sets, `+${refine} with the set bonuses`).toBeGreaterThanOrEqual(0.95);
        expect(sets, `+${refine} with the set bonuses`).toBeLessThanOrEqual(1.05);
      }
    }));
  }

  it('every cloth piece is the lighter twin of a plate piece: same price and level gate, 60 % of the defense, crit multiplier and regeneration instead of reflect and crit chance, and its own set family and look', () => {
    for (const l of CLOTH_LINES) {
      l.ids.forEach((id, i) => {
        const p = getGear(id);
        const twin = getGear(l.twins[i]);
        expect(p.weight, id).toBe('cloth');
        expect(p.materialKey, id).toBe('material_cloth');
        expect(p.tier, id).toBe(i + 1);
        expect(p.cost, id).toBe(twin.cost);
        expect(gearRequiredLevel(p), id).toBe(gearRequiredLevel(twin));
        expect(p.critMultBonus ?? 0, id).toBeGreaterThan(0);
        expect(p.hpRegenPct ?? 0, id).toBeGreaterThan(0);
        expect(p.reflect, id).toBeUndefined();
        expect(p.critChance, id).toBeUndefined();
        expect(p.attackSpeedBonus, id).toBeUndefined();
        if (twin.maxHp) expect(p.maxHp, id).toBe(Math.round(twin.maxHp * 0.6));
        if (twin.resistance) expect(p.resistance!, id).toBeCloseTo(twin.resistance * 0.6, 4);
        if (l.slot === 'gloves') expect(p.damage, id).toBe(Math.round(twin.damage! * 0.6));
        expect(p.setFamily, id).toBe((['linen', 'homespun', 'silk', 'arcane', 'lunar', 'voidweave'] as const)[i]);
        if (l.slot === 'armor') expect(p.look, id).toBe(twin.look);
      });
    }
  });

  // (the cross-line check "adds more CP than the piece of the tier before" lived here until 28/10. CP stopped being the judge of class fairness (docs/CLASSES_E_EQUIPAMENTOS.md 2.5) and stopped opening and
  // closing anything (the Hunting depth and sub-level gates read the equipment index now, gearIndex.ts), so it no longer protects a promise. What replaces it is TWO guards: R8 at the end of this file (no piece
  // is strictly dominated by a lower-tier one) and classAxes.test.ts (each class beats its own axis by 15-20 % and none falls more than 10 % behind on the others).)

  it('cost parity: from tier 3 a cloth piece asks for every hunting / refined family its plate twin asks for, and the total reference cost (Gold + materials) is within 15 % of the twin', () => {
    const own = (id: string): number => {
      const g = getGear(id);
      const r = g.recipe!;
      const gems = Object.values(r.gems ?? {}).reduce((a, b) => a + (b as number), 0);
      return g.cost + cargoReferenceValue((r.materials ?? {}) as Partial<Record<MaterialId, number>>) + (gems + (r.shards ?? 0)) * 4;
    };
    for (const l of CLOTH_LINES) {
      l.ids.forEach((id, i) => {
        const ratio = own(id) / own(l.twins[i]);
        expect(ratio, `${id}: ${ratio.toFixed(3)}`).toBeGreaterThanOrEqual(0.85);
        expect(ratio, `${id}: ${ratio.toFixed(3)}`).toBeLessThanOrEqual(1.15);
        if (i >= 2) {
          const mine = getGear(id).recipe!.materials!;
          for (const m of Object.keys(getGear(l.twins[i]).recipe!.materials!)) if (m !== 'leather' && m !== 'leather_scrap' && !m.startsWith('wood_handle_')) expect(mine[m as MaterialId], `${id} asks for ${m}`).toBeGreaterThan(0);
        }
      });
    }
  });

  it('the recipes follow the supply: the cloth of the tier (from the Garden) + arcane dust from tier 3 (a few units: it falls only in the marsh, about 5 in a 4 h session of a strong hero), no wood handle, no leather', () => {
    const FABRICS = ['cloth_linen', 'cloth_cotton', 'cloth_silk', 'cloth_moon', 'cloth_void', 'cloth_void'];
    for (const l of CLOTH_LINES) {
      l.ids.forEach((id, i) => {
        const m = getGear(id).recipe!.materials!;
        expect(m[FABRICS[i] as MaterialId], `${id} cloth`).toBeGreaterThan(0);
        // dust falls only in the marsh (floor 26+): tiers 1 and 2 ask for none, so the first mage pieces never sit behind a zone the hero has not reached
        if (i < 2) expect(m.arcane_dust, `${id} dust`).toBeUndefined();
        else {
          expect(m.arcane_dust, `${id} dust`).toBeGreaterThan(0);
          expect(m.arcane_dust!, `${id} dust`).toBeLessThanOrEqual(3);
        }
        expect(Object.keys(m).filter((k) => k.startsWith('wood_handle_') || k === 'leather' || k === 'leather_scrap'), id).toEqual([]);
      });
    }
    // a whole set of one tier is a few sessions of dust, never a wall
    for (let t = 0; t < 6; t++) {
      const setDust = CLOTH_LINES.reduce((a, l) => a + (getGear(l.ids[t]).recipe!.materials!.arcane_dust ?? 0), 0);
      expect(setDust, `tier ${t + 1} set`).toBeLessThanOrEqual(14);
    }
  });
});
// --- R7 (weapons): the bow, crossbow, staff and scepter (classes reform, phase 3; docs/CLASSES_E_EQUIPAMENTOS.md 2.1, 2.4) ----------------------------------------------------------------
// A weapon is judged against the SWORD of its tier: the same reference hero with the weapon in the weapon slot (plate everywhere else) must be worth the sword's CP, at +0, +4 and +8, with and without
// the set bonuses. The returned stats come from the same generator (WEAPON_CONVERSION) and this test fails when they go stale. Every stat of a line only goes UP with the tier: a promise to the player,
// harder than the +-5 % band, so a tier that cannot satisfy both is reported by the generator and never fixed by relaxing the ladder.
describe('R7: the weapon lines', () => {
  const TIER_LEVEL = [1, 10, 25, 50, 70, 90];
  const swapWeapon = (t: number, weaponId: string | undefined, refine: number): SaveData => {
    const h = buildHero(TIER_LEVEL[t - 1], t, refine);
    if (!weaponId) return h;
    const inst = createGearInstance(weaponId, { id: `gi_wpn_${weaponId}`, origin: 'craft', rarity: 'common', substats: [], upgrade: refine });
    return { ...h, gearInstances: { ...h.gearInstances, [inst.id]: inst }, equipped: { ...h.equipped, weapon: inst.id } };
  };
  const FIELDS = ['damage', 'critChance', 'attackSpeedBonus', 'critMultBonus', 'hpRegenPct'] as const;
  const RETURNS: Record<string, readonly (typeof FIELDS)[number][]> = { bow: ['attackSpeedBonus', 'critMultBonus'], crossbow: ['critMultBonus'], staff: ['critMultBonus'], scepter: ['hpRegenPct'] };

  for (const l of WEAPON_LINES) {
    for (const t of [1, 2, 3, 4, 5, 6]) {
      it(`${l.line} tier ${t} (${l.ids[t - 1]}): within +-5 % of the CP of the sword, at +0, +4 and +8, with and without the set bonuses`, neutral(() => {
        for (const refine of [0, 4, 8]) {
          const noSets = computeCP_noSets(swapWeapon(t, l.ids[t - 1], refine)) / computeCP_noSets(swapWeapon(t, undefined, refine));
          expect(noSets, `+${refine} pieces only`).toBeGreaterThanOrEqual(0.95);
          expect(noSets, `+${refine} pieces only`).toBeLessThanOrEqual(1.05);
          const sets = computeCP(swapWeapon(t, l.ids[t - 1], refine)) / computeCP(swapWeapon(t, undefined, refine));
          expect(sets, `+${refine} with the set bonuses`).toBeGreaterThanOrEqual(0.95);
          expect(sets, `+${refine} with the set bonuses`).toBeLessThanOrEqual(1.05);
        }
      }));
    }
  }

  it('every weapon is the lighter twin of the sword of its tier: same price and level gate, its share of the damage and the sword\'s crit chance, the stats of its line, the staff burns at every tier and nobody else does', () => {
    for (const l of WEAPON_LINES) {
      l.ids.forEach((id, i) => {
        const p = getGear(id);
        const twin = getGear(SWORD_TWINS[i]);
        expect(p.slot, id).toBe('weapon');
        expect(p.line, id).toBe(l.line);
        expect(p.weight, id).toBeUndefined(); // the weight is the armor's; a weapon takes its family from its line
        expect(p.materialKey, id).toBe(l.line === 'bow' || l.line === 'crossbow' ? 'material_leather' : 'material_cloth');
        expect(p.tier, id).toBe(i + 1);
        expect(p.cost, id).toBe(twin.cost);
        expect(gearRequiredLevel(p), id).toBe(gearRequiredLevel(twin));
        expect(p.damage, id).toBe(Math.round(twin.damage! * WEAPON_KEEP[l.line]));
        // the sword's crit chance is the weapon's own base; the bow keeps half of it (its budget goes to attack speed, the leather armor carries the crit chance)
        expect(p.critChance, id).toBe(Math.round(twin.critChance! * WEAPON_CRIT_KEEP[l.line] * 10000) / 10000);
        // the bow's crit multiplier is an overflow only: required for the other lines, optional for the bow
        for (const f of RETURNS[l.line]) if (!(l.line === 'bow' && f === 'critMultBonus')) expect(p[f] ?? 0, `${id}.${f}`).toBeGreaterThan(0);
        for (const f of FIELDS) if (f !== 'damage' && f !== 'critChance' && !RETURNS[l.line].includes(f)) expect(p[f], `${id}.${f} is not part of the ${l.line}`).toBeUndefined();
        expect(p.burn === true, id).toBe(l.line === 'staff');
        expect(p.reflect, id).toBeUndefined();
      });
    }
    // the sword and the axe are exactly what they were: no line on the sword, no weight, plate families
    for (const id of SWORD_TWINS) {
      expect(getGear(id).line, id).toBeUndefined();
      expect(getGear(id).weight, id).toBeUndefined();
    }
    expect(['bronze', 'iron', 'steel', 'gilded', 'voidsteel', 'abyssal']).toEqual(SWORD_TWINS.map((id) => getGear(id).setFamily));
    expect(getGear('bronze_hatchet').setFamily).toBe('bronze');
  });

  it('each stat of a line is strictly higher at the next tier (damage, total crit chance and the line\'s returned stats), the proof of "the next tier is never worse"', () => {
    for (const l of WEAPON_LINES) {
      const fields = ['damage', 'critChance', ...RETURNS[l.line].filter((f) => f !== 'critChance' && !(l.line === 'bow' && f === 'critMultBonus'))] as (typeof FIELDS)[number][];
      if (l.line === 'bow') for (let i = 1; i < 6; i++) if (getGear(l.ids[i - 1]).critMultBonus) expect(getGear(l.ids[i]).critMultBonus ?? 0, l.ids[i]).toBeGreaterThan(getGear(l.ids[i - 1]).critMultBonus!);
      for (let i = 1; i < 6; i++) for (const f of fields) expect(getGear(l.ids[i])[f] as number, `${l.ids[i]}.${f} vs ${l.ids[i - 1]}`).toBeGreaterThan(getGear(l.ids[i - 1])[f] as number);
    }
  });

  it('the archer (the full leather set of the tier, the bow and the ring, at +0 / +4 / +8, set bonuses on) never wastes crit chance past 0.95 and keeps 450 ms of attack interval: the bow carries speed, the armor carries crit chance', () => {
    for (const bowId of WEAPON_LINES[0].ids) {
      const t = getGear(bowId).tier!;
      for (const refine of [0, 4, 8]) {
        const h = swapWeapon(t, bowId, refine);
        const inst = { ...h.gearInstances };
        const eq = { ...h.equipped } as unknown as Record<string, string | null>;
        for (const l of LEATHER_LINES) {
          const i = createGearInstance(l.ids[t - 1], { id: `gi_arch_${l.ids[t - 1]}`, origin: 'craft', rarity: 'common', substats: [], upgrade: refine });
          inst[i.id] = i;
          eq[l.slot] = i.id;
        }
        const st = buildCombatStats({ ...h, gearInstances: inst, equipped: eq as unknown as SaveData['equipped'] });
        expect(st.critChance, `${bowId} +${refine} crit`).toBeLessThanOrEqual(0.95);
        expect(st.heroMs, `${bowId} +${refine} ms`).toBeGreaterThanOrEqual(450);
      }
    }
  });

  it('the set family of a weapon is the one of the WEIGHT of its class: bow and crossbow count for the leather family of the tier, staff and scepter for the cloth one, so five leather pieces and a bow close the archer\'s set', () => {
    const LEATHER = ['hide', 'scout', 'ranger', 'hunter', 'nightstalker', 'abyssalhide'];
    const CLOTH = ['linen', 'homespun', 'silk', 'arcane', 'lunar', 'voidweave'];
    for (const l of WEAPON_LINES) l.ids.forEach((id, i) => expect(setFamiliesOf(getGear(id)), id).toEqual([(l.line === 'bow' || l.line === 'crossbow' ? LEATHER : CLOTH)[i]]));
    // a real set: the five leather pieces of a tier plus the bow are six pieces of the family (the bonus thresholds are 3 and 5, so the bow counts and a mixed set still needs its five)
    for (let i = 0; i < 6; i++) {
      const worn = [...LEATHER_LINES.map((x) => getGear(x.ids[i])), getGear(WEAPON_LINES[0].ids[i])];
      expect(worn.filter((g) => setFamiliesOf(g).includes(LEATHER[i] as never)), LEATHER[i]).toHaveLength(6);
      const mage = [...CLOTH_LINES.map((x) => getGear(x.ids[i])), getGear(WEAPON_LINES[2].ids[i])];
      expect(mage.filter((g) => setFamiliesOf(g).includes(CLOTH[i] as never)), CLOTH[i]).toHaveLength(6);
    }
  });

  // (the cross-line check "adds more CP than the piece of the tier before" lived here until 28/10. CP stopped being the judge of class fairness (docs/CLASSES_E_EQUIPAMENTOS.md 2.5) and stopped opening and
  // closing anything (the Hunting depth and sub-level gates read the equipment index now, gearIndex.ts), so it no longer protects a promise. What replaces it is TWO guards: R8 at the end of this file (no piece
  // is strictly dominated by a lower-tier one) and classAxes.test.ts (each class beats its own axis by 15-20 % and none falls more than 10 % behind on the others).)

  it('cost parity: from tier 3 a weapon asks for every hunting / refined family its sword asks for, and the total reference cost (Gold + materials) is within 15 % of the sword', () => {
    const own = (id: string): number => {
      const g = getGear(id);
      const r = g.recipe!;
      const gems = Object.values(r.gems ?? {}).reduce((a, b) => a + (b as number), 0);
      return g.cost + cargoReferenceValue((r.materials ?? {}) as Partial<Record<MaterialId, number>>) + (gems + (r.shards ?? 0)) * 4;
    };
    for (const l of WEAPON_LINES) {
      l.ids.forEach((id, i) => {
        const ratio = own(id) / own(SWORD_TWINS[i]);
        expect(ratio, `${id}: ${ratio.toFixed(3)}`).toBeGreaterThanOrEqual(0.85);
        expect(ratio, `${id}: ${ratio.toFixed(3)}`).toBeLessThanOrEqual(1.15);
        if (i >= 2) {
          const mine = getGear(id).recipe!.materials!;
          for (const m of Object.keys(getGear(SWORD_TWINS[i]).recipe!.materials!)) if (m !== 'leather' && m !== 'leather_scrap' && !m.startsWith('wood_handle_')) expect(mine[m as MaterialId], `${id} asks for ${m}`).toBeGreaterThan(0);
        }
      });
    }
  });

  it('the recipes follow the supply and the chain: one piece of the previous tier of the SAME line (two at tier 2), the wood handle of the tier, sinew (bow, crossbow) or arcane dust from tier 3 (staff, scepter) in amounts a few sessions can pay', () => {
    const HANDLES = ['wood_handle_common', 'wood_handle_oak', 'wood_handle_ebony', 'wood_handle_elven', 'wood_handle_ancient', 'wood_handle_ancient'];
    for (const l of WEAPON_LINES) {
      l.ids.forEach((id, i) => {
        const r = getGear(id).recipe!;
        const m = r.materials!;
        if (i === 0) expect(r.items, id).toBeUndefined();
        else expect(r.items, id).toEqual({ [l.ids[i - 1]]: i === 1 ? 2 : 1 });
        // the handle of the tier is in every recipe (the sword's handle count is not copied: the identity above decides it)
        expect(m[HANDLES[i] as MaterialId], `${id} handle`).toBeGreaterThan(0);
        expect(Object.keys(m).filter((k) => k.startsWith('wood_handle_')), id).toEqual([HANDLES[i]]);
        if (l.line === 'bow' || l.line === 'crossbow') {
          // a 4 h session gives about 17 sinew to a new hero and 48 to a strong one
          expect(m.leather, id).toBeGreaterThan(0);
          expect(m.beast_sinew, id).toBeGreaterThan(0);
          expect(m.beast_sinew!, id).toBeLessThanOrEqual(48);
          expect(m.arcane_dust, id).toBeUndefined();
        } else {
          // the dust falls only in the marsh (floor 26+, about 5 in a session of a strong hero): tiers 1 and 2 ask for none, so a new mage is never locked out of his first weapon
          if (i < 2) expect(m.arcane_dust, id).toBeUndefined();
          else {
            expect(m.arcane_dust, id).toBeGreaterThan(0);
            expect(m.arcane_dust!, id).toBeLessThanOrEqual(5);
          }
          expect(m.leather, id).toBeUndefined();
          expect(m.beast_sinew, id).toBeUndefined();
        }
      });
    }
  });
});
function computeCP_noSets(h: SaveData): number {
  return withoutSetBonuses(() => computeCP(h));
}

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

// --- R8: no piece is dominated by a piece of a lower tier (classes reform, phase 8) -----------------------------------------------------------------------------------------------------
// An ADDITIONAL promise to the player, next to the CP checks above (which stay: CP parity is a structural requirement of the Hunting sub-level gate even though it is not the measure of fairness). A piece of a
// higher tier must never be WORSE IN EVERYTHING than a piece of the same slot he could already forge at a lower tier, whatever its line. Worse in some stats and better in others is a trade; worse in all is a trap.
describe('R8: no crafted piece is strictly dominated by a lower-tier piece of the same slot', () => {
  const STATS = ['damage', 'critChance', 'maxHp', 'resistance', 'reflect', 'critMultBonus', 'attackSpeedBonus', 'hpRegenPct'] as const;
  const val = (g: GearItem, k: (typeof STATS)[number]): number => g[k] ?? 0;
  // q dominates p when q is at least as good in every stat (the burn counts) and better in at least one
  const dominates = (q: GearItem, p: GearItem): boolean =>
    STATS.every((k) => val(q, k) >= val(p, k)) && (q.burn || !p.burn) && (STATS.some((k) => val(q, k) > val(p, k)) || (q.burn && !p.burn));
  const crafted = GEAR.filter((g) => g.recipe && !g.unique && isInstancedSlot(g.slot));
  const newPieces = crafted.filter((g) => g.weight === 'leather' || g.weight === 'cloth' || g.line === 'bow' || g.line === 'crossbow' || g.line === 'staff' || g.line === 'scepter');

  it('the 84 pieces of the classes reform are all checked', () => {
    expect(newPieces).toHaveLength(84);
  });

  it('none of them (tier 2 and up) is worse in every stat than a piece of its slot from a lower tier, of any line', () => {
    for (const p of newPieces) {
      for (const q of crafted.filter((x) => x.slot === p.slot && (x.tier ?? 0) < (p.tier ?? 0))) expect(dominates(q, p), `${p.id} (tier ${p.tier}) is dominated by ${q.id} (tier ${q.tier})`).toBe(false);
    }
  });

  it('the same holds for every other crafted piece (the original lines were never dominated and must stay so)', () => {
    for (const p of crafted.filter((g) => !newPieces.includes(g))) {
      for (const q of crafted.filter((x) => x.slot === p.slot && (x.tier ?? 0) < (p.tier ?? 0))) expect(dominates(q, p), `${p.id} is dominated by ${q.id}`).toBe(false);
    }
  });
});
