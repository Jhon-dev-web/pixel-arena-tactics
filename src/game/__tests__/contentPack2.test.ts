import { describe, expect, it } from 'vitest';
import {
  buildCombatStats,
  buildHuntSession,
  buildHuntSimSetup,
  computeCP,
  computeHuntingStatus,
  defaultSave,
  normalizeSave,
  playerMaxHp,
  SaveData,
  xpToReachLevel,
} from '../engine';
import { GEAR, GearItem, INSTANCED_SLOTS, MAX_DURABILITY, getGear, isInstancedSlot } from '../gear';
import {
  applyDurabilityLoss,
  applyEquipInstance,
  applyForge,
  applyRepair,
  applySalvage,
  applyUnequipSlot,
  createGearInstance,
  equippedSubstatTotals,
  resolveEquipped,
  salvageBlockReason,
} from '../gearInstances';
import { GOLD_BONUS_CAP, Rarity } from '../rarity';
import { simulateHuntingSession } from '../huntCombat';
import { getHuntingZone } from '../huntingZones';
import { emptyMaterials, MATERIALS, MaterialId } from '../materials';
import { cargoReferenceValue } from '../economy';
import { merchantPrice } from '../merchant';
import { applyDiscard } from '../bagActions';
import { applyReforge, getReforgeCost } from '../reforge';
import { getSalvageReturn } from '../salvage';
import { BOSS_RELIC_DROPS, UNIQUE_BOSS_DROPS, addRelics, rollBossRelics, rollBossUniques, sanitizeRelicDrops } from '../uniques';
import { goldMultiplier } from '../buffs';
import { waveRewards } from '../waves';
import { getBiomeForFloor } from '../dungeon';
import { gearStatLines } from '../../components/gearStats';
import { socketsForTier } from '../gems';
import T from '../tunables';
import en from '../../locales/en.json';
import pt from '../../locales/pt.json';
import { duel, hero, repFloor } from '../../../scripts/sim/duel';
import { TIER_EXTRAS } from '../../../scripts/sim/ladder';
import { runDungeon, withSeededRandom } from '../../../scripts/sim/driver';

const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();
const HOUR = 3600 * 1000;
const wire = (s: unknown) => JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
const withRelic = (s: SaveData, id: string | null): SaveData => ({ ...s, equipped: { ...s.equipped, relic: id } });
const withStock = (s: SaveData, id: string, n = 1): SaveData => ({ ...s, inventory: { ...s.inventory, [id]: n } });

const SHIELDS: Record<string, string> = { '1': 'bronze_buckler', '2': 'iron_shield', '3': 'steel_kite_shield', '4g': 'gilded_shield', '5': 'voidsteel_shield', '6': 'abyssal_shield' };
// Object.values would put the '4g' key last: the lines in tier order
const IN_TIER_ORDER = ['1', '2', '3', '4g', '5', '6'];
const SWORDS: Record<string, string> = { '1': 'bronze_dagger', '2': 'iron_short_sword', '3': 'steel_greatsword', '4g': 'gilded_warblade', '5': 'voidsteel_blade', '6': 'abyssal_greatblade' };
const AXES: Record<string, string> = { '1': 'bronze_hatchet', '2': 'iron_battleaxe', '3': 'steel_greataxe', '4g': 'gilded_waraxe', '5': 'voidsteel_cleaver', '6': 'abyssal_reaver' };
const LEVEL_GATE: Record<number, number> = { 1: 0, 2: 10, 3: 25, 4: 50, 5: 70, 6: 90 };
const tierOf = (k: string): number => Number(k[0]);
const set6 = (k: string): [string, string, Rarity, never[]][] => TIER_EXTRAS[tierOf(k)].filter(([s]) => s !== 'shield').map(([s, id]) => [s, id, 'common' as Rarity, [] as never[]]);
const shieldOf = (k: string): [string, string, Rarity, never[]] => ['shield', SHIELDS[k], 'common', []];

function withPieces(ids: string[]): SaveData {
  const s = defaultSave();
  const gearInstances = { ...s.gearInstances };
  for (const id of ids) gearInstances[`t_${id}`] = createGearInstance(id, { id: `t_${id}`, origin: 'craft', rarity: 'common', substats: [] });
  return { ...s, gearInstances };
}

