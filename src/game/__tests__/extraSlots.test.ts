import { describe, expect, it } from 'vitest';
import {
  buildCombatStats,
  buildHuntSession,
  computeCP,
  computeHuntingStatus,
  defaultSave,
  normalizeSave,
  playerMaxHp,
  SaveData,
} from '../engine';
import { GEAR, INSTANCED_SLOTS, UNIQUE_MAIN_BOOST, UNIQUE_OTHER_BOOST, getGear, isInstancedSlot } from '../gear';
import {
  applyDiscardInstance,
  applyDurabilityLoss,
  applyEquipInstance,
  applyForge,
  applySalvage,
  applyUnequipSlot,
  createGearInstance,
  equippedSubstatTotals,
  isInstanceEquipped,
  resolveEquipped,
  salvageBlockReason,
} from '../gearInstances';
import { applyHuntClaim } from '../huntLifecycle';
import { PendingHuntReward, sanitizePendingHuntReward } from '../huntSession';
import { HUNTING_ZONES } from '../huntingZones';
import { inventoryCapacity, inventorySlotsUsed } from '../inventory';
import { cargoReferenceValue } from '../economy';
import { MaterialId, emptyMaterials } from '../materials';
import { recipeStock } from './recipeStock';
import { applyReforge, getReforgeCost } from '../reforge';
import { getSalvageReturn } from '../salvage';
import { GearInstance } from '../gearInstances';
import { UNIQUE_BOSS_DROPS, UniqueDrop, addUniqueInstance, rollBossUniques, rollUniqueDrop } from '../uniques';
import T from '../tunables';
import { withSeededRandom } from '../../../scripts/sim/driver';
import { hero, withoutSetBonuses } from '../../../scripts/sim/duel';

const EXTRA = ['helmet', 'gloves', 'boots', 'ring'] as const;
// Content pack 2 adds the shield as a fifth extra slot (its own tests are in contentPack2.test.ts).
const EXTRA5 = [...EXTRA, 'shield'] as const;
const HOUR = 3600 * 1000;
const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();
const wire = (s: unknown) => JSON.parse(JSON.stringify(s)) as Record<string, unknown>;

// A fresh save holding one piece of each extra slot (stored, unequipped), ids `t_<templateId>`.
function withPieces(ids: string[], rarity: 'common' | 'epic' = 'common'): SaveData {
  const s = defaultSave();
  const gearInstances = { ...s.gearInstances };
  for (const id of ids) gearInstances[`t_${id}`] = createGearInstance(id, { id: `t_${id}`, origin: 'craft', rarity, substats: [] });
  return { ...s, gearInstances };
}
const equipAll = (s: SaveData, ids: string[]): SaveData => ids.reduce((acc, id) => applyEquipInstance(acc, `t_${id}`) as SaveData, s);

