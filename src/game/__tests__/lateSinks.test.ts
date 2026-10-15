import { describe, expect, it } from 'vitest';
import { defaultSave, SaveData, xpToReachLevel } from '../engine';
import { applyUpgrade, createGearInstance, GearInstance, isTradeableKind as isTradeable, sanitizeGearInstance } from '../gearInstances';
import { BASE_MAX_REFINE, effectiveCrit, effectiveDamage, farmHours, GEAR, getGear, MAX_REFINE, maxRefineFor, refineBonus, upgradeChance, upgradeCost, upgradeFailDrop } from '../gear';
import { applyLapidar, canAffordLapidar, getLapidarCost, lapidarBlock } from '../lapidar';
import { deepRefineText, lapidarText } from '../lateSinks';
import { emptyMaterials, MaterialId } from '../materials';
import { QUESTS_ACHIEVEMENTS, questProgress } from '../quests';
import { statsOf } from '../stats';
import { SUBSTATS } from '../rarity';
import T from '../tunables';
import en from '../../locales/en.json';
import pt from '../../locales/pt.json';

// Round 16: the late-game sinks. Deep refine (+9 .. +12 on tier 5 and 6 pieces) and Lapidar (lock one substat, roll the others), and the text that states their odds and costs.

const rich = (over: Partial<SaveData> = {}): SaveData => {
  const mats = emptyMaterials();
  for (const m of Object.keys(mats) as MaterialId[]) mats[m] = 50_000;
  return { ...defaultSave(), xp: xpToReachLevel(80), gold: 1_000_000, shards: 500, materials: mats, ...over };
};
const withPiece = (s: SaveData, tpl: string, over: Partial<GearInstance> = {}, id = 'gi_x'): SaveData => ({
  ...s,
  gearInstances: { ...s.gearInstances, [id]: { ...createGearInstance(tpl, { id, origin: 'craft', rarity: 'common', substats: [] }), ...over } },
});
const T6_WEAPON = 'abyssal_greatblade';
const T5_WEAPON = 'voidsteel_blade';
const T4_WEAPON = 'dragon_flameblade';
const EPIC_SUBS = [
  { type: 'critRate' as const, value: 4 },
  { type: 'defense' as const, value: 5 },
];