// ---------------------------------------------------------------------------------------------------------------------------------
describe('shield slot', () => {
  it('is the seventh instanced slot; a new save has it empty and no starter', () => {
    expect(INSTANCED_SLOTS[6]).toBe('shield');
    expect(isInstancedSlot('shield')).toBe(true);
    const s = defaultSave();
    expect(s.equipped.shield).toBeNull();
    expect(resolveEquipped(s).shield).toBeNull();
    expect(Object.keys(s.gearInstances).sort()).toEqual(['st_ragged_clothes', 'st_wooden_club']);
  });

  it('equip / unequip: CP goes up with the shield and comes back to the exact same number without it', () => {
    const base = withPieces(['iron_shield']);
    const cp0 = computeCP(base);
    const on = applyEquipInstance(base, 't_iron_shield')!;
    expect(on.equipped.shield).toBe('t_iron_shield');
    expect(computeCP(on)).toBeGreaterThan(cp0);
    expect(applyEquipInstance(on, 't_iron_shield')).toBeNull();
    const off = applyUnequipSlot(on, 'shield');
    expect(off.equipped.shield).toBeNull();
    expect(computeCP(off)).toBe(cp0);
  });

  it('feeds the stats it advertises: resistance + max HP (and reflect from tier 3), in both combat stat assembly sites and the HP the UI shows', () => {
    const base = withPieces(['iron_shield', 'steel_kite_shield']);
    const b0 = buildCombatStats(base);
    const iron = buildCombatStats(applyEquipInstance(base, 't_iron_shield')!);
    expect(iron.maxHp).toBe(b0.maxHp + 36);
    expect(iron.reduction).toBeCloseTo(b0.reduction + 0.06, 9);
    expect(iron.reflect).toBe(0);
    const kite = applyEquipInstance(base, 't_steel_kite_shield')!;
    expect(buildCombatStats(kite).reflect).toBeCloseTo(0.03, 9);
    expect(playerMaxHp(kite)).toBe(b0.maxHp + 52);
    // the Hunting side builds from the very same stats
    const setup = buildHuntSimSetup(kite, getHuntingZone('demon_glade')!, 'shallow', buildHuntSession(kite, NOW), NOW, []);
    expect(setup.build.reduction).toBe(buildCombatStats(kite).reduction);
    expect(setup.build.reflect).toBe(buildCombatStats(kite).reflect);
    expect(setup.build.playerMax).toBe(buildCombatStats(kite).maxHp);
  });

  it('shield reflect adds to the armor reflect and wears with durability', () => {
    const h = hero('3', 0, { level: 30, extra: [shieldOf('3')] });
    const c = buildCombatStats(h);
    expect(c.reflect).toBeCloseTo(0.2 + 0.03, 9);
    const worn = applyDurabilityLoss(h, 100);
    expect(buildCombatStats(worn).reflect).toBeLessThan(c.reflect);
    expect(worn.gearInstances[h.equipped.shield as string].durability).toBe(0);
  });

  it('survives a save round trip, and a save written before shields (no `shield` key at all) loads with the slot empty and the same CP', () => {
    const h = { ...hero('2', 3, { extra: [shieldOf('2')] }), xp: xpToReachLevel(20) };
    const round = normalizeSave(wire(h));
    expect(round.equipped.shield).toBe(h.equipped.shield);
    expect(computeCP(round)).toBe(computeCP(h));
    const old = wire(hero('2', 3));
    delete (old.equipped as Record<string, unknown>).shield;
    const s = normalizeSave(old);
    expect(s.equipped.shield).toBeNull();
    expect(computeCP(s)).toBe(computeCP(hero('2', 3)));
    // a wrong pointer (an instance that is not a shield, a stale string, a number) is dropped
    const bad = wire(h);
    (bad.equipped as Record<string, unknown>).shield = h.equipped.weapon;
    expect(normalizeSave(bad).equipped.shield).toBeNull();
    (bad.equipped as Record<string, unknown>).shield = 12;
    expect(normalizeSave(bad).equipped.shield).toBeNull();
  });

  it('a v1 save (per-item maps) with the old stackable `shield` pointer loads with an empty slot; new materials load as 0', () => {
    const v1 = { gold: 5, xp: 3000, inventory: { wooden_club: 1, ragged_clothes: 1, ring_vitality: 1 }, equipped: { weapon: 'wooden_club', armor: 'ragged_clothes', relic: 'ring_vitality', shield: 'iron_shield' } };
    const s = normalizeSave(v1);
    expect(s.equipped.shield).toBeNull();
    expect(s.equipped.relic).toBe('ring_vitality');
    for (const m of ['rift_shard', 'fiend_horn', 'abyssal_marrow', 'blood_heart'] as MaterialId[]) expect(s.materials[m]).toBe(0);
    // a v2 save whose materials map predates the four new materials
    const old = wire(defaultSave());
    for (const m of ['rift_shard', 'fiend_horn', 'abyssal_marrow', 'blood_heart']) delete (old.materials as Record<string, unknown>)[m];
    const back = normalizeSave(old);
    for (const m of ['rift_shard', 'fiend_horn', 'abyssal_marrow', 'blood_heart'] as MaterialId[]) expect(back.materials[m]).toBe(0);
  });

  it('six forged tiers with the level gate of the armor of the tier, 1 shield of the previous tier from tier 2, wood handle of the tier, hunt materials', () => {
    const line = GEAR.filter((g) => g.slot === 'shield' && !g.unique).sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0));
    expect(line.map((g) => g.id)).toEqual(IN_TIER_ORDER.map((k) => SHIELDS[k]));
    line.forEach((g, i) => {
      expect(g.recipe?.requiredLevel ?? 0).toBe(LEVEL_GATE[g.tier as number]);
      expect(g.recipe?.items ?? {}).toEqual(i === 0 ? {} : { [line[i - 1].id]: 1 });
      expect(Object.keys(g.recipe?.materials ?? {}).some((m) => m.startsWith('wood_handle_')), g.id).toBe(true);
      expect(g.maxHp).toBeGreaterThan(0);
      expect(g.resistance).toBeGreaterThan(0);
      expect(!!g.reflect, g.id).toBe((g.tier ?? 0) >= 3);
    });
  });

  it('forging: consumes ONE shield of the previous tier, respects the gate, and the result is a shield instance', () => {
    let s = withPieces(['bronze_buckler']);
    s = { ...s, gold: 1e6, materials: { ...emptyMaterials(), iron: 10, wood_handle_oak: 5, leather_scrap: 10 } as SaveData['materials'] };
    expect(applyForge(s, 'iron_shield', { level: 5 }).reason).toBe('level');
    const res = applyForge(s, 'iron_shield', { level: 10, now: NOW });
    expect(res.ok).toBe(true);
    expect(res.instance!.templateId).toBe('iron_shield');
    expect(res.consumed!.map((i) => i.templateId)).toEqual(['bronze_buckler']);
    const bare = { ...s, gearInstances: { ...s.gearInstances } };
    delete bare.gearInstances.t_bronze_buckler;
    expect(applyForge(bare, 'iron_shield', { level: 10 }).reason).toBe('ingredients');
  });

  it('salvage returns 45 % of the recipe, reforge uses the armor family, repair restores durability, the equipped one cannot be salvaged', () => {
    const s = withPieces(['abyssal_shield']);
    expect(getSalvageReturn(getGear('abyssal_shield')).materials).toEqual({ concentrated_blood: 1 }); // the small stacks floor to 0 at 45 %
    const out = applySalvage(s, 't_abyssal_shield', () => 0.99)!;
    expect(out.save.gearInstances.t_abyssal_shield).toBeUndefined();
    expect(out.save.materials.concentrated_blood).toBe(1); // floor(3 x 0.45)
    expect(salvageBlockReason(applyEquipInstance(s, 't_abyssal_shield')!, 't_abyssal_shield')).toBe('equipped');
    // reforge: a rare shield rerolls with Concentrated Blood (armor family), never Demon Claw
    const rare = createGearInstance('gilded_shield', { id: 'r1', origin: 'craft', rarity: 'rare' });
    const rs = { ...defaultSave(), gold: 1e6, shards: 9, gearInstances: { ...defaultSave().gearInstances, r1: rare }, materials: { ...emptyMaterials(), concentrated_blood: 200, corrupted_crystal: 200, refining_dust: 200 } as SaveData['materials'] };
    expect(Object.keys(getReforgeCost(rs, 'r1')!.materials)).toContain('concentrated_blood');
    expect(Object.keys(getReforgeCost(rs, 'r1')!.materials)).not.toContain('demon_claw');
    expect(applyReforge(rs, 'r1')!.gearInstances.r1.reforgeCount).toBe(1);
    // repair
    const broken = { ...s, gold: 1000, gearInstances: { t_abyssal_shield: { ...s.gearInstances.t_abyssal_shield, durability: 3 } } };
    expect(applyRepair(broken as SaveData, 't_abyssal_shield', false, 50)!.gearInstances.t_abyssal_shield.durability).toBe(MAX_DURABILITY);
  });

  it('power budget: the shield adds about +7-9 % CP to the full six-slot set of its tier (and about +9-10 % to weapon + armor)', () => {
    for (const k of Object.keys(SHIELDS)) {
      const full = hero(k, 0, { extra: set6(k) });
      const gain = computeCP(hero(k, 0, { extra: [...set6(k), shieldOf(k)] })) / computeCP(full) - 1;
      expect(gain, `tier ${k} full set: +${(gain * 100).toFixed(1)} %`).toBeGreaterThanOrEqual(0.07);
      expect(gain, `tier ${k} full set: +${(gain * 100).toFixed(1)} %`).toBeLessThanOrEqual(0.09);
      const wa = computeCP(hero(k, 0, { extra: [shieldOf(k)] })) / computeCP(hero(k, 0)) - 1;
      expect(wa, `tier ${k} weapon + armor: +${(wa * 100).toFixed(1)} %`).toBeGreaterThanOrEqual(0.08);
      expect(wa, `tier ${k} weapon + armor: +${(wa * 100).toFixed(1)} %`).toBeLessThanOrEqual(0.105);
    }
  });

  it('reflect of armor + shield stays at most ~12 % of the damage dealt for a same-tier build on a same-tier floor', () => {
    for (const [lv, tk, sk] of [[25, '3', '3'], [50, '4g', '4g'], [50, '4d', '4g'], [70, '5', '5'], [90, '6', '6']] as [number, string, string][]) {
      const base = hero(tk, 4, { level: lv, extra: [shieldOf(sk)] });
      const d = duel(base, repFloor(base));
      expect(d.reflectShare, `tier ${tk}`).toBeLessThanOrEqual(0.125); // 0.12 before the Rodada 7 orc retune moved the tier-3 reference floor
      expect(d.reflectShare, `tier ${tk}`).toBeGreaterThan(0.03);
    }
  });
});

