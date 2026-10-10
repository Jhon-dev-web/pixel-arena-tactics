import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hero } from '../../../scripts/sim/duel';
import { runDungeon, withSeededRandom } from '../../../scripts/sim/driver';
import { applyDamageReduction } from '../derivedStats';
import {
  BUFF_ITEM,
  activeTonicStats,
  buffMinutes,
  buffRemainingMs,
  gathererBonusHours,
  goldMultiplier,
  hasteIntervalMs,
  isBuffActive,
  withTonicStats,
} from '../buffs';
import { applyElixir, applyWhetstoneOil, ELIXIR_DOUBLE_TAP_MS, ElixirId } from '../elixirs';
import { buildCombatStats, buildHuntSession, computeGardenSlotStatus, computeHuntingStatus, computeMiningStatus, defaultSave, GARDEN_SLOTS, normalizeSave, SaveData } from '../engine';
import { GARDEN_PLOT_UNLOCK_LEVELS, getPlant, MAX_GARDEN_PLOTS, PLANTS, plotUnlockLevel, unlockedGardenPlots } from '../garden';
import { applyFertilizer, applyHarvest, applyPlant, applyUproot } from '../gardenActions';
import { CONSUMABLES, emptyConsumables } from '../consumables';
import { GEAR, MAX_DURABILITY, repairCost } from '../gear';
import { equippedSubstatTotals } from '../gearInstances';
import { GOLD_BONUS_CAP } from '../rarity';
import { MATERIALS } from '../materials';
import { POTION_RECIPES } from '../potions';
import { skillXpToReachLevel } from '../skills';
import T from '../tunables';
import en from '../../locales/en.json';
import pt from '../../locales/pt.json';

const HOUR = 3600 * 1000;
const MIN = 60 * 1000;
const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const withLevel = (s: SaveData, gardening: number): SaveData => ({ ...s, skillXp: { ...s.skillXp, gardening: skillXpToReachLevel(gardening, 'gardening') } });
const give = (s: SaveData, items: Partial<Record<string, number>>): SaveData => ({ ...s, consumables: { ...s.consumables, ...items } });
const TONIC_IDS: ElixirId[] = ['stoneskin_tonic', 'fortune_tonic', 'haste_tonic', 'gatherer_brew', 'precision_elixir'];

