import { describe, expect, it } from 'vitest';
import { buildCombatStats, buildHuntSession, defaultSave, normalizeSave, SaveData, xpToReachLevel } from '../engine';
import { GEAR, SET_FAMILIES, getGear, setFamiliesOf } from '../gear';
import { applyEquipInstance, createGearInstance, equippedSetItems, equippedSubstatTotals } from '../gearInstances';
import { GOLD_BONUS_CAP } from '../rarity';
import { SET_DEFS, SET_EFFECT_KEYS, emptySetTotals, setBonuses, setCounts, wornSetViews } from '../setBonuses';
import { setEffectText, setFamilyName } from '../../components/setText';
import { setLocale } from '../../locales';
import pt from '../../locales/pt.json';
import en from '../../locales/en.json';

// Set bonuses (setBonuses.ts): 3 / 5 pieces of a crafted tier family over the seven instanced slots; the relic does not count, uniques count as their twin, a dragon
// piece counts for the dragon and the gilded family, mixed sets are legal.

const items = (ids: string[]) => ids.map((id) => getGear(id));

// A fresh save wearing the listed templates (any slot), ids `t_<templateId>`.
function wear(ids: string[], rarity: 'common' | 'epic' = 'common'): SaveData {
  let s = { ...defaultSave(), xp: xpToReachLevel(100) }; // a max-level hero: wearing needs the recipe's level (levelGateEquip.test.ts)
  const gearInstances = { ...s.gearInstances };
  for (const id of ids) gearInstances[`t_${id}`] = createGearInstance(id, { id: `t_${id}`, origin: 'craft', rarity, substats: [] });
  s = { ...s, gearInstances };
  for (const id of ids) s = applyEquipInstance(s, `t_${id}`) as SaveData;
  return s;
}

const STEEL = ['steel_greatsword', 'steel_plate', 'steel_helm', 'steel_gauntlets', 'steel_greaves', 'gold_ring', 'steel_kite_shield'];
const IRON = ['iron_short_sword', 'iron_chainmail', 'iron_helm', 'iron_gauntlets', 'iron_greaves', 'silver_ring', 'iron_shield'];

describe('set families', () => {
  it('every instanced piece of tier 1 and up belongs to one family, relics and starters to none', () => {
    for (const g of GEAR) {
      if (g.slot === 'relic' || !g.tier) expect(g.setFamily, g.id).toBeUndefined();
      else expect(SET_FAMILIES, g.id).toContain(g.setFamily);
    }
  });

  it('the family follows the tier; the dragon weapon and armor are dragon; a unique takes its twin family', () => {
    expect(getGear('bronze_dagger').setFamily).toBe('bronze');
    expect(getGear('copper_ring').setFamily).toBe('bronze');
    expect(getGear('iron_battleaxe').setFamily).toBe('iron');
    expect(getGear('steel_kite_shield').setFamily).toBe('steel');
    expect(getGear('gilded_helm').setFamily).toBe('gilded');
    expect(getGear('ruby_ring').setFamily).toBe('gilded');
    expect(getGear('dragon_flameblade').setFamily).toBe('dragon');
    expect(getGear('dragon_scale_armor').setFamily).toBe('dragon');
    expect(getGear('voidsteel_cleaver').setFamily).toBe('voidsteel');
    expect(getGear('abyssal_ring').setFamily).toBe('abyssal');
    for (const u of GEAR.filter((g) => g.unique)) expect(u.setFamily, u.id).toBe(getGear(u.salvageLike as string).setFamily);
    expect(getGear('goblin_king_crown').setFamily).toBe('steel');
    expect(getGear('overlord_greataxe').setFamily).toBe('abyssal');
  });

  it('a dragon piece counts for the dragon AND the gilded family; nothing else counts twice', () => {
    expect(setFamiliesOf(getGear('dragon_flameblade'))).toEqual(['dragon', 'gilded']);
    expect(setFamiliesOf(getGear('gilded_aegis'))).toEqual(['gilded']);
    expect(setFamiliesOf(getGear('ring_vitality'))).toEqual([]);
    expect(setFamiliesOf(null)).toEqual([]);
  });
});

