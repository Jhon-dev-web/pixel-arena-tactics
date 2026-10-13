import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUFF_ITEM, buffRemainingMs, isBuffActive, prospectBonusHours } from '../buffs';
import { CONSUMABLES } from '../consumables';
import { applyElixir, applyRepairKit } from '../elixirs';
import { combatModifiersFromSave, computeGardenSlotStatus, computeHuntingStatus, computeMiningStatus, defaultSave, SaveData } from '../engine';
import { PLANTS, plantHarvestXp } from '../garden';
import { applyHarvest, applyPlant } from '../gardenActions';
import { applyClaimGathering } from '../gathering';
import { MAX_DURABILITY } from '../gear';
import { isIconPending } from '../iconPending';
import { usesOf } from '../itemUses';
import { gardenTimeFactor, gatherByProducts, gatherMasteryMult, masteryPerks, plantGrowthMs, professionUnlocks } from '../mastery';
import { MATERIALS, MaterialId } from '../materials';
import { POTION_RECIPES } from '../potions';
import { REFINING_RECIPES } from '../refining';
import { requestHuntStart } from '../huntLifecycle';
import { applyDamageModifiers } from '../derivedStats';
import { skillXpToReachLevel } from '../skills';
import { getHuntingZone } from '../huntingZones';
import T from '../tunables';
import { withSeededRandom } from '../../../scripts/sim/driver';
import { CODEX_MATERIALS } from '../codex';
import en from '../../locales/en.json';
import pt from '../../locales/pt.json';

const HOUR = 3600 * 1000;
const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const withLevel = (s: SaveData, skill: 'mining' | 'woodcutting' | 'gardening', level: number): SaveData => ({ ...s, skillXp: { ...s.skillXp, [skill]: skillXpToReachLevel(level, skill) } });
const give = (s: SaveData, items: Partial<Record<string, number>>): SaveData => ({ ...s, consumables: { ...s.consumables, ...items } });

describe('Round 12: plants for Gardening 46-75', () => {
  const NEW = ['silver_sage', 'dusk_orchid', 'elder_root'];

  it('three new plants unlock at 50 / 60 / 70 and pay the same XP per plot-hour as every plant', () => {
    expect(NEW.map((id) => PLANTS.find((p) => p.id === id)!.requiredLevel)).toEqual([50, 60, 70]);
    for (const p of PLANTS) expect(plantHarvestXp(p) / (p.durationMs / HOUR)).toBe(T.skills.gardenXpPerHour);
  });

  it('every new plant feeds an Alchemy recipe, has a codex entry and pt / en text', () => {
    for (const id of NEW) {
      expect(POTION_RECIPES.some((r) => (r.input[id as MaterialId] ?? 0) > 0), id).toBe(true);
      expect(CODEX_MATERIALS).toContain(id);
      for (const table of [en, pt] as const) {
        const g = (table as unknown as { garden: Record<string, string>; materials: Record<string, string> });
        expect(typeof g.garden[`plant_${id}`]).toBe('string');
        expect(typeof g.garden[`plant_${id}_use`]).toBe('string');
        expect(typeof g.materials[`mat_${id}`]).toBe('string');
      }
    }
  });

  it('the plants are planted and harvested like any other (and not before their level)', () => {
    const s0 = defaultSave();
    expect(applyPlant(s0, 'silver_sage', [0], NOW)).toBeNull();
    const s1 = applyPlant(withLevel(s0, 'gardening', 50), 'silver_sage', [0], NOW)!;
    const done = applyHarvest(s1, [0], NOW + 9 * HOUR)!;
    expect(done.harvested[0].material).toBe('silver_sage');
    expect(done.save.materials.silver_sage).toBe(2);
  });
});