describe('the four extra slots (helmet, gloves, boots, ring)', () => {
  it('INSTANCED_SLOTS has seven slots and every one is instanced; relics are not', () => {
    expect([...INSTANCED_SLOTS]).toEqual(['weapon', 'armor', 'helmet', 'gloves', 'boots', 'ring', 'shield']);
    for (const slot of INSTANCED_SLOTS) expect(isInstancedSlot(slot)).toBe(true);
    expect(isInstancedSlot('relic')).toBe(false);
  });

  it('a new save has empty extra slots and no extra instances (no starter items)', () => {
    const s = defaultSave();
    for (const slot of EXTRA) expect(s.equipped[slot]).toBeNull();
    expect(Object.keys(s.gearInstances).sort()).toEqual(['st_ragged_clothes', 'st_wooden_club']);
    const v = resolveEquipped(s);
    for (const slot of EXTRA) expect(v[slot]).toBeNull();
    expect(v.weapon.item.id).toBe('wooden_club');
  });

  it('equip / unequip works per slot, and CP goes up and comes back down', () => {
    const base = withPieces(['iron_helm', 'iron_gauntlets', 'iron_greaves', 'silver_ring']);
    const cp0 = computeCP(base);
    let s = base;
    for (const [slot, id] of [['helmet', 'iron_helm'], ['gloves', 'iron_gauntlets'], ['boots', 'iron_greaves'], ['ring', 'silver_ring']] as const) {
      const before = computeCP(s);
      const next = applyEquipInstance(s, `t_${id}`);
      expect(next, slot).not.toBeNull();
      expect(next!.equipped[slot]).toBe(`t_${id}`);
      expect(computeCP(next!)).toBeGreaterThan(before);
      expect(isInstanceEquipped(next!, `t_${id}`)).toBe(true);
      s = next!;
    }
    expect(applyEquipInstance(s, 't_iron_helm')).toBeNull(); // already equipped
    for (const slot of EXTRA) s = applyUnequipSlot(s, slot);
    expect(computeCP(s)).toBe(cp0);
    for (const slot of EXTRA) expect(s.equipped[slot]).toBeNull();
  });

  it('each slot feeds the stats it advertises (helmet HP, gloves damage, boots resistance + HP, ring crit chance + crit damage)', () => {
    const ids = ['iron_helm', 'iron_gauntlets', 'iron_greaves', 'silver_ring'];
    const base = withPieces(ids);
    const b0 = buildCombatStats(base);
    const stat = (id: string) => buildCombatStats(equipAll(base, [id]));
    expect(stat('iron_helm').maxHp).toBe(b0.maxHp + 40);
    expect(stat('iron_helm').reduction).toBeCloseTo(b0.reduction + 0.013, 9);
    expect(stat('iron_gauntlets').dmgBase).toBeGreaterThan(b0.dmgBase);
    expect(stat('iron_gauntlets').critChance).toBeCloseTo(b0.critChance + (getGear('iron_gauntlets').critChance as number), 9);
    expect(stat('iron_greaves').reduction).toBeCloseTo(b0.reduction + 0.08, 9);
    expect(stat('iron_greaves').maxHp).toBe(b0.maxHp + 22);
    expect(stat('silver_ring').critChance).toBeCloseTo(b0.critChance + (getGear('silver_ring').critChance as number), 9);
    expect(stat('silver_ring').critMult).toBeCloseTo(b0.critMult + (getGear('silver_ring').critMultBonus as number), 9);
    expect(playerMaxHp(equipAll(base, ['iron_helm']))).toBe(b0.maxHp + 40);
  });

  it('worn-out extra pieces lose power and every equipped slot wears down in the Dungeon', () => {
    const s = equipAll(withPieces(['iron_helm', 'iron_gauntlets', 'iron_greaves', 'silver_ring']), ['iron_helm', 'iron_gauntlets', 'iron_greaves', 'silver_ring']);
    const worn = applyDurabilityLoss(s, 10);
    for (const slot of EXTRA) expect(worn.gearInstances[s.equipped[slot] as string].durability).toBe(90);
    const dead = applyDurabilityLoss(s, 100);
    expect(computeCP(dead)).toBeLessThan(computeCP(s));
  });

  it('the bag does not count equipped extra pieces, and counts stored ones', () => {
    const s = withPieces(['bronze_helm', 'leather_gloves']);
    const used0 = inventorySlotsUsed(s);
    expect(used0).toBeGreaterThanOrEqual(2);
    const e = applyEquipInstance(s, 't_bronze_helm')!;
    expect(inventorySlotsUsed(e)).toBe(used0 - 1);
  });

  it('forging a new-slot piece makes an instance of that slot, consumes ONE piece of the previous tier of the same slot, and respects the level gate', () => {
    let s = withPieces(['bronze_helm']);
    s = { ...s, gold: 1e6, materials: { ...emptyMaterials(), ...recipeStock('iron_helm') } as SaveData['materials'] };
    const low = applyForge(s, 'iron_helm', { level: 5 });
    expect(low.ok).toBe(false);
    expect(low.reason).toBe('level');
    const res = applyForge(s, 'iron_helm', { level: 10, now: NOW });
    expect(res.ok).toBe(true);
    expect(res.instance!.templateId).toBe('iron_helm');
    expect(res.consumed!.map((i) => i.templateId)).toEqual(['bronze_helm']);
    expect(res.save!.gearInstances['t_bronze_helm']).toBeUndefined();
    // without the previous tier the craft is refused
    const bare = { ...s, gearInstances: { ...s.gearInstances } };
    delete bare.gearInstances['t_bronze_helm'];
    expect(applyForge(bare, 'iron_helm', { level: 10 }).reason).toBe('ingredients');
  });

  it('salvaging a forged extra piece returns 45 % of its recipe materials', () => {
    const s = withPieces(['steel_helm']);
    const ret = getSalvageReturn(getGear('steel_helm')).materials;
    const helmBone = getGear('steel_helm').recipe!.materials!.bone_fragment as number;
    expect(ret?.bone_fragment).toBe(Math.floor(helmBone * 0.45)); // 45 % of the recipe, floored per material
    const out = applySalvage(s, 't_steel_helm', () => 0.99);
    expect(out).not.toBeNull();
    expect(out!.save.gearInstances['t_steel_helm']).toBeUndefined();
    expect(out!.save.materials.steel).toBe(0); // floor(2 x 0.45) = 0: small stacks round away, like weapons
    expect(out!.save.materials.bone_fragment).toBe(Math.floor(helmBone * 0.45));
    expect(salvageBlockReason(equipAll(s, ['steel_helm']), 't_steel_helm')).toBe('equipped');
  });
});