describe('Garden 3.0 catalog', () => {
  it('the four new plants have the designed level / growth / yield', () => {
    const spec: Record<string, [number, number, number]> = { iron_thistle: [10, 3, 2], gold_blossom: [20, 5, 1], swift_grass: [30, 4, 2], moon_lily: [45, 10, 1] };
    for (const [id, [lvl, hours, qty]] of Object.entries(spec)) {
      const p = getPlant(id)!;
      expect([p.requiredLevel, p.durationMs / HOUR, p.qty]).toEqual([lvl, hours, qty]);
      expect(p.iconUrl).toBe(`/assets/icons/${id}.png`);
    }
  });

  it('the original five plants keep their ids, timings and levels', () => {
    const old: Record<string, [number, number, number]> = { common_herb: [1, 2, 2], energy_herb: [5, 3, 3], uncommon_root: [15, 6, 1], crimson_mushroom: [25, 4, 1], rare_flower: [35, 12, 1] };
    for (const [id, [lvl, hours, qty]] of Object.entries(old)) {
      const p = getPlant(id)!;
      expect([p.requiredLevel, p.durationMs / HOUR, p.qty]).toEqual([lvl, hours, qty]);
    }
  });

  it('every plant, material and consumable has pt and en names and descriptions', () => {
    for (const [name, table] of [['en', en], ['pt', pt]] as const) {
      const root = table as unknown as { garden: Record<string, string>; materials: Record<string, string>; consumables: Record<string, string> };
      for (const p of PLANTS) for (const k of [p.nameKey, p.descKey, p.useKey]) expect(typeof root.garden[k], `${name} garden.${k}`).toBe('string');
      for (const m of MATERIALS) expect(typeof root.materials[m.nameKey], `${name} materials.${m.nameKey}`).toBe('string');
      for (const c of CONSUMABLES) {
        expect(typeof root.consumables[c.nameKey], `${name} consumables.${c.nameKey}`).toBe('string');
        expect(typeof root.consumables[c.descKey], `${name} consumables.${c.descKey}`).toBe('string');
      }
      for (const id of TONIC_IDS) expect(typeof root.consumables[`${id}_active`], `${name} ${id}_active`).toBe('string');
    }
  });

  it('every new consumable is Alchemy-only (never in the Shop) and has a recipe at the designed price and level', () => {
    const spec: Record<string, [Record<string, number>, number, number]> = {
      stoneskin_tonic: [{ iron_thistle: 3, bone_fragment: 2 }, 60, 10],
      fortune_tonic: [{ gold_blossom: 2, common_herb: 2 }, 80, 20],
      haste_tonic: [{ swift_grass: 3, energy_herb: 2 }, 90, 30],
      gatherer_brew: [{ swift_grass: 2, common_herb: 3 }, 50, 15],
      precision_elixir: [{ moon_lily: 1, corrupted_crystal: 1 }, 220, 45],
      whetstone_oil: [{ iron_thistle: 2, leather_scrap: 2 }, 40, 10],
      fertilizer: [{ bone_fragment: 3, common_herb: 2 }, 25, 5],
    };
    for (const [id, [input, cost, level]] of Object.entries(spec)) {
      const r = POTION_RECIPES.find((x) => x.id === id)!;
      expect([r.input, r.cost, r.requiredLevel]).toEqual([input, cost, level]);
      const c = CONSUMABLES.find((x) => x.id === id)!;
      expect(c.purchasable).toBe(false);
      expect(c.cost).toBe(0);
      expect(c.sellValue).toBeLessThan(cost);
      expect(emptyConsumables()[id as keyof ReturnType<typeof emptyConsumables>]).toBe(0);
    }
  });

  it('the ring line and the leather pieces consume Garden materials', () => {
    const need = (id: string) => GEAR.find((g) => g.id === id)!.recipe!.materials!;
    expect(need('copper_ring').common_herb).toBe(2);
    expect(need('silver_ring').iron_thistle).toBe(2);
    expect(need('gold_ring').gold_blossom).toBe(1);
    expect([need('ruby_ring').gold_blossom, need('ruby_ring').crimson_mushroom]).toEqual([1, 1]);
    expect(need('obsidian_ring').moon_lily).toBe(1);
    expect(need('abyssal_ring').moon_lily).toBe(2);
    expect(need('leather_gloves').common_herb).toBe(1);
    expect(need('leather_boots').common_herb).toBe(1);
  });
});

describe('plots', () => {
  it('4 plots at the start, a 5th at Gardening 20 and a 6th at Gardening 40', () => {
    expect(GARDEN_PLOT_UNLOCK_LEVELS).toEqual([20, 40]);
    expect(MAX_GARDEN_PLOTS).toBe(6);
    expect(GARDEN_SLOTS).toBe(6);
    expect([1, 19, 20, 39, 40, 75].map(unlockedGardenPlots)).toEqual([4, 4, 5, 5, 6, 6]);
    expect([0, 3, 4, 5].map(plotUnlockLevel)).toEqual([0, 0, 20, 40]);
  });

  it('a locked plot cannot be planted; it can the moment the level is met', () => {
    const s19 = withLevel(defaultSave(), 19);
    expect(applyPlant(s19, 'common_herb', [4], NOW)).toBeNull();
    expect(applyPlant(s19, 'common_herb', [3], NOW)).not.toBeNull();
    const s20 = withLevel(defaultSave(), 20);
    expect(applyPlant(s20, 'common_herb', [4], NOW)?.gardenSlots[4].plantId).toBe('common_herb');
    expect(applyPlant(s20, 'common_herb', [5], NOW)).toBeNull();
    // plant-all only fills the plots that are open
    const all = applyPlant(s19, 'common_herb', [0, 1, 2, 3, 4, 5], NOW)!;
    expect(all.gardenSlots.map((p) => p.plantId)).toEqual(['common_herb', 'common_herb', 'common_herb', 'common_herb', null, null]);
  });

  it('old saves with 4 plots load with 6 slots, keep their plants and gain the plots when they meet the level', () => {
    const base = defaultSave();
    const legacy = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
    legacy.gardenSlots = [{ plantId: 'rare_flower', startedAt: NOW - HOUR, lastPlantId: 'rare_flower' }, { plantId: null, startedAt: 0 }, { plantId: null, startedAt: 0 }, { plantId: null, startedAt: 0 }];
    delete legacy.buffs;
    const loaded = normalizeSave(legacy);
    expect(loaded.gardenSlots).toHaveLength(6);
    expect(loaded.gardenSlots[0].plantId).toBe('rare_flower');
    expect(loaded.buffs).toEqual({});
    expect(loaded.consumables.fertilizer).toBe(0);
    expect(loaded.materials.moon_lily).toBe(0);
    const levelled = { ...loaded, skillXp: { ...loaded.skillXp, gardening: skillXpToReachLevel(40, 'gardening') } };
    expect(applyPlant(levelled, 'common_herb', [4, 5], NOW)?.gardenSlots.filter((p) => p.plantId).length).toBe(3);
  });
});