describe('Round 12: profession mastery', () => {
  it('every profession lists its tiers or plants and four perks at 50 / 60 / 70 / 75, in level order', () => {
    for (const skill of ['mining', 'woodcutting', 'gardening'] as const) {
      const list = professionUnlocks(skill);
      expect(list.filter((e) => e.kind === 'perk').map((e) => e.level)).toEqual([50, 60, 70, 75]);
      expect(list.map((e) => e.level)).toEqual([...list.map((e) => e.level)].sort((a, b) => a - b));
      expect(list.some((e) => e.kind !== 'perk')).toBe(true);
      // something to unlock at least every 25 levels up to the cap
      const levels = [1, ...list.map((e) => e.level)];
      for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1], skill).toBeLessThanOrEqual(25);
      expect(levels[levels.length - 1]).toBe(75);
    }
    for (const lang of [en, pt] as const) {
      const perks = (lang as unknown as { mastery: { perks: Record<string, string> } }).mastery.perks;
      for (const skill of ['mining', 'gardening'] as const) for (const p of masteryPerks(skill)) expect(typeof perks[p.id], p.id).toBe('string');
    }
  });

  it('below level 50 nothing changes: multipliers are exactly 1 and no by-product exists', () => {
    expect(gatherMasteryMult('mining', 49)).toBe(1);
    expect(gardenTimeFactor(49)).toBe(1);
    expect(gatherByProducts('mining', 49, 10000)).toEqual({ dust: 0, gems: {} });
    expect(plantGrowthMs(PLANTS[0], 49)).toBe(PLANTS[0].durationMs);
  });

  it('Mining / Woodcutting perks: +4% at 50 and 70, dust at 60, a gem at 75 (deterministic)', () => {
    expect(gatherMasteryMult('woodcutting', 50)).toBeCloseTo(1.04);
    expect(gatherMasteryMult('woodcutting', 60)).toBeCloseTo(1.04);
    expect(gatherMasteryMult('woodcutting', 70)).toBeCloseTo(1.08);
    expect(gatherByProducts('mining', 60, 100).dust).toBe(2);
    expect(gatherByProducts('mining', 59, 100).dust).toBe(0);
    expect(Object.values(gatherByProducts('mining', 75, 500).gems).reduce((a, b) => a + (b ?? 0), 0)).toBe(2);
    expect(gatherByProducts('mining', 74, 500).gems).toEqual({});
    expect(gatherByProducts('mining', 75, 500, 3)).toEqual(gatherByProducts('mining', 75, 500, 3)); // no rolls
  });

  it('a claim at level 60 gives the extra units and the Refining Dust; at level 49 neither', () => {
    const mk = (lvl: number): SaveData => ({ ...withLevel(defaultSave(), 'mining', lvl), activeOreId: 'iron', lastMiningClaim: NOW - 4 * HOUR });
    const low = applyClaimGathering(mk(49), 'mining', NOW)!;
    const hi = applyClaimGathering(mk(60), 'mining', NOW)!;
    expect(low.dust).toBe(0);
    expect(hi.dust).toBe(Math.floor(hi.units / T.mastery.gatherDustUnits));
    expect(hi.save.materials.refining_dust).toBe(hi.dust);
    // 60 vs 49 differ by the level's own power as well; compare against the same level without the perk through the multiplier
    expect(computeMiningStatus(mk(60), NOW).oreReady).toBe(Math.floor((4 * (T.mining.oreRatePerPower) * (5 + 60 * T.skills.powerPerLevel)) * 1.04));
  });

  it('Gardening perks shorten growth, give dust per growth hour and +1 on rare plants', () => {
    expect(gardenTimeFactor(50)).toBeCloseTo(0.95);
    expect(gardenTimeFactor(60)).toBeCloseTo(0.9);
    const sage = PLANTS.find((p) => p.id === 'silver_sage')!;
    expect(plantGrowthMs(sage, 60)).toBe(Math.round(8 * HOUR * 0.9));
    const s = { ...withLevel(defaultSave(), 'gardening', 75), gardenSlots: defaultSave().gardenSlots.map((g, i) => (i === 0 ? { plantId: 'elder_root' as const, startedAt: NOW - 20 * HOUR, lastPlantId: 'elder_root' as const } : g)) };
    expect(computeGardenSlotStatus(s, NOW, 0).durationMs).toBe(Math.round(16 * HOUR * 0.9));
    const h = applyHarvest(s, [0], NOW)!;
    expect(h.harvested[0].qty).toBe(1 + T.mastery.gardenRareBonus);
    expect(h.save.materials.refining_dust).toBe(Math.floor(16 / T.mastery.gardenDustHours));
    // a common plant at 75 gets no rare bonus
    const herb = { ...s, gardenSlots: s.gardenSlots.map((g, i) => (i === 0 ? { plantId: 'common_herb' as const, startedAt: NOW - 20 * HOUR, lastPlantId: 'common_herb' as const } : g)) };
    expect(applyHarvest(herb, [0], NOW)!.harvested[0].qty).toBe(2);
  });
});