describe('old saves load', () => {
  it('a v1 save (per-item maps, the old stackable `helmet` equipped) loads with empty extra slots', () => {
    const v1 = {
      gold: 123,
      xp: 5000,
      inventory: { wooden_club: 1, ragged_clothes: 1, bronze_dagger: 1, ring_vitality: 1 },
      equipped: { weapon: 'bronze_dagger', armor: 'ragged_clothes', relic: 'ring_vitality', shield: null, helmet: 'legacy_helmet' },
      upgrades: { bronze_dagger: 2 },
    };
    const s = normalizeSave(v1);
    for (const slot of EXTRA) expect(s.equipped[slot]).toBeNull();
    expect(s.equipped.relic).toBe('ring_vitality');
    expect(s.gearInstances[s.equipped.weapon as string].templateId).toBe('bronze_dagger');
    expect(s.gearInstances[s.equipped.weapon as string].upgrade).toBe(2);
  });

  it('a v2 save written before the extra slots (only weapon / armor / relic / shield / helmet:null) loads unchanged, CP included', () => {
    const base = hero('2', 3);
    const old = wire(base);
    (old.equipped as Record<string, unknown>) = { weapon: base.equipped.weapon, armor: base.equipped.armor, relic: null, shield: null, helmet: null };
    const s = normalizeSave(old);
    for (const slot of EXTRA) expect(s.equipped[slot]).toBeNull();
    expect(computeCP(s)).toBe(computeCP(base));
    expect(s.equipped.weapon).toBe(base.equipped.weapon);
  });

  it('a stale or wrong-slot pointer in an extra slot is dropped, a valid one survives a round trip', () => {
    let s = equipAll(withPieces(['iron_helm', 'silver_ring']), ['iron_helm', 'silver_ring']);
    s = { ...s, xp: 9000 };
    const round = normalizeSave(wire(s));
    expect(round.equipped.helmet).toBe('t_iron_helm');
    expect(round.equipped.ring).toBe('t_silver_ring');
    expect(computeCP(round)).toBe(computeCP(s));
    expect(round.equipped).toEqual(s.equipped);
    const tampered = wire(s);
    (tampered.equipped as Record<string, unknown>).helmet = 't_silver_ring'; // exists, but it is a ring
    (tampered.equipped as Record<string, unknown>).gloves = 'nope';
    (tampered.equipped as Record<string, unknown>).boots = 12;
    const t = normalizeSave(tampered);
    expect(t.equipped.helmet).toBeNull();
    expect(t.equipped.gloves).toBeNull();
    expect(t.equipped.boots).toBeNull();
    expect(t.equipped.ring).toBe('t_silver_ring');
  });
});