describe('fertilizer', () => {
  const planted = (plant = 'rare_flower', elapsedH = 2): SaveData => {
    const s = give(withLevel(defaultSave(), 40), { fertilizer: 3 });
    return { ...applyPlant(s, plant, [0], NOW - elapsedH * HOUR)! };
  };

  it('removes 50% of the REMAINING time, not of the total', () => {
    const s = planted('rare_flower', 2); // 12 h plant, 2 h elapsed -> 10 h left
    const f = applyFertilizer(s, 0, NOW)!;
    expect(computeGardenSlotStatus(f, NOW, 0).remainingMs).toBe(5 * HOUR);
    expect(f.consumables.fertilizer).toBe(2);
    expect(f.gardenSlots[0].fertilized).toBe(true);
  });

  it('once per planting per plot, and only on a growing plot', () => {
    const s = planted();
    const f = applyFertilizer(s, 0, NOW)!;
    expect(applyFertilizer(f, 0, NOW)).toBeNull(); // already fertilized
    expect(applyFertilizer(s, 1, NOW)).toBeNull(); // empty plot
    const ready = planted('common_herb', 3); // 2 h plant planted 3 h ago
    expect(computeGardenSlotStatus(ready, NOW, 0).ready).toBe(true);
    expect(applyFertilizer(ready, 0, NOW)).toBeNull(); // ready plot
    expect(applyFertilizer(give(s, { fertilizer: 0 }), 0, NOW)).toBeNull(); // no unit
    expect(applyFertilizer(s, 0, NaN)).toBeNull();
    // after harvesting and planting again the plot can be fertilized once more
    const f2 = { ...f, gardenSlots: f.gardenSlots.map((p) => p) };
    const harvested = applyHarvest(f2, [0], NOW + 20 * HOUR)!.save;
    const again = applyPlant(harvested, 'rare_flower', [0], NOW + 20 * HOUR)!;
    expect(again.gardenSlots[0].fertilized).toBe(false);
    expect(applyFertilizer(again, 0, NOW + 20 * HOUR)).not.toBeNull();
    // uprooting clears the mark too
    expect(applyUproot(f, 0)!.gardenSlots[0].fertilized).toBe(false);
  });

  it('a fertilizer-boosted plot is ready exactly when the shortened time ends', () => {
    const f = applyFertilizer(planted('rare_flower', 0), 0, NOW)!; // 12 h -> 6 h
    expect(computeGardenSlotStatus(f, NOW + 6 * HOUR - 1, 0).ready).toBe(false);
    expect(computeGardenSlotStatus(f, NOW + 6 * HOUR, 0).ready).toBe(true);
  });

  it('does not raise Garden output by more than 40% for a player who fertilizes every planting at 2 visits a day, 12 h apart (tighter cadences are quantized, see the Horta 3.0 doc)', () => {
    const run = (fertilize: boolean): number => {
      let s = give(withLevel(defaultSave(), 30), { fertilizer: 999 });
      let units = 0;
      for (let step = 0; step < 28; step++) {
        const at = NOW + step * 12 * HOUR;
        const ready = s.gardenSlots.map((_, i) => i).filter((i) => computeGardenSlotStatus(s, at, i).ready);
        const res = ready.length ? applyHarvest(s, ready, at) : null;
        if (res) {
          units += res.harvested.reduce((a, h) => a + h.qty * (getPlant(h.plantId)!.durationMs / HOUR / 2), 0); // output in common-herb-hour equivalents
          s = res.save;
        }
        // 12 h plant when possible; a fertilized 10 h plant (moon lily at Gardening 45) is not available at 30, so the longest the visit gap fits
        s = applyPlant(s, 'swift_grass', [0, 1, 2, 3, 4], at) ?? s;
        if (fertilize) for (let i = 0; i < 5; i++) s = applyFertilizer(s, i, at) ?? s;
      }
      return units;
    };
    const base = run(false);
    expect(run(true) / base).toBeLessThan(1.4);
    expect(run(true)).toBeGreaterThanOrEqual(base);
  });
});

