import { describe, expect, it } from 'vitest';
import { buildCombatStats, buildHuntSession, computeCP, defaultSave, normalizeSave, SaveData, xpToReachLevel } from '../engine';
import { getGear } from '../gear';
import { applyEquipInstance, createGearInstance, equippedSetItems } from '../gearInstances';
import { AFFINITY_WEIGHTS, affinityBonuses, affinityDefs, affinityView } from '../affinity';
import { SET_DEFS, SET_EFFECT_KEYS, SetEffect, setBonuses } from '../setBonuses';
import { gearOnly } from '../../../scripts/sim/duel';
import pt from '../../locales/pt.json';
import en from '../../locales/en.json';

// Class affinity (affinity.ts, classes reform phase 6): 3 / 5 pieces of the same armor WEIGHT over the five weight slots, any tier, plus a weapon of the weight. It rides the SetEffect type and the set totals
// of buildCombatStats, so everything below is also a check that nothing needed a second accumulator.

const worn = (ids: string[]) => ids.map((id) => getGear(id));

function wear(ids: string[]): SaveData {
  let s = { ...defaultSave(), xp: xpToReachLevel(100) };
  const gearInstances = { ...s.gearInstances };
  for (const id of ids) gearInstances[`t_${id}`] = createGearInstance(id, { id: `t_${id}`, origin: 'craft', rarity: 'common', substats: [] });
  s = { ...s, gearInstances };
  for (const id of ids) s = applyEquipInstance(s, `t_${id}`) as SaveData;
  return s;
}

// Five pieces of each weight, MIXED tiers on purpose (the point of the affinity: the set families are tier-bound).
const PLATE5 = ['bronze_helm', 'iron_chainmail', 'steel_gauntlets', 'iron_greaves', 'steel_kite_shield'];
const LEATHER5 = ['hide_cap', 'scout_leather', 'ranger_bracers', 'hide_shoes', 'ranger_quiver'];
const CLOTH5 = ['linen_hood', 'homespun_robe', 'silk_gloves', 'linen_sandals', 'scholar_tome'];
const total = (ids: string[]) => affinityBonuses(worn(ids)).totals;

describe('no affinity', () => {
  it('a hero without three pieces of one weight gets nothing, and the same stats and CP as with the switch off', () => {
    const mixed = ['bronze_helm', 'iron_chainmail', 'hide_shoes', 'scout_bracers', 'linen_hood', 'iron_short_sword'];
    const a = affinityBonuses(worn(mixed));
    expect(a.step).toBe(0);
    expect(a.effects).toEqual([]);
    expect(SET_EFFECT_KEYS.every((k) => a.totals[k] === 0)).toBe(true);
    const s = wear(mixed);
    expect(buildCombatStats(s)).toEqual(buildCombatStats({ ...s, noAffinity: true }));
    expect(computeCP(s)).toBe(computeCP({ ...s, noAffinity: true }));
    expect(SET_EFFECT_KEYS.every((k) => affinityBonuses([]).totals[k] === 0)).toBe(true);
  });

  it('the starters, the rings and the relic never count', () => {
    const s = defaultSave();
    expect(affinityBonuses(equippedSetItems(s)).weight).toBeNull();
    expect(affinityBonuses(worn(['bronze_helm', 'bronze_buckler', 'gold_ring'])).pieces).toBe(2);
  });
});