describe('content pack 1: catalog', () => {
  const forged = GEAR.filter((g) => EXTRA5.includes(g.slot as (typeof EXTRA5)[number]) && !g.unique);
  const uniques = GEAR.filter((g) => g.unique);

  it('30 forged pieces: six tiers per slot, the same level gate as the weapon / armor of the tier, previous tier of the same slot from tier 2', () => {
    expect(forged).toHaveLength(30);
    const levelOf: Record<number, number> = { 1: 0, 2: 10, 3: 25, 4: 50, 5: 70, 6: 90 };
    for (const slot of EXTRA5) {
      const line = forged.filter((g) => g.slot === slot).sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0));
      expect(line.map((g) => g.tier)).toEqual([1, 2, 3, 4, 5, 6]);
      line.forEach((g, i) => {
        expect(g.recipe?.requiredLevel ?? 0).toBe(levelOf[g.tier as number]);
        expect(g.recipe?.items ?? {}).toEqual(i === 0 ? {} : { [line[i - 1].id]: 1 });
        expect(g.recipe?.shards ?? 0).toBe(0);
      });
    }
  });

  it('14 uniques: drop-only, no recipe, flagged, with a source, stats = forged twin +15 % on the main stat and +8 % on the others', () => {
    expect(uniques).toHaveLength(14);
    const main: Record<string, 'damage' | 'maxHp' | 'resistance' | 'critChance'> = { weapon: 'damage', armor: 'maxHp', helmet: 'maxHp', gloves: 'damage', boots: 'resistance', ring: 'critChance', shield: 'resistance' };
    for (const u of uniques) {
      expect(u.recipe).toBeUndefined();
      expect(u.source).toBeDefined();
      expect(isInstancedSlot(u.slot)).toBe(true);
      const twin = getGear(u.salvageLike as string);
      expect(twin.slot).toBe(u.slot);
      expect(u.tier).toBe(twin.tier);
      const m = main[u.slot];
      for (const k of ['damage', 'maxHp', 'resistance', 'critChance', 'critMultBonus', 'reflect'] as const) {
        const base = twin[k] as number | undefined;
        if (!base) {
          expect(u[k]).toBeUndefined();
          continue;
        }
        const want = base * (k === m ? UNIQUE_MAIN_BOOST : UNIQUE_OTHER_BOOST);
        expect(Math.abs((u[k] as number) - want), k + ' of ' + u.id).toBeLessThanOrEqual(k === 'damage' || k === 'maxHp' ? 0.5 : 0.0001);
      }
    }
    const byTier = Object.fromEntries(uniques.map((u) => [u.id, u.tier]));
    expect(byTier).toMatchObject({ demon_fang_dagger: 2, demonhide_vest: 2, bloodbound_cleaver: 3, bloodvein_plate: 3, riftwalker_boots: 4, shadow_hood: 4, abyss_heart_ring: 6, bonecrusher_maul: 6, goblin_king_crown: 3, warchief_gauntlets: 4, lich_soul_ring: 5, overlord_greataxe: 6, bone_ward: 3, warden_bulwark: 4 });
  });

  it('every unique is referenced by exactly one source (a zone or a boss)', () => {
    const fromZones = HUNTING_ZONES.flatMap((z) => (z.uniques ?? []).map((u) => u.itemId));
    const fromBosses = Object.values(UNIQUE_BOSS_DROPS).flat();
    expect([...fromZones, ...fromBosses].sort()).toEqual(uniques.map((u) => u.id).sort());
    for (const z of HUNTING_ZONES) for (const u of z.uniques ?? []) expect(getGear(u.itemId).source).toEqual({ zone: z.id });
    for (const [floor, ids] of Object.entries(UNIQUE_BOSS_DROPS)) for (const id of ids) expect(getGear(id).source).toEqual({ bossFloor: Number(floor) });
  });

  it('power budget: the four extra pieces of a tier add about +28-40 % CP over weapon + armor of that tier', () =>
    withoutSetBonuses(() => {
    const SETS: Record<string, string[]> = {
      '1': ['bronze_helm', 'leather_gloves', 'leather_boots', 'copper_ring'],
      '2': ['iron_helm', 'iron_gauntlets', 'iron_greaves', 'silver_ring'],
      '3': ['steel_helm', 'steel_gauntlets', 'steel_greaves', 'gold_ring'],
      '4g': ['gilded_helm', 'gilded_gauntlets', 'gilded_greaves', 'ruby_ring'],
      '5': ['voidsteel_helm', 'voidsteel_gauntlets', 'voidsteel_greaves', 'obsidian_ring'],
      '6': ['abyssal_helm', 'abyssal_gauntlets', 'abyssal_greaves', 'abyssal_ring'],
    };
    for (const [k, ids] of Object.entries(SETS)) {
      const base = computeCP(hero(k, 0));
      const full = computeCP(hero(k, 0, { extra: ids.map((id) => [getGear(id).slot, id, 'common', []] as [string, string, 'common', never[]]) }));
      const gain = full / base - 1;
      expect(gain, `tier ${k}: +${(gain * 100).toFixed(1)} %`).toBeGreaterThanOrEqual(0.28);
      expect(gain, `tier ${k}: +${(gain * 100).toFixed(1)} %`).toBeLessThanOrEqual(0.4);
    }
    }));

  it('cost: each new piece (recipe only, Gold + materials) is about 40-60 % of the same-tier armor', () => {
    const own = (id: string) => {
      const g = getGear(id);
      const r = g.recipe!;
      const gems = Object.values(r.gems ?? {}).reduce((a, b) => a + (b as number), 0);
      return g.cost + cargoReferenceValue((r.materials ?? {}) as Partial<Record<MaterialId, number>>) + (gems + (r.shards ?? 0)) * 4;
    };
    const armor: Record<number, string> = { 1: 'bronze_leather', 2: 'iron_chainmail', 3: 'steel_plate', 4: 'gilded_aegis', 5: 'voidsteel_plate', 6: 'abyssal_bulwark' };
    for (const g of forged) {
      const ratio = own(g.id) / own(armor[g.tier as number]);
      expect(ratio, `${g.id}: ${(ratio * 100).toFixed(0)} %`).toBeGreaterThanOrEqual(0.36);
      expect(ratio, `${g.id}: ${(ratio * 100).toFixed(0)} %`).toBeLessThanOrEqual(g.tier === 1 ? 0.85 : 0.62); // tier 1 is mostly fixed copper / handle cost
    }
  });
});