describe('timed buffs: one machinery for every elixir and tonic', () => {
  it('every buff item maps to a kind and drinking one starts it for its configured duration', () => {
    for (const id of [...TONIC_IDS, 'strength_elixir', 'atk_elixir'] as ElixirId[]) {
      expect(BUFF_ITEM[id]).toBeTruthy();
      const next = applyElixir(give(defaultSave(), { [id]: 2 }), id, NOW)!;
      expect(next.consumables[id]).toBe(1);
      expect(isBuffActive(next, BUFF_ITEM[id]!, NOW + 1)).toBe(true);
    }
    const mins = (id: ElixirId) => buffRemainingMs(applyElixir(give(defaultSave(), { [id]: 1 }), id, NOW)!, NOW, BUFF_ITEM[id]!) / MIN;
    expect([mins('stoneskin_tonic'), mins('fortune_tonic'), mins('haste_tonic'), mins('gatherer_brew'), mins('precision_elixir')]).toEqual([30, 60, 30, 120, 30]);
  });

  it('different kinds coexist; the same kind refreshes the duration instead of stacking; a stray double tap spends nothing', () => {
    let s = give(defaultSave(), Object.fromEntries([...TONIC_IDS, 'strength_elixir', 'atk_elixir'].map((i) => [i, 5])));
    for (const id of [...TONIC_IDS, 'strength_elixir', 'atk_elixir'] as ElixirId[]) s = applyElixir(s, id, NOW)!;
    for (const id of [...TONIC_IDS, 'strength_elixir', 'atk_elixir'] as ElixirId[]) expect(isBuffActive(s, BUFF_ITEM[id]!, NOW + 1)).toBe(true);
    const qty = s.consumables.haste_tonic;
    expect(applyElixir(s, 'haste_tonic', NOW + ELIXIR_DOUBLE_TAP_MS - 1)).toBeNull(); // double tap
    expect(s.consumables.haste_tonic).toBe(qty);
    const later = NOW + 10 * MIN;
    const renewed = applyElixir(s, 'haste_tonic', later)!;
    expect(renewed.consumables.haste_tonic).toBe(qty - 1);
    expect(buffRemainingMs(renewed, later, 'haste')).toBe(T.tonics.hasteMinutes * MIN); // full duration from now, not 30 + 20
    expect(renewed.buffs.haste!.from).toBe(NOW); // the run is unbroken, the Mining credit keeps its start
    expect(isBuffActive(renewed, 'stoneskin', later)).toBe(true); // the others are untouched
    // after expiring a new drink starts a fresh run
    const expired = applyElixir(renewed, 'haste_tonic', later + 40 * MIN)!;
    expect(expired.buffs.haste!.from).toBe(later + 40 * MIN);
    expect(applyElixir(defaultSave(), 'haste_tonic', NOW)).toBeNull(); // no unit
  });

  it('buffs survive a reload, are clamped to their duration, and old saves have none', () => {
    const s = applyElixir(give(defaultSave(), { stoneskin_tonic: 1 }), 'stoneskin_tonic', NOW)!;
    const back = normalizeSave(JSON.parse(JSON.stringify(s)));
    expect(back.buffs.stoneskin).toEqual(s.buffs.stoneskin);
    const tampered = normalizeSave({ ...JSON.parse(JSON.stringify(s)), buffs: { stoneskin: { from: NOW, expiresAt: NOW + 1000 * HOUR }, haste: { expiresAt: 'x' }, bogus: { expiresAt: NOW + HOUR } } });
    expect(tampered.buffs.stoneskin!.expiresAt).toBe(NOW + T.tonics.stoneskinMinutes * MIN);
    expect(tampered.buffs.haste).toBeUndefined();
    expect(Object.keys(tampered.buffs)).toEqual(['stoneskin']);
  });
});