describe('the steps', () => {
  it('3 pieces of a weight give the small bonus, whatever the tier', () => {
    expect(total(['bronze_helm', 'iron_gauntlets', 'steel_greaves'])).toMatchObject({ resistance: 0.012, maxHpPct: 0 });
    expect(total(['hide_cap', 'scout_boots', 'ranger_bracers']).attackSpeedBonus).toBeCloseTo(0.012, 9);
    expect(total(['linen_hood', 'homespun_gloves', 'silk_slippers']).critMultBonus).toBeCloseTo(0.02, 9);
  });

  it('5 pieces give the full bonus, which replaces the 3-piece one', () => {
    const w = total(PLATE5);
    expect(w.resistance).toBeCloseTo(0.02, 9);
    expect(w.maxHpPct).toBeCloseTo(0.02, 9);
    const a = total(LEATHER5);
    expect(a.attackSpeedBonus).toBeCloseTo(0.02, 9);
    expect(a.critMultBonus).toBeCloseTo(0.03, 9);
    const m = total(CLOTH5);
    expect(m.critMultBonus).toBeCloseTo(0.03, 9);
    expect(m.hpRegenPct).toBeCloseTo(0.001, 9);
  });

  it('5 pieces + the weapon of the weight adds the class step (sword and axe plate, bow and crossbow leather, staff and scepter cloth)', () => {
    for (const weapon of ['iron_short_sword', 'steel_greataxe']) {
      const t = total([...PLATE5, weapon]);
      expect(t.maxHpPct).toBeCloseTo(0.03, 9);
      expect(t.resistance).toBeCloseTo(0.02, 9);
    }
    for (const weapon of ['short_bow', 'iron_crossbow']) {
      const t = total([...LEATHER5, weapon]);
      expect(t.attackSpeedBonus).toBeCloseTo(0.03, 9);
      expect(t.critMultBonus).toBeCloseTo(0.03, 9);
      expect(affinityBonuses(worn([...LEATHER5, weapon])).classActive).toBe(true);
    }
    for (const weapon of ['oak_staff', 'silver_scepter']) {
      const t = total([...CLOTH5, weapon]);
      expect(t.hpRegenPct).toBeCloseTo(0.0015, 9);
      expect(t.critMultBonus).toBeCloseTo(0.03, 9);
    }
  });

  it('the seal text never names the same effect twice: the step and the weapon step are summed by key (leather 5 + bow: ONE attack speed)', () => {
    const cases = [[...PLATE5, 'iron_short_sword'], [...LEATHER5, 'short_bow'], [...CLOTH5, 'oak_staff'], LEATHER5, PLATE5.slice(0, 3)];
    for (const ids of cases) {
      const view = affinityView(worn(ids))!;
      const keys = view.now.flatMap((e) => SET_EFFECT_KEYS.filter((key) => e[key]));
      expect(new Set(keys).size, ids.join()).toBe(keys.length);
    }
    const leather = affinityView(worn([...LEATHER5, 'short_bow']))!;
    const d = affinityDefs().leather;
    expect(leather.now).toHaveLength(1);
    expect(leather.now[0].attackSpeedBonus).toBeCloseTo((d.five.attackSpeedBonus ?? 0) + (d.weapon.attackSpeedBonus ?? 0), 10);
    expect(leather.now[0].critMultBonus).toBe(d.five.critMultBonus);
  });

  it('a weapon of ANOTHER weight, or 4 pieces + the weapon, is not the class step', () => {
    expect(affinityBonuses(worn([...LEATHER5, 'oak_staff'])).classActive).toBe(false);
    expect(total([...LEATHER5, 'oak_staff'])).toEqual(total(LEATHER5));
    expect(affinityBonuses(worn([...LEATHER5.slice(0, 4), 'short_bow'])).classActive).toBe(false);
    expect(total([...LEATHER5.slice(0, 4), 'short_bow'])).toEqual(total(LEATHER5.slice(0, 4)));
  });

  it('a missing weight field is plate and a missing line is the sword', () => {
    expect(getGear('iron_chainmail').weight).toBeUndefined();
    expect(getGear('iron_short_sword').line).toBeUndefined();
    expect(affinityBonuses(worn([...PLATE5, 'iron_short_sword'])).classActive).toBe(true);
    expect(affinityBonuses(worn(PLATE5)).weapon).toBeNull();
  });

  it('the view says what is missing', () => {
    expect(affinityView(worn(['bronze_helm']))?.next).toMatchObject({ kind: 'three', missing: 2 });
    expect(affinityView(worn(['hide_cap', 'hide_shoes', 'scout_bracers']))?.next).toMatchObject({ kind: 'five', missing: 2 });
    expect(affinityView(worn(LEATHER5))?.next).toMatchObject({ kind: 'weapon', missing: 1 });
    expect(affinityView(worn([...LEATHER5, 'short_bow']))?.next).toBeNull();
    expect(affinityView([])).toBeNull();
  });
});

describe('one machine: set and affinity add in the same totals', () => {
  it('buildCombatStats carries the sum of the set bonus and the affinity, with no other path', () => {
    // Five iron pieces (set: 3 -> +4 % resistance, 5 -> regeneration) and the iron sword: the affinity is warrior 5 + weapon on top.
    const ids = ['iron_short_sword', 'iron_chainmail', 'iron_helm', 'iron_gauntlets', 'iron_greaves', 'iron_shield'];
    const s = wear(ids);
    const set = setBonuses(equippedSetItems(s)).totals;
    const aff = affinityBonuses(equippedSetItems(s)).totals;
    expect(set.resistance).toBeCloseTo(0.04, 9);
    expect(aff.resistance).toBeCloseTo(0.02, 9);
    const on = buildCombatStats(s);
    const off = buildCombatStats({ ...s, noAffinity: true });
    expect(on.reduction - off.reduction).toBeCloseTo(aff.resistance, 9);
    expect(on.hpRegenPct - off.hpRegenPct).toBeCloseTo(aff.hpRegenPct, 9);
    // The set alone is still in the numbers of the "off" stats: nothing was moved.
    expect(buildCombatStats(s, { sets: false }).reduction).toBeLessThan(off.reduction);
    expect(buildCombatStats(s, { sets: false })).toEqual(buildCombatStats({ ...s, noAffinity: true }, { sets: false }));
  });

  it('Hunting freezes the same stats the Dungeon reads', () => {
    const s = wear([...PLATE5, 'iron_short_sword']);
    expect(buildHuntSession(s, 1_000).stats).toEqual(buildCombatStats(s));
  });

  it('gearOnly (the balance tests) leaves the affinity out, exactly as it leaves the abilities out', () => {
    const s = wear([...LEATHER5, 'short_bow']);
    expect(buildCombatStats(gearOnly(s)).speedBonus).toBeLessThan(buildCombatStats(s).speedBonus);
    expect(buildCombatStats(gearOnly(s))).toEqual(buildCombatStats({ ...s, rotation: [], noAffinity: true }));
  });
});