describe('unique pieces', () => {
  it('can never be forged', () => {
    const s = { ...defaultSave(), gold: 1e9 };
    for (const u of GEAR.filter((g) => g.unique)) {
      const r = applyForge(s, u.id, { level: 100 });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('unknown');
    }
  });

  it('roll one extra substat slot (a legendary one has 4) and a common one is reforgeable', () => {
    for (const [rarity, n] of [['common', 1], ['rare', 2], ['epic', 3], ['legendary', 4]] as const) {
      const inst = createGearInstance('overlord_greataxe', { origin: 'drop', rarity });
      expect(inst.substats).toHaveLength(n);
      expect(new Set(inst.substats.map((s) => s.type)).size).toBe(n);
    }
    let s = defaultSave();
    const inst = createGearInstance('demon_fang_dagger', { id: 'u1', origin: 'drop', rarity: 'common' });
    s = { ...s, gearInstances: { ...s.gearInstances, u1: inst }, gold: 1e6, shards: 50, materials: { ...emptyMaterials(), refining_dust: 50, demon_claw: 50 } as SaveData['materials'] };
    expect(getReforgeCost(s, 'u1')).not.toBeNull();
    const re = applyReforge(s, 'u1')!;
    expect(re.gearInstances.u1.substats).toHaveLength(1);
    expect(re.gearInstances.u1.reforgeCount).toBe(1);
    // a forged common piece has nothing to reroll
    const forgedCommon = createGearInstance('iron_short_sword', { id: 'f1', origin: 'craft', rarity: 'common' });
    expect(getReforgeCost({ gearInstances: { f1: forgedCommon } }, 'f1')).toBeNull();
  });

  it('can be salvaged (like their forged twin), refined sockets aside, and discarded', () => {
    const inst = createGearInstance('bloodbound_cleaver', { id: 'u2', origin: 'drop', rarity: 'epic' });
    const s = { ...defaultSave(), gearInstances: { ...defaultSave().gearInstances, u2: inst } };
    expect(salvageBlockReason(s, 'u2')).toBeNull();
    expect(getSalvageReturn(getGear('bloodbound_cleaver'))).toEqual(getSalvageReturn(getGear('steel_greatsword')));
    const out = applySalvage(s, 'u2', () => 0.99)!;
    expect(out.save.gearInstances.u2).toBeUndefined();
    expect(out.save.materials.bone_fragment).toBe(Math.floor((getGear('steel_greatsword').recipe!.materials!.bone_fragment as number) * 0.45));
    expect(applyDiscardInstance(s, 'u2')!.gearInstances.u2).toBeUndefined();
  });

  it('boss uniques: 3 % per victory for each unique of the four biome-boss floors only, over many seeded rolls', () => {
    expect(T.battle.uniqueBossChance).toBe(0.03);
    const N = 40_000;
    const rates = withSeededRandom(5150, () => {
      const out: Record<string, number> = {};
      for (const floor of [10, 24, 25, 50, 75, 99, 100]) {
        // hits per unique template: the floor-50 boss carries two, each rolled on its own
        const hits: Record<string, number> = {};
        for (let i = 0; i < N; i++) for (const d of rollBossUniques(floor)) hits[d.templateId] = (hits[d.templateId] ?? 0) + 1;
        out[floor] = Object.values(hits).reduce((a, b) => a + b, 0) / N / Math.max(1, (UNIQUE_BOSS_DROPS[floor] ?? []).length);
      }
      return out;
    });
    for (const f of [25, 50, 75, 100]) expect(Math.abs(rates[f] - 0.03), `floor ${f}: ${rates[f]}`).toBeLessThan(0.004);
    for (const f of [10, 24, 99]) expect(rates[f]).toBe(0);
    withSeededRandom(1, () => {
      const drop = rollBossUniques(100, () => 0)[0];
      expect(drop.templateId).toBe('overlord_greataxe');
      expect(getGear(drop.templateId).unique).toBe(true);
    });
  });

  it('a unique drop rolls the normal 63 / 25 / 10 / 2 rarity table', () => {
    const N = 40_000;
    const counts = withSeededRandom(77, () => {
      const c: Record<string, number> = {};
      for (let i = 0; i < N; i++) {
        const d = rollUniqueDrop('lich_soul_ring');
        c[d.rarity] = (c[d.rarity] ?? 0) + 1;
        if (i < 50) expect(d.substats.length).toBeGreaterThanOrEqual(1);
      }
      return c;
    });
    expect(Math.abs(counts.common / N - 0.63)).toBeLessThan(0.01);
    expect(Math.abs(counts.legendary / N - 0.02)).toBeLessThan(0.005);
  });

  it('Hunting: about one unique per ~6-7 days (24 h) of round-the-clock hunting in a zone, i.e. ~25 days of a normal 6 h a day, rolled with the economic fraction', () => {
    const h = hero('2', 4, { level: 20 });
    const zone = HUNTING_ZONES.find((z) => z.id === 'demon_glade')!;
    const ids = new Set(zone.uniques!.map((u) => u.itemId));
    let uniques = 0;
    let hours = 0;
    const SESSIONS = 400;
    for (let i = 0; i < SESSIONS; i++) {
      const start = NOW + i * 7919;
      const save = { ...h, activeHuntingZone: zone.id, activeHuntingDepth: 'shallow' as const, huntingOfflineStart: start, huntSession: buildHuntSession(h, start) };
      const st = computeHuntingStatus(save, start + zone.offlineCapHours * HOUR);
      uniques += st.uniques.length;
      hours += st.pendingMs / HOUR;
      for (const u of st.uniques) expect(ids.has(u.templateId)).toBe(true);
      // deterministic: the same session polled again returns the same drops
      if (i < 3) expect(computeHuntingStatus(save, start + zone.offlineCapHours * HOUR).uniques).toEqual(st.uniques);
    }
    const perDay = (uniques / hours) * 24; // uniques per 24 h of hunting
    expect(perDay, `${uniques} uniques in ${hours.toFixed(0)} h`).toBeGreaterThan(0.07);
    expect(perDay).toBeLessThan(0.3);
  });

  describe('Hunting claim (bag room)', () => {
    const drop = (templateId: string): UniqueDrop => ({ templateId, rarity: 'epic', substats: [{ type: 'critRate', value: 4 }, { type: 'maxHp', value: 20 }, { type: 'defense', value: 5 }] });
    const reward = (uniques: UniqueDrop[]): PendingHuntReward => ({
      id: 'r1',
      zoneId: 'demon_glade',
      depth: 'shallow',
      startedAt: 1,
      endedAt: 2,
      timeMs: 1,
      pendingMs: 1,
      startCeiling: 1,
      ceilingSubLevel: 1,
      promotions: 0,
      promotionLosses: 0,
      promotionWins: 0,
      promotionRequired: 4,
      gold: 100,
      xp: 50,
      bpXp: 0,
      drops: {},
      lost: [],
      uniques,
    });
    const fullBag = (s: SaveData): SaveData => {
      const gearInstances: Record<string, GearInstance> = { ...s.gearInstances };
      // exactly as many stored pieces as it takes to fill the Mochila
      const room = inventoryCapacity(s) - inventorySlotsUsed(s);
      for (let i = 0; i < room; i++) gearInstances[`junk${i}`] = createGearInstance('bronze_helm', { id: `junk${i}`, origin: 'craft', rarity: 'common', substats: [] });
      return { ...s, gearInstances };
    };

    it('a claim with room delivers the uniques as stored instances and clears the reward', () => {
      const s = { ...defaultSave(), pendingHuntReward: reward([drop('demon_fang_dagger'), drop('demonhide_vest')]) };
      const claimed = applyHuntClaim(s, 'r1')!;
      expect(claimed.pendingHuntReward).toBeNull();
      expect(claimed.gold).toBe(100);
      const got = Object.values(claimed.gearInstances).filter((i) => i.origin === 'drop');
      expect(got.map((i) => i.templateId).sort()).toEqual(['demon_fang_dagger', 'demonhide_vest']);
      expect(got[0].rarity).toBe('epic');
      expect(got[0].substats).toHaveLength(3);
      expect(got.every((i) => !isInstanceEquipped(claimed, i.id))).toBe(true);
    });

    it('a full bag never destroys the unique: gold / XP are paid once, the unique stays in the pending reward until there is room', () => {
      const s = fullBag({ ...defaultSave(), pendingHuntReward: reward([drop('demon_fang_dagger')]) });
      expect(inventorySlotsUsed(s)).toBe(inventoryCapacity(s));
      const first = applyHuntClaim(s, 'r1')!;
      expect(first.gold).toBe(100);
      expect(first.pendingHuntReward).not.toBeNull();
      expect(first.pendingHuntReward!.uniques).toHaveLength(1);
      expect(first.pendingHuntReward!.gold).toBe(0);
      expect(first.pendingHuntReward!.xp).toBe(0);
      expect(Object.values(first.gearInstances).some((i) => i.templateId === 'demon_fang_dagger')).toBe(false);
      // claiming again with the bag still full changes nothing about the money
      const again = applyHuntClaim(first, 'r1')!;
      expect(again.gold).toBe(100);
      expect(again.pendingHuntReward!.uniques).toHaveLength(1);
      // free a slot: the unique arrives and the reward closes
      const freed = applyDiscardInstance(again, 'junk0')!;
      const done = applyHuntClaim(freed, 'r1')!;
      expect(done.pendingHuntReward).toBeNull();
      expect(done.gold).toBe(100);
      expect(Object.values(done.gearInstances).filter((i) => i.templateId === 'demon_fang_dagger')).toHaveLength(1);
    });

    it('a unique takes its slot before any material of the same reward (a pile of scraps can never crowd it out)', () => {
      const room = { ...fullBag(defaultSave()) };
      const free = applyDiscardInstance(room, 'junk0')!; // exactly one free slot
      const s: SaveData = { ...free, pendingHuntReward: { ...reward([drop('demon_fang_dagger')]), drops: { leather_scrap: 500 } } };
      const claimed = applyHuntClaim(s, 'r1')!;
      expect(claimed.pendingHuntReward).toBeNull();
      expect(Object.values(claimed.gearInstances).filter((i) => i.templateId === 'demon_fang_dagger')).toHaveLength(1);
      expect(claimed.materials.leather_scrap).toBe(0); // the only free slot went to the unique; the scraps are left behind
    });

    it('a saved pending reward without `uniques` (old save) loads with none, and tampered ones are cleaned', () => {
      const old = wire(reward([]));
      delete old.uniques;
      expect(sanitizePendingHuntReward(old)!.uniques).toEqual([]);
      const dirty = wire(reward([drop('demon_fang_dagger')]));
      (dirty.uniques as unknown[]).push({ templateId: 'iron_short_sword', rarity: 'epic', substats: [] }); // not a unique
      (dirty.uniques as unknown[]).push({ templateId: 'shadow_hood', rarity: 'godly', substats: [{ type: 'bogus', value: 1 }, { type: 'maxHp', value: NaN }] });
      const clean = sanitizePendingHuntReward(dirty)!.uniques;
      expect(clean.map((u) => u.templateId)).toEqual(['demon_fang_dagger', 'shadow_hood']);
      expect(clean[1].rarity).toBe('common');
      expect(clean[1].substats).toEqual([]);
    });

    it('addUniqueInstance makes a unique, never collides, and the instance is a stored `drop`', () => {
      let s = defaultSave();
      s = addUniqueInstance(s, drop('shadow_hood'), 'seed', 5);
      s = addUniqueInstance(s, drop('shadow_hood'), 'seed', 5);
      const ids = Object.keys(s.gearInstances).filter((k) => k.startsWith('gd_seed'));
      expect(ids).toHaveLength(2);
      expect(s.gearInstances[ids[0]].origin).toBe('drop');
    });
  });

  it('equipping a unique adds its stats and its substats count', () => {
    const base = defaultSave();
    const inst = createGearInstance('goblin_king_crown', { id: 'crown', origin: 'drop', rarity: 'legendary', substats: [{ type: 'goldBonus', value: 20 }, { type: 'goldBonus', value: 20 }] });
    const s = applyEquipInstance({ ...base, gearInstances: { ...base.gearInstances, crown: inst } }, 'crown')!;
    expect(s.equipped.helmet).toBe('crown');
    expect(buildCombatStats(s).maxHp).toBeGreaterThan(buildCombatStats(base).maxHp);
    expect(equippedSubstatTotals(s).goldBonus).toBe(25);
  });
});