describe('tonic effects on the combat stats (Dungeon and Hunting share them)', () => {
  const h = hero('3', 4);
  const c = buildCombatStats(h);

  it('stoneskin adds to the Layer-2 reduction SUM, so the asymptotic formula still applies', () => {
    const s = withTonicStats(c, { stoneskin: true });
    expect(s.reduction).toBeCloseTo(c.reduction + T.tonics.stoneskinReduction, 10);
    expect(applyDamageReduction(1000, s.reduction)).toBeLessThan(applyDamageReduction(1000, c.reduction));
    expect(applyDamageReduction(1000, withTonicStats({ ...c, reduction: 1e9 }, { stoneskin: true }).reduction)).toBeGreaterThanOrEqual(1); // never a full block
  });

  it('haste divides the attack interval through heroAttackIntervalMs and respects its floor', () => {
    const s = withTonicStats(c, { haste: true });
    expect(s.heroMs).toBeLessThan(c.heroMs);
    expect(s.heroMs).toBeGreaterThanOrEqual(T.battle.heroMinMs);
    // an absurd speed bonus (a relic) on top of the tonic still stops at the floor
    const fast = { ...c, speedBonus: 50 };
    expect(hasteIntervalMs(fast)).toBe(T.battle.heroMinMs);
    expect(withTonicStats(fast, { haste: true }).heroMs).toBe(T.battle.heroMinMs);
    // and without agi / speedBonus (a session saved before they existed) it divides heroMs, floored
    expect(hasteIntervalMs({ ...c, agi: undefined, speedBonus: undefined })).toBeCloseTo(Math.max(T.battle.heroMinMs, c.heroMs / (1 + T.tonics.hasteAttackSpeed)), 6);
  });

  it('precision adds absolute crit points, capped at 100%', () => {
    expect(withTonicStats(c, { precision: true }).critChance).toBeCloseTo(c.critChance + T.tonics.precisionCritPoints, 10);
    expect(withTonicStats({ ...c, critChance: 0.97 }, { precision: true }).critChance).toBe(1);
  });

  it('activeTonicStats follows the clock: on while the tonic runs, off the moment it expires', () => {
    const s = applyElixir(give(h, { stoneskin_tonic: 1, haste_tonic: 1, precision_elixir: 1 }), 'stoneskin_tonic', NOW)!;
    const only = activeTonicStats(c, s, NOW + 1);
    expect(only.reduction).toBeGreaterThan(c.reduction);
    expect(only.heroMs).toBe(c.heroMs);
    const all = ['haste_tonic', 'precision_elixir'].reduce((acc, id) => applyElixir(acc, id as ElixirId, NOW)!, s);
    const on = activeTonicStats(c, all, NOW + 1);
    expect([on.reduction > c.reduction, on.heroMs < c.heroMs, on.critChance > c.critChance]).toEqual([true, true, true]);
    expect(activeTonicStats(c, all, NOW + 31 * MIN)).toEqual(c); // all three are 30 minutes
  });

  it('Dungeon: a hero under each combat tonic clears at least as many floors (same seeds)', () => {
    const weak = { ...hero('1', 0, { level: 6 }), highestDungeonFloor: 10, consumables: { ...defaultSave().consumables } };
    const stages = (s: SaveData) => [1, 2, 3, 4, 5, 6].reduce((a, seed) => a + withSeededRandom(seed, () => runDungeon(s, NOW).stages), 0);
    const base = stages(weak);
    for (const id of ['stoneskin_tonic', 'haste_tonic', 'precision_elixir'] as ElixirId[]) {
      expect(stages(applyElixir(give(weak, { [id]: 1 }), id, NOW - 1000)!), id).toBeGreaterThanOrEqual(base);
    }
    const all = (['stoneskin_tonic', 'haste_tonic', 'precision_elixir'] as ElixirId[]).reduce((acc, id) => applyElixir(give(acc, { [id]: 1 }), id, NOW - 1000)!, weak);
    expect(stages(all)).toBeGreaterThan(base);
  });
});