describe('refinement past +8', () => {
  it('only tier 5 and 6 pieces go to +12; everything else stops at +8 as before', () => {
    expect(BASE_MAX_REFINE).toBe(8);
    expect(MAX_REFINE).toBe(12);
    for (const g of GEAR) if (g.recipe && !g.unique) expect(maxRefineFor(g), g.id).toBe((g.tier ?? 0) >= 5 ? 12 : 8);
  });

  it('is out of reach before day 21: the cheapest tier 5 piece asks for hero level 70 and the sinks open at 60', () => {
    const t5 = GEAR.filter((g) => g.recipe && (g.tier ?? 0) >= T.lateSinks.deepMinTier);
    expect(t5.length).toBeGreaterThan(0);
    expect(Math.min(...t5.map((g) => g.recipe?.requiredLevel ?? 0))).toBeGreaterThanOrEqual(70);
    expect(T.lateSinks.minLevel).toBeGreaterThanOrEqual(60);
  });

  it('keeps every number up to +8 exactly as it was (10% a level, 0.5 crit points a level)', () => {
    const w = getGear(T6_WEAPON);
    for (let l = 0; l <= 8; l++) {
      expect(refineBonus(l)).toBeCloseTo(0.1 * l, 12);
      expect(effectiveDamage(w, l)).toBe(Math.round((w.damage ?? 0) * (1 + 0.1 * l)));
      expect(effectiveCrit(w, l)).toBeCloseTo((w.critChance ?? 0) + 0.005 * l, 12);
    }
    // the odds and costs of the first eight levels did not move either
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(upgradeChance)).toEqual([1, 1, 1, 0.8, 0.7, 0.6, 0.45, 0.3]);
  });

  it('each level past +8 is worth the deep bonus (6%), not 10%', () => {
    const w = getGear(T6_WEAPON);
    for (let l = 9; l <= 12; l++) {
      expect(refineBonus(l) - refineBonus(l - 1)).toBeCloseTo(T.lateSinks.deepBonus, 12);
      expect(effectiveDamage(w, l)).toBe(Math.round((w.damage ?? 0) * (1 + 0.8 + T.lateSinks.deepBonus * (l - 8))));
    }
    expect(effectiveCrit(w, 12) - effectiveCrit(w, 8)).toBeCloseTo(0.005 * (T.lateSinks.deepBonus / 0.1) * 4, 12);
  });

  it('succeeds below the stated chance and fails at it, at every level from +8', () => {
    const base = withPiece(rich(), T6_WEAPON);
    for (let lvl = 8; lvl <= 11; lvl++) {
      const s = { ...base, gearInstances: { ...base.gearInstances, gi_x: { ...base.gearInstances.gi_x, upgrade: lvl } } };
      const chance = upgradeChance(lvl);
      expect(chance).toBe([T.lateSinks.deepChance9, T.lateSinks.deepChance10, T.lateSinks.deepChance11, T.lateSinks.deepChance12][lvl - 8]);
      const ok = applyUpgrade(s, 'gi_x', false, () => chance - 1e-9)!;
      expect(ok.success).toBe(true);
      expect(ok.save.gearInstances.gi_x.upgrade).toBe(lvl + 1);
      const bad = applyUpgrade(s, 'gi_x', false, () => chance)!;
      expect(bad.success).toBe(false);
      expect(bad.save.gearInstances.gi_x).toBeDefined(); // never destroyed
    }
  });

  it('a failure past +9 may cost one level, never below +8; at +8 nothing is lost', () => {
    const base = withPiece(rich(), T6_WEAPON);
    const at = (lvl: number): SaveData => ({ ...base, gearInstances: { ...base.gearInstances, gi_x: { ...base.gearInstances.gi_x, upgrade: lvl } } });
    const draws = (list: number[]) => {
      let i = 0;
      return () => list[i++] ?? 0.999;
    };
    expect(upgradeFailDrop(8)).toBe(0);
    expect(upgradeFailDrop(12)).toBe(0);
    for (const lvl of [9, 10, 11]) {
      const drop = upgradeFailDrop(lvl);
      expect(drop).toBeGreaterThan(0);
      const fell = applyUpgrade(at(lvl), 'gi_x', false, draws([0.999, drop - 1e-9]))!;
      expect(fell.success).toBe(false);
      expect(fell.dropped).toBe(true);
      expect(fell.save.gearInstances.gi_x.upgrade).toBe(lvl - 1);
      const held = applyUpgrade(at(lvl), 'gi_x', false, draws([0.999, drop]))!;
      expect(held.dropped).toBeUndefined();
      expect(held.save.gearInstances.gi_x.upgrade).toBe(lvl);
    }
    // +8 -> +9 failing consumes one draw only (nothing to lose), and the starting level stays +8
    let calls = 0;
    const r = applyUpgrade(at(8), 'gi_x', false, () => (calls++, 0.999))!;
    expect(calls).toBe(1);
    expect(r.save.gearInstances.gi_x.upgrade).toBe(8);
  });

  it('charges the whole attempt, win or lose, and refuses a piece that cannot go past +8', () => {
    const base = withPiece(rich(), T6_WEAPON, { upgrade: 9 });
    const cost = upgradeCost(getGear(T6_WEAPON), 9);
    const r = applyUpgrade(base, 'gi_x', false, () => 0.999)!;
    expect(r.save.gold).toBe(base.gold - cost.gold);
    expect(r.save.shards).toBe(base.shards - (cost.shards ?? 0));
    for (const [m, n] of Object.entries(cost.materials ?? {})) expect(r.save.materials[m as MaterialId]).toBe(base.materials[m as MaterialId] - (n as number));
    const poor = { ...base, materials: { ...base.materials, blood_heart: 0 } };
    expect(applyUpgrade(poor, 'gi_x', false, () => 0)).toBeNull();
    const t4 = withPiece(rich(), T4_WEAPON, { upgrade: 8 });
    expect(applyUpgrade(t4, 'gi_x', false, () => 0)).toBeNull();
    const top = withPiece(rich(), T6_WEAPON, { upgrade: 12 });
    expect(applyUpgrade(top, 'gi_x', false, () => 0)).toBeNull();
  });

  it('the Refine Catalyst still guarantees the climb to +8 but does not buy the chase past it', () => {
    const s = (lvl: number) => withPiece({ ...rich(), consumables: { ...defaultSave().consumables, refine_catalyst: 3 } }, T6_WEAPON, { upgrade: lvl });
    const ok = applyUpgrade(s(7), 'gi_x', true, () => 0.999)!;
    expect(ok.success).toBe(true);
    expect(applyUpgrade(s(8), 'gi_x', true, () => 0)).toBeNull();
  });

  it('costs are written in farm hours of the last zone, and tier 5 pays the stated share of tier 6', () => {
    const t6 = (lvl: number) => upgradeCost(getGear(T6_WEAPON), lvl);
    const t5 = (lvl: number) => upgradeCost(getGear(T5_WEAPON), lvl);
    const hours = [T.lateSinks.deepHours9, T.lateSinks.deepHours10, T.lateSinks.deepHours11, T.lateSinks.deepHours12];
    for (let lvl = 8; lvl <= 11; lvl++) {
      expect(t6(lvl).materials).toEqual(farmHours(hours[lvl - 8]));
      expect(t5(lvl).materials).toEqual(farmHours(hours[lvl - 8] * T.lateSinks.deepTier5Share));
      expect(t6(lvl).gold).toBe([T.lateSinks.deepGold9, T.lateSinks.deepGold10, T.lateSinks.deepGold11, T.lateSinks.deepGold12][lvl - 8]);
      expect(t6(lvl).shards ?? 0).toBe(lvl >= 10 ? T.lateSinks.deepShards : 0);
    }
    // the cost never falls as the level rises
    for (let lvl = 9; lvl <= 11; lvl++) for (const [m, n] of Object.entries(t6(lvl - 1).materials ?? {})) expect(t6(lvl).materials?.[m as MaterialId] ?? 0).toBeGreaterThanOrEqual(n as number);
  });

  it('refining past +8 changes nothing about who may sell the piece', () => {
    for (const bound of [false, true]) {
      const s = withPiece(rich(), T6_WEAPON, { upgrade: 8, rarity: 'epic', substats: EPIC_SUBS, ...(bound ? { bound: true } : {}) });
      const before = s.gearInstances.gi_x;
      const after = applyUpgrade(s, 'gi_x', false, () => 0)!.save.gearInstances.gi_x;
      expect(after.upgrade).toBe(9);
      expect(after.bound).toBe(before.bound);
      expect(after.rarity).toBe('epic');
      expect(isTradeable(after)).toBe(isTradeable(before));
    }
  });

  it('the +4..+8 steps of a tier 5 or 6 piece cost the late-game share of the Gold and no Runas; every lower tier pays what it always paid', () => {
    const low = getGear(T4_WEAPON);
    for (let lvl = 0; lvl < BASE_MAX_REFINE; lvl++) {
      const expectedGold = lvl < 3 ? 50 * (lvl + 1) : lvl < 6 ? 150 * (lvl + 1) : 300 * (lvl + 1);
      expect(upgradeCost(low, lvl).gold, `T4 +${lvl}`).toBe(expectedGold);
      expect(upgradeCost(low, lvl).shards ?? 0).toBe(lvl >= 6 ? 2 : 0);
      for (const tpl of [T5_WEAPON, T6_WEAPON]) {
        const c = upgradeCost(getGear(tpl), lvl);
        expect(c.gold, `${tpl} +${lvl}`).toBe(Math.round(expectedGold * T.lateSinks.lateRefineGoldShare));
        expect(c.shards ?? 0).toBe(lvl >= 6 ? T.lateSinks.lateRefineShards : 0);
      }
    }
  });

  it('a saved piece keeps its level up to its own ceiling and no further', () => {
    const raw = (tpl: string, up: number) => sanitizeGearInstance({ templateId: tpl, rarity: 'common', substats: [], upgrade: up, sockets: [], durability: 100, reforgeCount: 0, createdAt: 0, origin: 'craft' }, 'k');
    expect(raw(T6_WEAPON, 12)?.upgrade).toBe(12);
    expect(raw(T6_WEAPON, 40)?.upgrade).toBe(12);
    expect(raw(T4_WEAPON, 12)?.upgrade).toBe(8);
  });
});