describe('the measurement switch', () => {
  it('normalizeSave deletes noAffinity, so it can never persist in a real save', () => {
    const s = wear([...LEATHER5, 'short_bow']);
    const loaded = normalizeSave(JSON.parse(JSON.stringify({ ...s, noAffinity: true })) as SaveData);
    expect('noAffinity' in loaded).toBe(false);
    expect(buildCombatStats(loaded)).toEqual(buildCombatStats(s));
  });
});

describe('maxHpPct is alive in the combat, not a dead field', () => {
  const s = wear([...PLATE5, 'iron_short_sword']);
  const off = { ...s, noAffinity: true };

  it('a hero with the affinity has more max HP in the stats, the Hunting session and the CP', () => {
    const on = buildCombatStats(s);
    const base = buildCombatStats(off);
    expect(on.maxHp).toBe(Math.round(base.maxHp * 1.03));
    expect(on.maxHp).toBeGreaterThan(base.maxHp);
    expect(buildHuntSession(s, 1_000).stats.maxHp).toBe(on.maxHp);
    expect(computeCP(s)).toBeGreaterThan(computeCP(off));
  });

  it('the pool the fights start from (stats.maxHp, the only place that derives it) grows by the share', () => {
    expect(affinityDefs().plate.weapon.maxHpPct).toBeGreaterThan(0);
    expect(buildCombatStats(s).maxHp / buildCombatStats(off).maxHp).toBeCloseTo(1.03, 2);
  });
});

describe('the affinity stays below the set bonus', () => {
  // The rule of the design (the tunables comment): uniformity is already paid by the set, so the affinity must be clearly the smaller one or the two together push the player to a pure set.
  const FAMILIES: Record<string, string[]> = {
    plate: ['bronze', 'iron', 'steel', 'gilded', 'voidsteel', 'abyssal'],
    leather: ['hide', 'scout', 'ranger', 'hunter', 'nightstalker', 'abyssalhide'],
    cloth: ['linen', 'homespun', 'silk', 'arcane', 'lunar', 'voidweave'],
  };
  const stepOf = (family: string, i: number): SetEffect => SET_DEFS[family as keyof typeof SET_DEFS].effects[i];
  const sumSteps = (family: string, upTo: number): SetEffect => {
    const out: SetEffect = {};
    for (let i = 0; i <= upTo; i++) for (const k of SET_EFFECT_KEYS) if (stepOf(family, i)[k] !== undefined) out[k] = (out[k] ?? 0) + (stepOf(family, i)[k] as number);
    return out;
  };

  it('every stat of the 3-piece step is below the same stat of the first step of EVERY set of that weight, the weakest included', () => {
    for (const w of AFFINITY_WEIGHTS) {
      const def = affinityDefs()[w];
      for (const family of FAMILIES[w]) {
        const first = stepOf(family, 0);
        for (const k of SET_EFFECT_KEYS) if (def.three[k] && first[k] !== undefined) expect(def.three[k], `${w} 3 vs ${family} ${k}`).toBeLessThan(first[k] as number);
      }
    }
  });

  it('the 5-piece step AND the whole class bonus (5 + weapon) are strictly below the complete set of EVERY family of the weight, the weakest included (bronze, hide, linen), on every stat the set has', () => {
    for (const w of AFFINITY_WEIGHTS) {
      const def = affinityDefs()[w];
      for (const family of FAMILIES[w]) {
        const set = sumSteps(family, 1);
        for (const k of SET_EFFECT_KEYS) {
          if (set[k] === undefined) continue;
          if (def.five[k]) expect(def.five[k], `${w} 5 vs ${family} ${k}`).toBeLessThan(set[k] as number);
          const cls = (def.five[k] ?? 0) + (def.weapon[k] ?? 0);
          if (cls) expect(cls, `${w} class vs ${family} ${k}`).toBeLessThan(set[k] as number);
        }
      }
    }
  });
});

describe('words', () => {
  it('both locales have every affinity key and the new effect line', () => {
    for (const table of [pt, en] as unknown as { affinity: Record<string, unknown>; set: { effect: Record<string, string> } }[]) {
      for (const k of ['title', 'head', 'classOn', 'reflection', 'next', 'nextOne', 'nextWeapon']) expect(typeof table.affinity[k], k).toBe('string');
      expect(table.set.effect.maxHpPct).toMatch(/\{v\}/);
      for (const g of ['weight', 'weapons']) for (const w of AFFINITY_WEIGHTS) expect(typeof (table.affinity[g] as Record<string, string>)[w]).toBe('string');
      for (const c of ['warrior', 'archer', 'mage']) expect(typeof (table.affinity.style as Record<string, string>)[c]).toBe('string');
    }
  });
});