describe('counting and thresholds', () => {
  it('nothing worn, or only the starters, gives no bonus', () => {
    const none = setBonuses([]);
    expect(none.active).toEqual([]);
    expect(none.totals).toEqual(emptySetTotals());
    expect(setBonuses(equippedSetItems(defaultSave())).active).toEqual([]);
  });

  it('two pieces give nothing, three the first bonus, five both, and more pieces change nothing', () => {
    expect(setBonuses(items(STEEL.slice(0, 2))).active).toEqual([]);
    const three = setBonuses(items(STEEL.slice(0, 3)));
    expect(three.active.map((a) => [a.family, a.pieces])).toEqual([['steel', 3]]);
    expect(three.totals.attackSpeedBonus).toBe(0.04);
    expect(three.totals.critMultBonus).toBe(0);
    const five = setBonuses(items(STEEL.slice(0, 5)));
    expect(five.active.map((a) => a.pieces)).toEqual([3, 5]);
    expect(five.totals.attackSpeedBonus).toBe(0.04);
    expect(five.totals.critMultBonus).toBe(0.1);
    expect(setBonuses(items(STEEL)).totals).toEqual(five.totals);
  });

  it('the weapon of either line counts', () => {
    const sword = setCounts(items(['iron_short_sword']));
    const axe = setCounts(items(['iron_battleaxe']));
    expect(sword.iron).toBe(1);
    expect(axe.iron).toBe(1);
  });

  it('mixed sets are legal: 3 + 3 applies both first bonuses', () => {
    const b = setBonuses(items([...STEEL.slice(0, 3), ...IRON.slice(2, 5)]));
    expect(b.counts.steel).toBe(3);
    expect(b.counts.iron).toBe(3);
    expect(b.active.map((a) => `${a.family}${a.pieces}`)).toEqual(['iron3', 'steel3']);
    expect(b.totals.resistance).toBe(0.04);
    expect(b.totals.attackSpeedBonus).toBe(0.04);
  });

  it('a unique counts as the family of its twin', () => {
    // goblin_king_crown (a steel helm) + two steel pieces = three steel
    const b = setBonuses(items(['goblin_king_crown', 'steel_plate', 'steel_greaves']));
    expect(b.counts.steel).toBe(3);
    expect(b.totals.attackSpeedBonus).toBe(0.04);
    // the greataxe (abyssal) does not count for steel
    expect(setCounts(items(['overlord_greataxe'])).abyssal).toBe(1);
  });

  it('the relic slot does not count, wherever the relic is', () => {
    const s = { ...wear(STEEL.slice(0, 2)), equipped: { ...wear(STEEL.slice(0, 2)).equipped, relic: 'berserker_crest' } };
    expect(equippedSetItems(s).map((g) => g.id).sort()).toEqual(['steel_greatsword', 'steel_plate']);
    expect(wornSetViews(equippedSetItems(s))).toHaveLength(1);
    for (const r of GEAR.filter((g) => g.slot === 'relic')) expect(setFamiliesOf(r)).toEqual([]);
  });

  it('dragon weapon + armor give the dragon bonus and count as two gilded pieces', () => {
    const b = setBonuses(items(['dragon_flameblade', 'dragon_scale_armor']));
    expect(b.counts.dragon).toBe(2);
    expect(b.counts.gilded).toBe(2);
    expect(b.totals.lifestealPct).toBe(2);
    const withGilded = setBonuses(items(['dragon_flameblade', 'dragon_scale_armor', 'gilded_helm']));
    expect(withGilded.counts.gilded).toBe(3);
    expect(withGilded.totals.goldBonusPct).toBe(8);
  });

  it('the bonuses grow with the tier (the same count of pieces is worth at least as much further up)', () => {
    const score = (e: ReturnType<typeof setBonuses>['totals']) => e.attackSpeedBonus * 100 + e.critMultBonus * 40 + e.resistance * 100 + e.damagePct * 100 + e.lifestealPct + e.hpRegenPct * 300 + e.goldBonusPct * 0.3;
    const per = (f: (typeof SET_FAMILIES)[number]) => SET_DEFS[f].effects.reduce((a, e) => a + score({ ...emptySetTotals(), ...e }), 0);
    const order = ['bronze', 'iron', 'steel', 'gilded', 'voidsteel', 'abyssal'] as const;
    for (let i = 1; i < order.length; i++) expect(per(order[i]), order[i]).toBeGreaterThanOrEqual(per(order[i - 1]) * 0.9);
    expect(per('abyssal')).toBeGreaterThan(per('bronze'));
  });
});