describe('Lapidar', () => {
  const epic = (over: Partial<GearInstance> = {}, tpl = T6_WEAPON, save: SaveData = rich()) => withPiece(save, tpl, { rarity: 'epic', substats: EPIC_SUBS.map((x) => ({ ...x })), ...over });

  it('needs an Epic or Legendary piece of tier 4 or more, and the hero level that opens it', () => {
    expect(lapidarBlock(epic(), 'gi_x')).toBeNull();
    expect(lapidarBlock(withPiece(rich(), T6_WEAPON, { rarity: 'rare', substats: [EPIC_SUBS[0]] }), 'gi_x')).toBe('rarity');
    expect(lapidarBlock(withPiece(rich(), T6_WEAPON), 'gi_x')).toBe('rarity');
    expect(lapidarBlock(epic({}, 'steel_greatsword'), 'gi_x')).toBe('tier'); // tier 3
    expect(lapidarBlock(epic({}, T6_WEAPON, rich({ xp: xpToReachLevel(T.lateSinks.minLevel - 1) })), 'gi_x')).toBe('level');
    expect(lapidarBlock(epic({}, T6_WEAPON, rich({ xp: xpToReachLevel(T.lateSinks.minLevel) })), 'gi_x')).toBeNull();
    expect(lapidarBlock(rich(), 'nope')).toBe('unknown');
  });

  it('keeps the locked stat as it was and rolls the others again without repeating a type', () => {
    for (const lock of [0, 1]) {
      let s = epic();
      for (let i = 0; i < 25; i++) {
        s = applyLapidar(s, 'gi_x', lock)!;
        const subs = s.gearInstances.gi_x.substats;
        expect(subs).toHaveLength(2);
        expect(subs[lock]).toEqual(EPIC_SUBS[lock]);
        expect(new Set(subs.map((x) => x.type)).size).toBe(2);
        const range = SUBSTATS.find((d) => d.type === subs[1 - lock].type)!;
        expect(range).toBeDefined();
      }
    }
  });

  it('a legendary piece rerolls its other two stats', () => {
    const subs3 = [...EPIC_SUBS, { type: 'lifesteal' as const, value: 1 }];
    const s = withPiece(rich(), T6_WEAPON, { rarity: 'legendary', substats: subs3.map((x) => ({ ...x })) });
    const r = applyLapidar(s, 'gi_x', 2)!;
    expect(r.gearInstances.gi_x.substats).toHaveLength(3);
    expect(r.gearInstances.gi_x.substats[2]).toEqual(subs3[2]);
    expect(new Set(r.gearInstances.gi_x.substats.map((x) => x.type)).size).toBe(3);
  });

  it('charges Gold, Runas and the farm-hour bundle once, counts the lapidation and touches nothing else on the piece', () => {
    const s = epic({ upgrade: 9, sockets: ['ruby'], durability: 61, reforgeCount: 3, bound: true });
    const cost = getLapidarCost(s, 'gi_x')!;
    const r = applyLapidar(s, 'gi_x', 0)!;
    expect(r.gold).toBe(s.gold - cost.gold);
    expect(r.shards).toBe(s.shards - cost.shards);
    for (const [m, n] of Object.entries(cost.materials)) expect(r.materials[m as MaterialId]).toBe(s.materials[m as MaterialId] - (n as number));
    const a = s.gearInstances.gi_x;
    const b = r.gearInstances.gi_x;
    expect({ ...b, substats: a.substats, lapidarCount: undefined }).toEqual({ ...a, lapidarCount: undefined });
    expect(b.lapidarCount).toBe(1);
    expect(statsOf(r).lapidations).toBe(1);
    expect(Object.keys(r.gearInstances)).toEqual(Object.keys(s.gearInstances));
  });

  it('every earlier lapidation on the same piece makes the next one dearer, up to the stated cap, and a fresh copy starts cheap', () => {
    const base = getLapidarCost(epic(), 'gi_x')!;
    expect(base.hours).toBe(T.lateSinks.lapidarHours6);
    let prev = base.hours;
    for (let n = 1; n <= T.lateSinks.lapidarMaxGrowth + 3; n++) {
      const c = getLapidarCost(epic({ lapidarCount: n }), 'gi_x')!;
      const expected = T.lateSinks.lapidarHours6 * (1 + T.lateSinks.lapidarGrowth * Math.min(n, T.lateSinks.lapidarMaxGrowth));
      expect(c.hours).toBeCloseTo(expected, 9);
      expect(c.hours).toBeGreaterThanOrEqual(prev);
      prev = c.hours;
    }
    const withOther = withPiece(epic({ lapidarCount: 5 }), T6_WEAPON, { rarity: 'epic', substats: EPIC_SUBS }, 'gi_other');
    expect(getLapidarCost(withOther, 'gi_other')!.hours).toBe(base.hours);
    expect(getLapidarCost(withOther, 'gi_x')!.hours).toBeGreaterThan(base.hours);
  });

  it('is all-or-nothing: a missing resource, a bad lock or a blocked piece charges nothing and rolls nothing', () => {
    let draws = 0;
    const rng = () => (draws++, 0.5);
    const s = epic();
    for (const poor of [{ gold: 0 }, { shards: 0 }, { materials: { ...s.materials, blood_heart: 0 } }]) {
      expect(applyLapidar({ ...s, ...poor }, 'gi_x', 0, rng)).toBeNull();
    }
    expect(applyLapidar(s, 'gi_x', 2, rng)).toBeNull();
    expect(applyLapidar(s, 'gi_x', -1, rng)).toBeNull();
    expect(applyLapidar(s, 'gi_x', 0.5, rng)).toBeNull();
    expect(applyLapidar(withPiece(rich(), T6_WEAPON), 'gi_x', 0, rng)).toBeNull();
    expect(draws).toBe(0);
    expect(canAffordLapidar({ ...s, shards: 0 }, getLapidarCost(s, 'gi_x')!)).toBe(false);
  });

  it('does not change who may sell the piece: the bound flag and the rarity stay, so isTradeable stays what it was', () => {
    const open = applyLapidar(epic(), 'gi_x', 0)!.gearInstances.gi_x;
    expect(open.bound).toBeUndefined();
    expect(isTradeable(open)).toBe(true);
    const bound = applyLapidar(epic({ bound: true }), 'gi_x', 0)!.gearInstances.gi_x;
    expect(bound.bound).toBe(true);
    expect(isTradeable(bound)).toBe(false);
  });

  it('survives saving and loading (the counter is kept, a piece never lapidated stays without the field)', () => {
    const r = applyLapidar(epic(), 'gi_x', 0)!.gearInstances.gi_x;
    expect(sanitizeGearInstance(JSON.parse(JSON.stringify(r)), 'gi_x')?.lapidarCount).toBe(1);
    const fresh = epic().gearInstances.gi_x;
    expect('lapidarCount' in (sanitizeGearInstance(JSON.parse(JSON.stringify(fresh)), 'gi_x') ?? {})).toBe(false);
  });
});