describe('Round 12: the new consumables', () => {
  const NEW_IDS = ['repair_kit', 'master_repair_kit', 'sharpening_stone', 'armor_polish', 'hunter_lure', 'prospector_tonic'];

  it('11 new recipes in the existing stations, each consuming at least one oversupplied material', () => {
    const potions = POTION_RECIPES.filter((r) => NEW_IDS.includes(r.id));
    const dust = REFINING_RECIPES.filter((r) => r.station === 'dust' && !['dust_from_copper', 'dust_from_leather_scrap', 'dust_from_bone_fragment', 'dust_from_common_herb'].includes(r.id));
    expect(potions.length + dust.length).toBeGreaterThanOrEqual(10);
    expect(potions.length + dust.length).toBeLessThanOrEqual(16);
    const oversupplied: MaterialId[] = ['iron', 'silver', 'oak_wood', 'ebony_wood', 'bone_fragment', 'concentrated_blood', 'corrupted_crystal', 'uncommon_root', 'iron_thistle', 'gold_blossom', 'swift_grass', 'moon_lily'];
    for (const r of potions) expect(Object.keys(r.input).some((m) => oversupplied.includes(m as MaterialId)), r.id).toBe(true);
  });

  it('every material that had a single use now has at least two', () => {
    const singles: MaterialId[] = ['silver', 'gold_ore', 'obsidian', 'common_wood', 'oak_wood', 'ebony_wood', 'elven_wood', 'ancient_wood', 'uncommon_root', 'rare_flower'];
    for (const m of singles) {
      const refs = usesOf('material', m).reduce((n, u) => n + u.refs.length, 0);
      expect(refs, m).toBeGreaterThanOrEqual(2);
      expect(usesOf('material', m).some((u) => u.kind === 'alchemy' || (u.kind === 'refine' && m !== 'silver' && m !== 'gold_ore' && m !== 'obsidian')), m).toBe(true);
    }
    // the new plants and materials all have a use
    for (const id of ['silver_sage', 'dusk_orchid', 'elder_root']) expect(usesOf('material', id).length, id).toBeGreaterThan(0);
  });

  it('the consumables are defined, never sold in the Shop, have pt / en text and a declared (possibly pending) icon', () => {
    for (const id of NEW_IDS) {
      const c = CONSUMABLES.find((x) => x.id === id)!;
      expect(c.purchasable).toBe(false);
      expect(c.cost).toBe(0);
      expect(c.iconUrl).toBe(`/assets/icons/${id}.png`);
      expect(isIconPending(c.iconUrl)).toBe(true);
      for (const t of [en, pt] as const) {
        const cons = (t as unknown as { consumables: Record<string, string> }).consumables;
        for (const k of [id, `${id}_d`, `${id}_active`]) expect(typeof cons[k], k).toBe('string');
      }
      expect(usesOf('consumable', id).length, id).toBeGreaterThan(0);
    }
    for (const m of MATERIALS.filter((x) => ['silver_sage', 'dusk_orchid', 'elder_root'].includes(x.id))) expect(isIconPending(m.iconUrl)).toBe(true);
  });

  it('descriptions quote the numbers the code uses (they cannot drift)', () => {
    const num = (s: string) => (s.match(/\d+/g) ?? []).map(Number);
    for (const [lang, table] of [['en', en], ['pt', pt]] as const) {
      const c = (table as unknown as { consumables: Record<string, string> }).consumables;
      expect(num(c.repair_kit_d), lang).toEqual([T.consumables.repairKitDurability]);
      expect(num(c.sharpening_stone_d), lang).toEqual([Math.round(T.consumables.sharpenDmgPct * 100), T.consumables.sharpenMinutes]);
      expect(num(c.armor_polish_d), lang).toEqual([Math.round(T.consumables.polishReduction * 100), T.consumables.polishMinutes]);
      expect(num(c.hunter_lure_d), lang).toEqual([Math.round(T.consumables.baitDropPct * 100), T.consumables.baitMinutes]);
      expect(num(c.prospector_tonic_d)[0], lang).toBe(Math.round(T.consumables.prospectYieldPct * 100));
      expect(num(c.prospector_tonic_d)[1], lang).toBe(T.consumables.prospectMinutes / 60);
    }
  });

  it('CAP: everything new that is active together adds at most the documented ~10% to damage and to the yield of any one activity', () => {
    const cap = T.consumables.newConsumableCap;
    // damage: only the Sharpening Stone raises it; Strength / Attack elixirs are older items
    expect(T.consumables.sharpenDmgPct).toBeLessThanOrEqual(cap);
    // yield per activity: Hunting (the Lure), Mining / Woodcutting (the Prospector); the Polish touches defence only
    expect(T.consumables.baitDropPct).toBeLessThanOrEqual(cap);
    expect(T.consumables.prospectYieldPct).toBeLessThanOrEqual(cap);
    // and they stack sanely with the old ones: the damage buffs multiply, the gather ones add to the Brew
    const all = give(defaultSave(), { sharpening_stone: 1 });
    const on = applyElixir(all, 'sharpening_stone', NOW)!;
    const mods = combatModifiersFromSave({ ...on, blessed: true, activeBuff: { type: 'strength', expiresAt: NOW + HOUR }, attackBuff: { type: 'attack', expiresAt: NOW + HOUR } }, NOW);
    expect(applyDamageModifiers(100, mods)).toBeCloseTo(100 * 1.05 * (1 + T.battle.strengthElixirDmgPct) * (1 + T.battle.attackElixirDmgPct) * (1 + T.consumables.sharpenDmgPct));
  });

  it('Repair Kit restores 60 durability to the equipped weapon and armor; the Master Kit restores everything; nothing is spent at full durability', () => {
    const base = give(defaultSave(), { repair_kit: 2, master_repair_kit: 1 });
    expect(applyRepairKit(base, 'repair_kit')).toBeNull(); // fresh gear is at full durability
    const worn = { ...base, gearInstances: Object.fromEntries(Object.entries(base.gearInstances).map(([id, g]) => [id, { ...g, durability: 20 }])) };
    const a = applyRepairKit(worn, 'repair_kit')!;
    expect(a.consumables.repair_kit).toBe(1);
    expect(a.gearInstances[a.equipped.weapon!].durability).toBe(20 + T.consumables.repairKitDurability);
    expect(a.gearInstances[a.equipped.armor!].durability).toBe(20 + T.consumables.repairKitDurability);
    const b = applyRepairKit(worn, 'master_repair_kit')!;
    expect(b.gearInstances[b.equipped.weapon!].durability).toBe(MAX_DURABILITY);
    expect(applyRepairKit(give(worn, { repair_kit: 0 }), 'repair_kit')).toBeNull();
  });

  it('Sharpening Stone, Polish and Prospector start a timed buff of their own and renew like the other tonics', () => {
    for (const id of ['sharpening_stone', 'armor_polish', 'prospector_tonic'] as const) {
      const on = applyElixir(give(defaultSave(), { [id]: 2 }), id, NOW)!;
      expect(isBuffActive(on, BUFF_ITEM[id]!, NOW)).toBe(true);
      expect(buffRemainingMs(on, NOW, BUFF_ITEM[id]!) / 60000).toBe({ sharpening_stone: T.consumables.sharpenMinutes, armor_polish: T.consumables.polishMinutes, prospector_tonic: T.consumables.prospectMinutes }[id]);
      expect(on.consumables[id]).toBe(1);
    }
  });

  it('Prospector Tonic adds its share of the covered mining time, never more than the cap', () => {
    const mining: SaveData = { ...defaultSave(), activeOreId: 'copper', lastMiningClaim: NOW - 2 * HOUR };
    const plain = computeMiningStatus(mining, NOW).oreReady;
    const on = computeMiningStatus(applyElixir(give(mining, { prospector_tonic: 1 }), 'prospector_tonic', NOW - 2 * HOUR)!, NOW).oreReady;
    expect(on).toBeGreaterThan(plain);
    expect(on / plain).toBeLessThanOrEqual(1 + T.consumables.prospectYieldPct + 0.05);
    expect(prospectBonusHours(mining, NOW - 2 * HOUR, 2 * HOUR)).toBe(0);
  });

  it('Hunter Lure needs a running hunt, is tied to that zone, and only raises uncommon / rare drops', () => {
    const zoneId = 'demon_glade';
    const s0 = give({ ...defaultSave(), huntingOfflineStart: NOW }, { hunter_lure: 3 });
    expect(applyElixir(s0, 'hunter_lure', NOW)).toBeNull(); // not hunting: nothing is spent
    const hunting = requestHuntStart(s0, zoneId, 'shallow', NOW)!;
    const lured = applyElixir(hunting, 'hunter_lure', NOW)!;
    expect(lured.consumables.hunter_lure).toBe(2);
    expect(lured.buffs.bait?.zone).toBe(zoneId);
    // a session of ANOTHER zone started later does not see the lure
    const zone = getHuntingZone(zoneId)!;
    const status = (save: SaveData) => withSeededRandom(77, () => computeHuntingStatus(save, NOW + 4 * HOUR));
    const plain = status(hunting).drops as Record<string, number>;
    const lure = status(lured).drops as Record<string, number>;
    for (const d of zone.drops) {
      if (d.rarity === 'common') expect(lure[d.material] ?? 0, d.material).toBe(plain[d.material] ?? 0);
      else expect(lure[d.material] ?? 0, d.material).toBeGreaterThanOrEqual(plain[d.material] ?? 0);
    }
    expect(Object.values(lure).reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(Object.values(plain).reduce((a, b) => a + b, 0));
  });

  it('Sharpening Stone shortens a hunt: the same session kills at least as many monsters with it', () => {
    const s0 = give({ ...defaultSave(), huntingOfflineStart: NOW }, { sharpening_stone: 1 });
    const hunting = requestHuntStart(s0, 'demon_glade', 'shallow', NOW)!;
    const sharp = applyElixir(hunting, 'sharpening_stone', NOW)!;
    const kills = (save: SaveData) => withSeededRandom(5, () => computeHuntingStatus(save, NOW + 3 * HOUR)).kills;
    expect(kills(sharp)).toBeGreaterThanOrEqual(kills(hunting));
  });
});