describe('the bonuses reach the combat stats of the Dungeon, Hunting and CP', () => {
  it('iron 3: +4 % resistance on the raw reduction; steel 3: faster attacks; steel 5: crit damage', () => {
    const base = wear(IRON.slice(0, 2));
    const three = wear(IRON.slice(0, 3));
    const own = getGear('iron_helm');
    expect(buildCombatStats(three).reduction - buildCombatStats(base).reduction).toBeCloseTo((own.resistance as number) + 0.04, 6);

    const steel2 = buildCombatStats(wear(STEEL.slice(0, 2)));
    const steel3 = buildCombatStats(wear(STEEL.slice(0, 3)));
    expect(steel3.heroMs).toBeLessThan(steel2.heroMs);
    expect(steel3.speedBonus).toBeCloseTo(0.04, 9);
    const steel4 = buildCombatStats(wear(STEEL.slice(0, 4)));
    const steel5 = buildCombatStats(wear(STEEL.slice(0, 5)));
    expect(steel5.critMult - steel4.critMult).toBeCloseTo(0.1 + (getGear('steel_greaves').critMultBonus ?? 0), 9);
  });

  it('every effect lands on its CombatStats field', () => {
    const one = (ids: string[]) => buildCombatStats(wear(ids));
    const plain = (ids: string[]) => ({ ...buildCombatStats(wear(ids.slice(0, 2))) });
    // gilded 5: +5 % final damage (the hit grows by about that much; the pieces add their own damage, so compare against 4 pieces)
    const g4 = one(['gilded_warblade', 'gilded_aegis', 'gilded_helm', 'gilded_greaves']);
    const g5 = one(['gilded_warblade', 'gilded_aegis', 'gilded_helm', 'gilded_greaves', 'gilded_shield']);
    expect(g5.dmgBase / g4.dmgBase).toBeCloseTo(1.05, 6);
    expect(g5.goldBonus).toBeGreaterThanOrEqual(8);
    // abyssal 5: faster attacks; dragon 2: lifesteal
    const a = one(['abyssal_greatblade', 'abyssal_bulwark', 'abyssal_helm', 'abyssal_greaves', 'abyssal_shield']);
    expect(a.speedBonus).toBeCloseTo(0.06, 9);
    expect(one(['dragon_flameblade', 'dragon_scale_armor']).lifesteal).toBe(2);
    // iron 5: regeneration
    expect(one(IRON.slice(0, 5)).hpRegenPct).toBeCloseTo(0.003, 9);
    void plain;
  });

  it('a bronze 3 gold bonus joins the substat gold inside the 25 % cap', () => {
    const s = wear(['bronze_dagger', 'bronze_leather', 'bronze_helm']);
    expect(equippedSubstatTotals(s).goldBonus).toBe(5);
    expect(buildCombatStats(s).goldBonus).toBe(5);
    const capped = { ...s, gearInstances: { ...s.gearInstances, t_bronze_dagger: { ...s.gearInstances.t_bronze_dagger, substats: [{ type: 'goldBonus' as const, value: 24 }] } } };
    expect(equippedSubstatTotals(capped).goldBonus).toBe(GOLD_BONUS_CAP);
  });

  it('Hunting freezes the same stats the Dungeon reads (buildHuntSession.stats = buildCombatStats)', () => {
    const s = wear(STEEL.slice(0, 5));
    const stats = buildCombatStats(s);
    expect(buildHuntSession(s, 1_000).stats).toEqual(stats);
    expect(stats.speedBonus).toBeCloseTo(0.04, 9);
  });

  it('an old save (no set data at all) loads and simply gets the bonus of what it wears', () => {
    const s = wear(STEEL.slice(0, 3));
    const wire = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    expect(JSON.stringify(wire)).not.toMatch(/setBonus|setFamily/);
    const back = normalizeSave(wire as unknown as SaveData);
    expect(buildCombatStats(back)).toEqual(buildCombatStats(s));
    expect(buildCombatStats(back).speedBonus).toBeCloseTo(0.04, 9);
  });
});

describe('set texts (pt / en parity)', () => {
  it('every family and every effect has a name and a sentence in both languages, with the number filled in', () => {
    for (const table of [pt, en] as unknown as { set: { family: Record<string, string>; effect: Record<string, string> } }[]) {
      for (const f of SET_FAMILIES) expect(typeof table.set.family[f], f).toBe('string');
      for (const k of SET_EFFECT_KEYS) expect(table.set.effect[k], k).toMatch(/\{v\}/);
    }
    for (const loc of ['pt', 'en'] as const) {
      setLocale(loc);
      for (const f of SET_FAMILIES) {
        expect(setFamilyName(f)).not.toMatch(/\{|set\./);
        for (const e of SET_DEFS[f].effects) {
          const text = setEffectText(e);
          expect(text, `${loc} ${f}`).not.toMatch(/\{|undefined|NaN/);
          expect(text.length).toBeGreaterThan(5);
        }
      }
    }
    setLocale('pt');
    expect(setEffectText(SET_DEFS.steel.effects[0])).toBe('+4% velocidade de ataque');
    expect(setEffectText(SET_DEFS.iron.effects[1])).toBe('Regenera +0,3% da vida/s');
    setLocale('en');
    expect(setEffectText(SET_DEFS.steel.effects[1])).toBe('+10% crit damage');
    setLocale('pt');
  });

  it('thresholds are ascending and each family has one effect per threshold', () => {
    for (const f of SET_FAMILIES) {
      const d = SET_DEFS[f];
      expect(d.effects).toHaveLength(d.thresholds.length);
      expect([...d.thresholds].sort((a, b) => a - b)).toEqual(d.thresholds);
      expect(d.thresholds[0]).toBeGreaterThanOrEqual(2);
    }
    for (const f of SET_FAMILIES.filter((x) => x !== 'dragon')) expect(SET_DEFS[f].thresholds).toEqual([3, 5]);
  });
});