describe('the text states what the code does, in both languages', () => {
  const render = (tree: unknown, line: { key: string; params: Record<string, number> }): string => {
    const raw = line.key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], tree) as string;
    return raw.replace(/\{(\w+)\}/g, (whole, k) => String(line.params[k] ?? whole));
  };
  const numbersIn = (s: string): number[] => (s.match(/\d+/g) ?? []).map(Number);

  it('every placeholder is filled and every number is in the sentence', () => {
    for (const line of [deepRefineText(), lapidarText()]) {
      for (const tree of [pt, en]) {
        const text = render(tree, line);
        expect(text, line.key).not.toMatch(/\{\w+\}/);
        for (const v of Object.values(line.params)) expect(numbersIn(text), `${line.key} ${v}`).toContain(v);
      }
    }
  });

  it('deep refine: the chances, falls and bonus in the sentence are the ones the engine uses', () => {
    const p = deepRefineText().params;
    expect(p.tier).toBe(T.lateSinks.deepMinTier);
    expect(p.b).toBe(Math.round((refineBonus(9) - refineBonus(8)) * 100));
    expect([p.c9, p.c10, p.c11, p.c12]).toEqual([8, 9, 10, 11].map((l) => Math.round(upgradeChance(l) * 100)));
    expect([p.d10, p.d11, p.d12]).toEqual([9, 10, 11].map((l) => Math.round(upgradeFailDrop(l) * 100)));
    const base = withPiece(rich(), T6_WEAPON);
    for (let lvl = 8; lvl <= 11; lvl++) {
      const s = { ...base, gearInstances: { ...base.gearInstances, gi_x: { ...base.gearInstances.gi_x, upgrade: lvl } } };
      const pct = [p.c9, p.c10, p.c11, p.c12][lvl - 8];
      expect(applyUpgrade(s, 'gi_x', false, () => pct / 100 - 1e-9)!.success).toBe(true);
      expect(applyUpgrade(s, 'gi_x', false, () => pct / 100 + 1e-9)!.success).toBe(false);
    }
  });

  it('lapidar: the tier, level, growth and cap in the sentence are the ones the engine uses', () => {
    const p = lapidarText().params;
    const s = withPiece(rich(), T6_WEAPON, { rarity: 'epic', substats: EPIC_SUBS });
    expect(p.lvl).toBe(T.lateSinks.minLevel);
    expect(lapidarBlock({ ...s, xp: xpToReachLevel(p.lvl - 1) }, 'gi_x')).toBe('level');
    expect(lapidarBlock({ ...s, xp: xpToReachLevel(p.lvl) }, 'gi_x')).toBeNull();
    expect(lapidarBlock(withPiece(rich(), GEAR.find((g) => g.slot === 'weapon' && g.tier === p.tier - 1 && g.recipe)!.id, { rarity: 'epic', substats: EPIC_SUBS }), 'gi_x')).toBe('tier');
    expect(lapidarBlock(withPiece(rich(), GEAR.find((g) => g.slot === 'weapon' && g.tier === p.tier && g.recipe)!.id, { rarity: 'epic', substats: EPIC_SUBS }), 'gi_x')).toBeNull();
    const first = getLapidarCost(s, 'gi_x')!.hours;
    const one = withPiece(rich(), T6_WEAPON, { rarity: 'epic', substats: EPIC_SUBS, lapidarCount: 1 });
    expect(Math.round((getLapidarCost(one, 'gi_x')!.hours / first - 1) * 100)).toBe(p.g);
    const capped = withPiece(rich(), T6_WEAPON, { rarity: 'epic', substats: EPIC_SUBS, lapidarCount: p.max });
    const over = withPiece(rich(), T6_WEAPON, { rarity: 'epic', substats: EPIC_SUBS, lapidarCount: p.max + 5 });
    expect(getLapidarCost(over, 'gi_x')!.hours).toBe(getLapidarCost(capped, 'gi_x')!.hours);
  });

  it('every new screen string exists in both languages', () => {
    for (const key of ['forge.upgradeDropped', 'forge.lapidarDone', 'inventory.lapidarTitle', 'inventory.lapidarCount', 'inventory.lapidarPick', 'inventory.lapidarBtn', 'inventory.lapidarNeedLevel', 'inventory.lapidarNeedTier', 'inventory.lapidarNeedRarity']) {
      for (const tree of [pt, en]) expect(key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], tree), key).toBeTypeOf('string');
    }
  });
});

describe('achievements of the late-game sinks', () => {
  const ids = ['ACH_REFINE_9', 'ACH_REFINE_10', 'ACH_REFINE_12', 'ACH_LAPIDAR_1', 'ACH_LAPIDAR_25'];
  it('exist, read the right numbers, and the ones the simulator can see pay nothing', () => {
    const list = ids.map((id) => QUESTS_ACHIEVEMENTS.find((q) => q.id === id)!);
    for (const q of list) expect(q, q.id).toBeDefined();
    for (const q of list.filter((x) => x.metric === 'max_refine')) {
      expect(q.gold, q.id).toBe(0);
      expect(q.shards, q.id).toBe(0);
    }
    const ctx = { cp: 0, maxRefine: 10 };
    expect(questProgress(list[0], defaultSave().quests, ctx)).toBe(10);
    const st = { ...statsOf(defaultSave()), lapidations: 7 };
    expect(questProgress(list[3], defaultSave().quests, { ...ctx, stats: st })).toBe(7);
  });
});