describe('Hunting uses the same tonics (session windows, including one drunk mid-session)', () => {
  const START = NOW;
  // A marginal hunt (T3 +4 hero in the Demon Rift, dense): without help it loses 6 promotion fights in 4 h.
  const base = (): SaveData => ({ ...hero('3', 4, { level: 30 }), highestDungeonFloor: 30, huntingOfflineStart: START });
  const hunt = (s: SaveData): SaveData => ({ ...s, activeHuntingZone: 'demon_rift', activeHuntingDepth: 'dense', huntingOfflineStart: START, huntSession: buildHuntSession(s, START) });
  const status = (s: SaveData, hours = 4) => computeHuntingStatus(s, START + hours * HOUR);
  // lower is better: promotion fights the hero lost in the session
  const wins = (st: ReturnType<typeof status>) => -st.promotionLosses;

  it('the Fortune Tonic adds its share to the gold of the fight time it covers (and only that)', () => {
    const plain = status(hunt(base()));
    const withTonic = status(hunt(applyElixir(give(base(), { fortune_tonic: 1 }), 'fortune_tonic', START - 1)!));
    expect(plain.goldReady).toBeGreaterThan(0);
    // a 60-minute tonic over a 4 h hunt: more gold than without it, but far from the full +20% (it covers a quarter of the session)
    const gain = withTonic.goldReady / plain.goldReady - 1;
    expect(gain).toBeGreaterThan(0);
    expect(gain).toBeLessThan(0.35); // gold is a handful of units here, so rounding moves the ratio; the full-session cap is +20%
    // drunk mid-session it only covers the time from then on; drunk after the session it changes nothing
    const started = hunt(give(base(), { fortune_tonic: 1 }));
    const mid = status(applyElixir(started, 'fortune_tonic', START + 2 * HOUR)!);
    expect(mid.goldReady).toBeGreaterThan(plain.goldReady);
    const after = applyElixir(started, 'fortune_tonic', START + 5 * HOUR)!;
    expect(status(after, 4).goldReady).toBe(plain.goldReady);
  });

  it('stoneskin / haste / precision make a marginal hunt better, whether drunk before or during the session', () => {
    const plain = wins(status(hunt(base())));
    for (const id of ['stoneskin_tonic', 'haste_tonic', 'precision_elixir'] as ElixirId[]) {
      const pre = wins(status(hunt(applyElixir(give(base(), { [id]: 1 }), id, START - 1)!)));
      expect(pre, `${id} before`).toBeGreaterThan(plain);
      const drunk = applyElixir(hunt(give(base(), { [id]: 1 })), id, START + 1 * HOUR)!;
      const kind = BUFF_ITEM[id] as 'stoneskin' | 'haste' | 'precision';
      expect(drunk.huntSession!.tonics![kind]).toEqual([{ from: START + 1 * HOUR, to: START + 1 * HOUR + buffMinutes(kind) * MIN }]); // the window starts when it was drunk
      expect(wins(status(drunk)), `${id} mid`).toBeGreaterThanOrEqual(plain - 1); // fights are seeded: a different timeline can re-roll one fight
    }
    const all = (['stoneskin_tonic', 'haste_tonic', 'precision_elixir'] as ElixirId[]).reduce((acc, id) => applyElixir(give(acc, { [id]: 1 }), id, START - 1)!, base());
    expect(wins(status(hunt(all)))).toBeGreaterThan(plain);
  });

  it('a tonic drunk after the session ended is never retroactive', () => {
    const started = hunt(give(base(), { haste_tonic: 1, stoneskin_tonic: 1 }));
    const later = applyElixir(applyElixir(started, 'haste_tonic', START + 6 * HOUR)!, 'stoneskin_tonic', START + 6 * HOUR)!;
    expect(wins(status(later, 4))).toBe(wins(status(started, 4)));
  });
});

describe('gold: tonic and gear bonus add, the 25% gear cap stays separate', () => {
  it('adds, does not multiply', () => {
    expect(goldMultiplier(0, false)).toBe(1);
    expect(goldMultiplier(10, false)).toBeCloseTo(1.1, 10);
    expect(goldMultiplier(10, true)).toBeCloseTo(1.1 + T.tonics.fortuneGoldPct, 10);
    expect(goldMultiplier(GOLD_BONUS_CAP, true)).toBeCloseTo(1 + GOLD_BONUS_CAP / 100 + T.tonics.fortuneGoldPct, 10);
    expect(goldMultiplier(NaN, true)).toBeCloseTo(1 + T.tonics.fortuneGoldPct, 10);
  });

  it('the gear total is capped before the tonic is added (the tonic is outside the cap)', () => {
    const h = hero('3', 0, { wSubs: Array.from({ length: 4 }, () => ({ type: 'goldBonus' as const, value: 20 })), aSubs: Array.from({ length: 4 }, () => ({ type: 'goldBonus' as const, value: 20 })) });
    const gear = equippedSubstatTotals(h).goldBonus;
    expect(gear).toBe(GOLD_BONUS_CAP);
    expect(goldMultiplier(gear, true)).toBeCloseTo(1 + GOLD_BONUS_CAP / 100 + T.tonics.fortuneGoldPct, 10);
  });
});