describe('shield uniques', () => {
  it('bone_ward drops in the Blood Marsh, warden_bulwark from the floor-50 boss next to warchief_gauntlets; +10 % resistance, one extra substat slot, never forged', () => {
    expect(getHuntingZone('blood_marsh')!.uniques!.map((u) => u.itemId)).toContain('bone_ward');
    expect(UNIQUE_BOSS_DROPS[50]).toEqual(['warchief_gauntlets', 'warden_bulwark']);
    for (const [id, twin] of [['bone_ward', 'steel_kite_shield'], ['warden_bulwark', 'gilded_shield']] as const) {
      const u = getGear(id);
      expect(u.unique).toBe(true);
      expect(u.slot).toBe('shield');
      expect(u.recipe).toBeUndefined();
      expect(u.salvageLike).toBe(twin);
      expect(u.resistance).toBeCloseTo((getGear(twin).resistance as number) * 1.1, 4);
      expect(u.maxHp).toBe(getGear(twin).maxHp);
      expect(u.reflect).toBe(getGear(twin).reflect);
      expect(applyForge({ ...defaultSave(), gold: 1e9 }, id, { level: 100 }).reason).toBe('unknown');
      expect(createGearInstance(id, { origin: 'drop', rarity: 'common' }).substats).toHaveLength(1);
      expect(createGearInstance(id, { origin: 'drop', rarity: 'legendary' }).substats).toHaveLength(4);
    }
  });

  it('the floor-50 boss rolls its two uniques independently at 8 % each', () => {
    const N = 40_000;
    const counts: Record<string, number> = {};
    let both = 0;
    withSeededRandom(9050, () => {
      for (let i = 0; i < N; i++) {
        const r = rollBossUniques(50);
        for (const d of r) counts[d.templateId] = (counts[d.templateId] ?? 0) + 1;
        if (r.length === 2) both++;
      }
    });
    expect(Math.abs(counts.warchief_gauntlets / N - 0.08)).toBeLessThan(0.006);
    expect(Math.abs(counts.warden_bulwark / N - 0.08)).toBeLessThan(0.006);
    expect(Math.abs(both / N - 0.0064)).toBeLessThan(0.003); // independent: 0.08 x 0.08
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
describe('axes: the second weapon line', () => {
  const axes = GEAR.filter((g) => g.line === 'axe');
  it('six forged axes, tiers 1-6, the level gate, recipe and cost of the sword of the tier; the previous-tier AXE is the upgrade input', () => {
    expect(axes.map((a) => a.id)).toEqual(IN_TIER_ORDER.map((k) => AXES[k]));
    for (const k of Object.keys(AXES)) {
      const a = getGear(AXES[k]);
      const sw = getGear(SWORDS[k]);
      expect(a.slot).toBe('weapon');
      expect(a.tier).toBe(sw.tier);
      expect(a.cost).toBe(sw.cost);
      expect(a.recipe?.requiredLevel).toBe(sw.recipe?.requiredLevel);
      expect(a.recipe?.materials).toEqual(sw.recipe?.materials);
      expect(a.recipe?.gems).toEqual(sw.recipe?.gems);
      expect(a.recipe?.shards).toBe(sw.recipe?.shards);
      const need = Object.entries(a.recipe?.items ?? {});
      if (k === '1') expect(need).toEqual([]);
      else {
        expect(need).toHaveLength(1);
        expect(getGear(need[0][0]).line).toBe('axe');
        expect(getGear(need[0][0]).tier).toBe((a.tier as number) - 1);
        // "2 of" where the sword asks for 2, 1 where it asks for 1
        expect(need[0][1]).toBe(Object.values(sw.recipe?.items ?? {})[0]);
      }
      expect(cargoReferenceValue((a.recipe?.materials ?? {}) as Partial<Record<MaterialId, number>>)).toBe(cargoReferenceValue((sw.recipe?.materials ?? {}) as Partial<Record<MaterialId, number>>));
    }
  });

  it('identity: more damage, about half the crit chance, no burn (the dragon / voidsteel / abyssal swords keep it)', () => {
    for (const k of Object.keys(AXES)) {
      const a = getGear(AXES[k]);
      const sw = getGear(SWORDS[k]);
      expect(a.burn).toBeUndefined();
      expect(a.damage as number, k).toBeGreaterThan(sw.damage as number);
      expect((a.damage as number) / (sw.damage as number), k).toBeLessThanOrEqual(1.21);
      expect((a.critChance as number) / (sw.critChance as number), k).toBeGreaterThanOrEqual(0.45);
      expect((a.critChance as number) / (sw.critChance as number), k).toBeLessThanOrEqual(0.55);
    }
    expect(GEAR.filter((g) => g.burn && !g.unique).map((g) => g.id)).toEqual(['dragon_flameblade', 'voidsteel_blade', 'abyssal_greatblade']);
  });

  it('axe against sword of the same tier, real duel margin: within 5 % at levels 30 / 60 / 90; the axe wins with little crit, the sword with a crit-heavy build', () => {
    for (const [k, lv] of [['3', 30], ['4g', 60], ['6', 90]] as [string, number][]) {
      const n = socketsForTier(tierOf(k));
      const ring = TIER_EXTRAS[tierOf(k)].filter(([s]) => s === 'ring').map(([s, id]) => [s, id, 'common', []] as [string, string, Rarity, never[]]);
      const builds: Record<string, (w: string) => SaveData> = {
        plain: (w) => hero(k, 4, { level: lv, weapon: w }),
        mid: (w) => hero(k, 4, { level: lv, weapon: w, extra: set6(k) }),
        crit: (w) => hero(k, 4, { level: lv, weapon: w, extra: ring, wSockets: Array(n).fill('ruby') }),
      };
      const margin: Record<string, number> = {};
      for (const [name, mk] of Object.entries(builds)) {
        const sw = mk(SWORDS[k]);
        const fl = repFloor(sw);
        margin[name] = duel(mk(AXES[k]), fl).P / duel(sw, fl).P - 1;
        expect(Math.abs(margin[name]), `${k} ${name}: ${(margin[name] * 100).toFixed(1)} %`).toBeLessThanOrEqual(0.05);
      }
      expect(margin.plain, `${k} plain`).toBeGreaterThan(0);
      expect(margin.crit, `${k} crit-heavy`).toBeLessThan(0);
    }
  });

  it('the axe line is craftable on its own and an axe works in a build like any weapon', () => {
    let s = withPieces(['bronze_hatchet']);
    s = { ...s, gold: 1e6, materials: { ...emptyMaterials(), iron: 20, leather_scrap: 20, wood_handle_oak: 5 } as SaveData['materials'] };
    // the sword of the previous tier cannot stand in for the axe
    expect(applyForge({ ...s, gearInstances: { ...s.gearInstances, ...withPieces(['bronze_dagger', 'bronze_dagger']).gearInstances } }, 'iron_battleaxe', { level: 10 }).reason).toBe('ingredients');
    const two = { ...s, gearInstances: { ...s.gearInstances, t2: createGearInstance('bronze_hatchet', { id: 't2', origin: 'craft' }) } };
    const res = applyForge(two, 'iron_battleaxe', { level: 10, now: NOW });
    expect(res.ok).toBe(true);
    expect(res.consumed).toHaveLength(2);
    const eq = applyEquipInstance(res.save!, res.instance!.id)!;
    expect(buildCombatStats(eq).burn).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
describe('boss relics', () => {
  const BOSS = Object.values(BOSS_RELIC_DROPS);
  const h50 = hero('4g', 4, { level: 50 });

  it('four stackable relic templates, drop-only: no recipe, no cost, a boss source; never forged, salvaged or sold', () => {
    expect(BOSS).toEqual(['goblin_lucky_coin', 'warchief_totem', 'lich_phylactery', 'overlord_sigil']);
    for (const [floor, id] of Object.entries(BOSS_RELIC_DROPS)) {
      const r = getGear(id);
      expect(r.slot).toBe('relic');
      expect(isInstancedSlot(r.slot)).toBe(false);
      expect(r.recipe).toBeUndefined();
      expect(r.unique).toBeUndefined();
      expect(r.source).toEqual({ bossFloor: Number(floor) });
      expect(applyForge({ ...defaultSave(), gold: 1e9 }, id, { level: 100 }).reason).toBe('unknown');
      expect(salvageBlockReason(withStock(defaultSave(), id), id)).toBe('noValue');
      expect(merchantPrice('material', id)).toBe(0);
    }
  });

  it('effects, exactly as designed: coin +10 % gold, totem +final damage, phylactery lifesteal, sigil +crit chance and +crit damage', () => {
    const b = buildCombatStats(h50);
    const coin = buildCombatStats(withRelic(h50, 'goblin_lucky_coin'));
    expect(coin.goldBonus).toBe(10);
    expect(b.goldBonus).toBe(0);
    expect({ ...coin, goldBonus: 0 }).toEqual({ ...b, goldBonus: 0 }); // nothing else moves
    const totem = buildCombatStats(withRelic(h50, 'warchief_totem'));
    expect(totem.dmgBase / b.dmgBase).toBeCloseTo(1 + (getGear('warchief_totem').damagePct as number), 9);
    expect(totem.critChance).toBe(b.critChance);
    const lich = buildCombatStats(withRelic(h50, 'lich_phylactery'));
    expect(lich.lifesteal).toBe(b.lifesteal + 5);
    const sigil = buildCombatStats(withRelic(h50, 'overlord_sigil'));
    expect(sigil.critChance).toBeCloseTo(b.critChance + 0.04, 9);
    expect(sigil.critMult).toBeCloseTo(b.critMult + 0.2, 9);
  });

  it('Dungeon and Hunting read the same numbers: the hunt build is the combat stats, relic included', () => {
    const zone = getHuntingZone('blood_marsh')!;
    for (const id of BOSS) {
      const s = withRelic(h50, id);
      const c = buildCombatStats(s);
      const { build } = buildHuntSimSetup(s, zone, 'shallow', buildHuntSession(s, NOW), NOW, []);
      expect(build.heroDmgBase, id).toBeCloseTo(c.dmgBase, 9);
      expect(build.critChance, id).toBe(c.critChance);
      expect(build.critMult, id).toBe(c.critMult);
      expect(build.lifestealPct, id).toBe(c.lifesteal);
      expect(build.goldBonusPct, id).toBe(c.goldBonus);
    }
  });

  it('combat relics help in the Dungeon (closed form and the real driver) and in Hunting (the real simulation)', () => {
    const lv = 75;
    const base = hero('5', 4, { level: lv, extra: set6('5') });
    const fl = repFloor(base);
    for (const id of ['warchief_totem', 'lich_phylactery', 'overlord_sigil']) {
      expect(duel(withRelic(base, id), fl).P, `dungeon ${id}`).toBeGreaterThan(duel(base, fl).P);
    }
    // the real Dungeon driver: a stronger hero kills the same floor faster (seeded, so the comparison is exact), no potions
    const run = (s: SaveData) => withSeededRandom(77, () => runDungeon({ ...s, highestDungeonFloor: fl, consumables: { ...s.consumables, small_hp: 0, large_hp: 0, greater_elixir: 0 } }, NOW, 1));
    expect(run(withRelic(base, 'warchief_totem')).seconds).toBeLessThan(run(base).seconds);
    // Hunting: fights that are close to even (a tough zone for this hero), same seed - every combat relic wins more fights or loses fewer
    const zone = getHuntingZone('blood_abyss')!;
    const tough = hero('5', 0, { level: lv });
    const hunt = (s: SaveData) => {
      const { build, zoneCfg, potionCfg, timeline } = buildHuntSimSetup(s, { ...zone, baseEnemyHp: zone.baseEnemyHp * 0.45, baseEnemyDmg: zone.baseEnemyDmg * 0.9 }, 'shallow', buildHuntSession(s, NOW), NOW, []);
      return simulateHuntingSession(build, zoneCfg, { ceiling: 1, promotionWins: 0 }, 6 * HOUR, { ...potionCfg, stock: { greater_elixir: 0, large_hp: 0, small_hp: 0 } }, 'relic-seed', { maxLevel: 1, requiredWins: () => 1 }, timeline);
    };
    const r0 = hunt(tough);
    for (const id of ['warchief_totem', 'lich_phylactery', 'overlord_sigil']) {
      const r = hunt(withRelic(tough, id));
      expect(r.kills - r.defeats, `hunt ${id}: ${r.kills}/${r.defeats} vs ${r0.kills}/${r0.defeats}`).toBeGreaterThanOrEqual(r0.kills - r0.defeats);
      expect(r.kills, `hunt ${id}`).toBeGreaterThanOrEqual(r0.kills);
    }
  });

  it('the Goblin Lucky Coin: +10 % gold from the Dungeon (the gold multiplier) and from Hunting, counted inside the 25 % gear cap', () => {
    const none = equippedSubstatTotals(h50).goldBonus;
    const coin = equippedSubstatTotals(withRelic(h50, 'goblin_lucky_coin')).goldBonus;
    expect(coin - none).toBe(10);
    expect(goldMultiplier(coin, false) / goldMultiplier(none, false)).toBeCloseTo(1.1, 9);
    // the cap: gold substats worth 20 % + the coin is 25 %, not 30 %
    const gold = createGearInstance('gilded_helm', { id: 'gh', origin: 'craft', rarity: 'legendary', substats: [{ type: 'goldBonus', value: 20 }] });
    const capped = { ...h50, gearInstances: { ...h50.gearInstances, gh: gold }, equipped: { ...h50.equipped, helmet: 'gh' } };
    expect(equippedSubstatTotals(capped).goldBonus).toBe(20);
    expect(equippedSubstatTotals(withRelic(capped, 'goblin_lucky_coin')).goldBonus).toBe(GOLD_BONUS_CAP);
    expect(buildCombatStats(withRelic(capped, 'goblin_lucky_coin')).goldBonus).toBe(GOLD_BONUS_CAP);
    // Hunting gold: the same session with and without the coin pays 10 % more (XP, kills and drops are untouched)
    const zone = getHuntingZone('blood_marsh')!;
    const gold4h = (s: SaveData) => {
      const save = { ...s, activeHuntingZone: zone.id, activeHuntingDepth: 'shallow' as const, huntingOfflineStart: NOW, huntSession: buildHuntSession(s, NOW) };
      return computeHuntingStatus(save, NOW + 4 * HOUR);
    };
    const a = gold4h(h50);
    const b = gold4h(withRelic(h50, 'goblin_lucky_coin'));
    expect(b.kills).toBe(a.kills);
    expect(b.xpReady).toBe(a.xpReady);
    expect(b.drops).toEqual(a.drops);
    expect(a.goldReady).toBeGreaterThan(0);
    expect(b.goldReady / a.goldReady).toBeGreaterThan(1.09);
    expect(b.goldReady / a.goldReady).toBeLessThan(1.11);
    // the coin has no combat value, so it adds no CP
    expect(computeCP(withRelic(h50, 'goblin_lucky_coin'))).toBe(computeCP(h50));
  });

  it('drop roll: 4 % per victory over each of the four biome bosses only, independent of the unique roll', () => {
    expect(T.battle.relicBossChance).toBe(0.04);
    const N = 50_000;
    const out = withSeededRandom(4040, () => {
      const rates: Record<number, number> = {};
      let relicAndUnique = 0;
      let relics = 0;
      let uniques = 0;
      for (const floor of [10, 24, 25, 26, 50, 75, 99, 100]) {
        let hits = 0;
        for (let i = 0; i < N; i++) hits += rollBossRelics(floor).length;
        rates[floor] = hits / N;
      }
      // joint behaviour through the real reward roll on the floor-25 boss
      for (let i = 0; i < N; i++) {
        const r = waveRewards(getBiomeForFloor(25), 25);
        relics += r.relics.length;
        uniques += r.uniques.length;
        if (r.relics.length > 0 && r.uniques.length > 0) relicAndUnique++;
      }
      return { rates, relicAndUnique, relics, uniques };
    });
    for (const f of [25, 50, 75, 100]) expect(Math.abs(out.rates[f] - 0.04), `floor ${f}: ${out.rates[f]}`).toBeLessThan(0.004);
    for (const f of [10, 24, 26, 99]) expect(out.rates[f]).toBe(0);
    expect(Math.abs(out.relics / N - 0.04)).toBeLessThan(0.004);
    expect(Math.abs(out.uniques / N - 0.08)).toBeLessThan(0.006);
    expect(Math.abs(out.relicAndUnique / N - 0.0032)).toBeLessThan(0.0015);
    expect(rollBossRelics(50, () => 0)).toEqual(['warchief_totem']);
    expect(rollBossRelics(50, () => 0.5)).toEqual([]);
  });

  it('a regular floor and a checkpoint never drop one; a boss floor reward carries the list', () => {
    withSeededRandom(1, () => {
      for (let i = 0; i < 2000; i++) {
        expect(waveRewards(getBiomeForFloor(24), 24).relics).toEqual([]);
        expect(waveRewards(getBiomeForFloor(30), 30).relics).toEqual([]);
      }
    });
    expect(Array.isArray(waveRewards(getBiomeForFloor(100), 100).relics)).toBe(true);
  });

  it('a second copy stacks, the equipped copy stays when discarding, a stored copy can be discarded, and the list is sanitized', () => {
    let s = addRelics(defaultSave(), ['goblin_lucky_coin']);
    s = addRelics(s, ['goblin_lucky_coin', 'warchief_totem']);
    expect(s.inventory.goblin_lucky_coin).toBe(2);
    expect(s.inventory.warchief_totem).toBe(1);
    s = withRelic(s, 'goblin_lucky_coin');
    const none = applyDiscard(s, 'gear', 'warchief_totem', 'all')!;
    expect(none.inventory.warchief_totem).toBeUndefined();
    const some = applyDiscard(s, 'gear', 'goblin_lucky_coin', 'all')!;
    expect(some.inventory.goblin_lucky_coin).toBe(1); // the worn copy is kept
    expect(applyDiscard(some, 'gear', 'goblin_lucky_coin', 'all')).toBeNull();
    expect(sanitizeRelicDrops(['overlord_sigil', 'iron_shield', 7, 'lich_phylactery'])).toEqual(['overlord_sigil', 'lich_phylactery']);
    expect(sanitizeRelicDrops('nope')).toEqual([]);
    // they survive a save round trip as stackable gear, worn or not
    const back = normalizeSave(wire(s));
    expect(back.inventory.goblin_lucky_coin).toBe(2);
    expect(back.equipped.relic).toBe('goblin_lucky_coin');
  });

  it('each combat relic is worth +4-7 % CP at the level where it drops and within 1.5x of the craftable relics in real value', () => {
    const craftable = GEAR.filter((g) => g.slot === 'relic' && g.recipe).map((g) => g.id);
    const drops: [string, string, number][] = [['warchief_totem', '4g', 50], ['lich_phylactery', '5', 75], ['overlord_sigil', '6', 100]];
    for (const [id, tk, lv] of drops) {
      const base = hero(tk, 4, { level: lv });
      const fl = repFloor(base);
      const lnP = (s: SaveData) => Math.log(duel(s, fl).P / duel(base, fl).P);
      const crafted = craftable.map((c) => lnP(withRelic(base, c)));
      const gain = computeCP(withRelic(base, id)) / computeCP(base) - 1;
      expect(gain, `${id}: +${(gain * 100).toFixed(1)} % CP`).toBeGreaterThanOrEqual(0.035);
      expect(gain, `${id}: +${(gain * 100).toFixed(1)} % CP`).toBeLessThanOrEqual(0.075);
      const v = lnP(withRelic(base, id));
      expect(v, id).toBeGreaterThanOrEqual(Math.min(...crafted) / 1.5);
      expect(v, id).toBeLessThanOrEqual(Math.max(...crafted) * 1.5);
    }
  });

  it('stat lines are generated from the data', () => {
    const text = (id: string) => gearStatLines(getGear(id)).map((l) => l.text).join(' | ');
    expect(text('goblin_lucky_coin')).toMatch(/10/);
    expect(text('warchief_totem')).toMatch(/8[.,]5/);
    expect(text('lich_phylactery')).toMatch(/5/);
    expect(text('overlord_sigil')).toMatch(/4/);
    expect(text('overlord_sigil')).toMatch(/20/);
    for (const id of BOSS) expect(text(id), id).not.toMatch(/\{|undefined|NaN/);
    expect(text('steel_kite_shield')).toMatch(/3/);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------------------
describe('catalog: names, descriptions, icons of the content pack', () => {
  const pack: GearItem[] = GEAR.filter((g) => g.slot === 'shield' || g.line === 'axe' || (g.slot === 'relic' && !g.recipe));
  it('every new piece has pt and en names and digit-free descriptions, and an icon file', () => {
    const files = new Set(Object.keys(import.meta.glob('/public/assets/icons/*.png')));
    expect(pack).toHaveLength(6 + 2 + 6 + 4 + 1); // + the Season Relic (Adventurer Pass)
    for (const g of pack) {
      for (const table of [en, pt] as unknown as { gear: Record<string, string> }[]) {
        expect(typeof table.gear[g.nameKey], g.id).toBe('string');
        expect(table.gear[g.descKey], g.id).not.toMatch(/\d/);
      }
      expect(files.has(`/public${g.icon}`), `${g.id} ${g.icon}`).toBe(true);
    }
    expect(typeof (en.gear as Record<string, string>).shield).toBe('string');
  });

  it('camp_stash.png and gold_pouch.png ship; the gold pouch is reserved (no catalog entry points at it yet)', () => {
    const files = new Set(Object.keys(import.meta.glob('/public/assets/icons/*.png')));
    expect(files.has('/public/assets/icons/camp_stash.png')).toBe(true);
    expect(files.has('/public/assets/icons/gold_pouch.png')).toBe(true);
    const referenced = [...GEAR.flatMap((g) => [g.icon, g.iconUrl]), ...MATERIALS.map((m) => m.iconUrl)].filter(Boolean) as string[];
    expect(referenced.some((u) => u.includes('gold_pouch'))).toBe(false);
  });
});
