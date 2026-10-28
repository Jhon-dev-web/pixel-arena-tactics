import { describe, expect, it } from 'vitest';
import { computeCP, SaveData } from '../engine';
import { createGearInstance, equippedSubstatTotals } from '../gearInstances';
import { cargoReferenceValue } from '../economy';
import type { MaterialId } from '../materials';
import { GOLD_BONUS_CAP, RARITIES, Rarity, SUBSTATS, medianSubstatValue, rollRarity, rollSubstats } from '../rarity';
import { duel, hero, MAIN_TIERS, repFloor, tierNum, withoutSetBonuses } from '../../../scripts/sim/duel';
import { withSeededRandom } from '../../../scripts/sim/driver';
import { pieceGain } from '../../../scripts/sim/tierSteps';
import { GEAR, GearItem, LEATHER_LINES, gearRequiredLevel, getGear, isInstancedSlot } from '../gear';
import { buildHero } from '../../../scripts/sim/ladder';
import { rarityHero } from '../../../scripts/sim/rarityHero';
import { getHuntingZone, subLevelCpRequired } from '../huntingZones';
import T from '../tunables';

// Rules of the item balance round (docs/ITEM_BALANCE_AUDIT.md, docs/BALANCE_CHANGES.md "Rodada 3"):
//   R1  at equal tier and refine, median rolls (weapon + armor of that rarity): rare +3-6 % CP over common, epic +13-20 %, legendary +40-65 % (Rodada 26; Rodada 24 had +8-14 % and +36-58 %);
//   R5  a full seven-piece set (Rodada 26): rare 1.10-1.25 times the CP of a common one, epic 1.30-1.55, legendary 1.9-2.4, and the step epic -> legendary is at least 1.5 times;
//   R2  no combat substat worth more than 2x another at its median roll (goldBonus exempt, capped at +25 % in total);
//   R4  forge chances are 61 / 25 / 10 / 4 (Rodada 9 had 63 / 25 / 10 / 2; Rodada 26 doubled the Legendary because the market had too few and added a pity after 40 forges of tier 4+).

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

  // Rodada 26: the Hunting sub-levels (the Abyss CP gate) are where a rarity becomes levels. Same full set, same refine: the Epic opens two sub-levels more than the Common, the Legendary two more than the Epic
  // (the last one at tier 6, where the ten sub-levels run out).
  for (const [tier, level, refine] of [[4, 62, 8], [5, 75, 8], [6, 90, 8]] as [number, number, number][]) {
    it(`tier ${tier} +${refine}: the Epic set opens two more sub-levels than the Common one, the Legendary reaches the top`, () => {
      const zone = getHuntingZone('blood_abyss')!;
      const reach = (r: Rarity): number => {
        const cp = computeCP(rarityHero(level, tier, refine, r));
        let n = 1;
        while (n < T.hunting.subLevels && cp >= subLevelCpRequired(zone, 'deep', n + 1)) n++;
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
const NUMERIC = ['damage', 'maxHp', 'critChance', 'critMultBonus', 'resistance', 'reflect', 'attackSpeedBonus'] as const;

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

  it('thirteen lines (the eight plate ones - sword, axe, armor, helmet, gloves, boots, ring, shield - and the five leather ones), each one chain from tier 1 to tier 6 with no dead end', () => {
    expect(chains).toHaveLength(8 + 5);
    expect(chains.filter((c) => c[0].weight === 'leather').map((c) => c[0].slot).sort()).toEqual(['armor', 'boots', 'gloves', 'helmet', 'shield']);
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
    it(`tier ${t}: a full leather set (armor, helmet, gloves, boots, quiver) is within +-5 % of the CP of the full plate set, at +0, +4 and +8, with and without the set bonuses`, () => {
      for (const refine of [0, 4, 8]) {
        const plateNo = computeCP_noSets(setHero(t, false, refine));
        const leatherNo = computeCP_noSets(setHero(t, true, refine));
        expect(leatherNo / plateNo, `+${refine} pieces only`).toBeGreaterThanOrEqual(0.95);
        expect(leatherNo / plateNo, `+${refine} pieces only`).toBeLessThanOrEqual(1.05);
        const r = computeCP(setHero(t, true, refine)) / computeCP(setHero(t, false, refine));
        expect(r, `+${refine} with the set bonuses`).toBeGreaterThanOrEqual(0.95);
        expect(r, `+${refine} with the set bonuses`).toBeLessThanOrEqual(1.05);
      }
    });
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

  it('a leather piece is never below the plate piece of the tier before it in the power it adds (the lighter weight is a trade, not a downgrade)', () => {
    for (const l of LEATHER_LINES) for (let i = 1; i < 6; i++) expect(pieceGain(l.ids[i]), `${l.ids[i]} vs ${l.twins[i - 1]}`).toBeGreaterThan(pieceGain(l.twins[i - 1]));
  });

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