describe('Whetstone Oil', () => {
  const worn = (d: number): SaveData => {
    const h = give(hero('3', 0), { whetstone_oil: 2 });
    const gi = { ...h.gearInstances };
    for (const slot of ['weapon', 'armor'] as const) gi[h.equipped[slot]!] = { ...gi[h.equipped[slot]!], durability: d };
    return { ...h, gearInstances: gi };
  };
  const dur = (s: SaveData, slot: 'weapon' | 'armor') => s.gearInstances[s.equipped[slot]!].durability;

  it('restores 30 durability to the equipped weapon AND armor, capped at full, one unit per use', () => {
    const r = applyWhetstoneOil(worn(50))!;
    expect([dur(r, 'weapon'), dur(r, 'armor'), r.consumables.whetstone_oil]).toEqual([80, 80, 1]);
    const near = applyWhetstoneOil(worn(90))!;
    expect([dur(near, 'weapon'), dur(near, 'armor')]).toEqual([MAX_DURABILITY, MAX_DURABILITY]);
  });

  it('does nothing and spends nothing without a unit or when both pieces are already full', () => {
    expect(applyWhetstoneOil(give(worn(50), { whetstone_oil: 0 }))).toBeNull();
    expect(applyWhetstoneOil(worn(MAX_DURABILITY))).toBeNull();
    const one = worn(MAX_DURABILITY);
    one.gearInstances[one.equipped.weapon!] = { ...one.gearInstances[one.equipped.weapon!], durability: 10 };
    const r = applyWhetstoneOil(one)!;
    expect([dur(r, 'weapon'), dur(r, 'armor')]).toEqual([40, MAX_DURABILITY]);
  });

  it('costs meaningfully less gold than the Forge repair it replaces, from tier 1 up', () => {
    const oil = POTION_RECIPES.find((r) => r.id === 'whetstone_oil')!.cost;
    for (let tier = 1; tier <= 6; tier++) expect(oil, `tier ${tier}`).toBeLessThan(repairCost(tier) * 2 * 0.75);
  });
});

describe('Gatherer Brew', () => {
  const mining = (patch: Partial<SaveData> = {}): SaveData => ({ ...defaultSave(), activeOreId: 'copper', lastMiningClaim: NOW - 4 * HOUR, ...patch });

  it('adds its share to the units (and so the XP) of the accrual time it covers', () => {
    const base = computeMiningStatus(mining(), NOW).oreReady;
    // a 2 h session fully inside the 2 h tonic: the whole bonus
    const two = mining({ lastMiningClaim: NOW - 2 * HOUR });
    const plain2 = computeMiningStatus(two, NOW).oreReady;
    const full = computeMiningStatus(applyElixir(give(two, { gatherer_brew: 1 }), 'gatherer_brew', NOW - 2 * HOUR)!, NOW).oreReady;
    expect(full / plain2).toBeGreaterThan(1.15);
    expect(full / plain2).toBeLessThanOrEqual(1 + T.tonics.gathererYieldPct + 0.05);
    expect(base).toBeGreaterThan(0);
    // drunk at the start it covers 2 h of a 4 h session -> about half of the bonus
    const half = computeMiningStatus(applyElixir(give(mining({ lastMiningClaim: NOW }), { gatherer_brew: 1 }), 'gatherer_brew', NOW)!, NOW + 4 * HOUR).oreReady;
    const none = computeMiningStatus(mining({ lastMiningClaim: NOW }), NOW + 4 * HOUR).oreReady;
    expect(half).toBeGreaterThan(none);
    expect(half / none).toBeLessThan(1 + T.tonics.gathererYieldPct * 0.75);
  });

  it('never pays for time outside the tonic: drunk after the session accrued, it adds nothing', () => {
    const s = give(mining(), { gatherer_brew: 1 });
    const late = applyElixir(s, 'gatherer_brew', NOW + 10 * HOUR)!; // session accrued [NOW-4h, NOW]
    expect(gathererBonusHours(late, late.lastMiningClaim, 4 * HOUR)).toBe(0);
    expect(computeMiningStatus(late, NOW).oreReady).toBe(computeMiningStatus(mining(), NOW).oreReady);
  });
});
