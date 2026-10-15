import { describe, expect, it } from 'vitest';
import { defaultSave, computeCP, SaveData } from '../engine';
import { applyHuntClaim, applyHuntStart, applyHuntStop, requestHuntStart } from '../huntLifecycle';
import { applyEquipInstance, applyForge, applyUpgrade, createGearInstance } from '../gearInstances';
import { emptyMaterials } from '../materials';
import { getGear, MAX_REFINE, upgradeCost } from '../gear';
import { recipeStock } from './recipeStock';

const START = new Date('2026-10-10T09:00:00Z').getTime();
const HOUR = 3600 * 1000;

const fresh = (): SaveData => ({ ...defaultSave(), huntingOfflineStart: START, lastMiningClaim: START, lastWoodcuttingClaim: START });

describe('hunting lifecycle: start -> stop -> claim', () => {
  it('a fresh character can start the first zone; the session is frozen into the save', () => {
    const s = fresh();
    expect(computeCP(s)).toBeGreaterThanOrEqual(50); // shallow demon_glade is meant to be winnable from minute one
    const started = applyHuntStart(s, 'demon_glade', 'shallow', START)!;
    expect(started).not.toBeNull();
    expect(started.activeHuntingZone).toBe('demon_glade');
    expect(started.huntSession).not.toBeNull();
    expect(started.huntingOfflineStart).toBe(START);
  });

  it('locked zones and zones the CP cannot carry are refused', () => {
    const s = fresh();
    expect(applyHuntStart(s, 'blood_marsh', 'shallow', START)).toBeNull(); // needs Dungeon floor 26
    expect(applyHuntStart({ ...s, highestDungeonFloor: 99 }, 'blood_marsh', 'shallow', START)).toBeNull(); // CP 58 < 492
    expect(applyHuntStart(s, 'demon_glade', 'deep', START)).toBeNull(); // CP 58 < 187
    expect(applyHuntStart(s, 'nowhere', 'shallow', START)).toBeNull();
  });

  it('stop needs a running session, and is a pure function of the save (same inputs, same reward)', () => {
    const s = fresh();
    expect(applyHuntStop(s, START + HOUR)).toBeNull();
    const started = applyHuntStart(s, 'demon_glade', 'shallow', START)!;
    const a = applyHuntStop(started, START + 3 * HOUR)!;
    const b = applyHuntStop(started, START + 3 * HOUR)!;
    expect(a.pendingHuntReward).toEqual(b.pendingHuntReward);
    expect(a.activeHuntingZone).toBeNull();
    expect(a.huntSession).toBeNull();
    expect(a.pendingHuntReward!.xp).toBeGreaterThan(0);
  });

  it('a reward is paid exactly once: a second claim, or a claim with the wrong id, does nothing', () => {
    const started = applyHuntStart(fresh(), 'demon_glade', 'shallow', START)!;
    const stopped = applyHuntStop(started, START + 4 * HOUR)!;
    const reward = stopped.pendingHuntReward!;
    expect(applyHuntClaim(stopped, 'someone-elses-id')).toBeNull();
    const claimed = applyHuntClaim(stopped, reward.id)!;
    expect(claimed.pendingHuntReward).toBeNull();
    expect(claimed.gold).toBe(stopped.gold + reward.gold);
    expect(claimed.xp).toBe(stopped.xp + reward.xp);
    expect(applyHuntClaim(claimed, reward.id)).toBeNull();
  });

  it('nothing new can start while a reward is waiting to be claimed', () => {
    const started = applyHuntStart(fresh(), 'demon_glade', 'shallow', START)!;
    const stopped = applyHuntStop(started, START + HOUR)!;
    expect(applyHuntStart(stopped, 'demon_glade', 'shallow', START + 2 * HOUR)).toBeNull();
    expect(requestHuntStart(stopped, 'demon_glade', 'shallow', START + 2 * HOUR)).toBeNull();
  });

  it('time past the zone offline cap is not paid', () => {
    const started = applyHuntStart(fresh(), 'demon_glade', 'shallow', START)!;
    const atCap = applyHuntStop(started, START + 6 * HOUR)!.pendingHuntReward!; // demon_glade caps at 6h
    const wayPast = applyHuntStop(started, START + 40 * HOUR)!.pendingHuntReward!;
    expect(wayPast.pendingMs).toBe(atCap.pendingMs);
    expect(wayPast.xp).toBe(atCap.xp);
  });
});

describe('forge / refine reducers', () => {
  const stocked = (): SaveData => ({
    ...fresh(),
    gold: 500,
    materials: { ...emptyMaterials(), copper_bar: 1, leather: 10, wood_handle_common: 1 },
  });

  it('crafting charges exactly the recipe + gold and creates one instance; the input save is untouched', () => {
    const s = stocked();
    const before = JSON.stringify(s);
    const res = applyForge(s, 'bronze_dagger', { level: 1, now: START });
    expect(res.ok).toBe(true);
    expect(JSON.stringify(s)).toBe(before);
    expect(res.save!.gold).toBe(500 - 40);
    expect(res.save!.materials.copper_bar).toBe(0);
    expect(res.save!.materials.leather).toBe(10 - (getGear('bronze_dagger').recipe!.materials!.leather as number));
    expect(res.save!.materials.wood_handle_common).toBe(0);
    expect(res.instance!.templateId).toBe('bronze_dagger');
    expect(Object.keys(res.save!.gearInstances)).toHaveLength(Object.keys(s.gearInstances).length + 1);
  });

  const tier2Mats = { ...emptyMaterials(), ...recipeStock('iron_short_sword', 3) } as ReturnType<typeof emptyMaterials>;
  it.each<[string, string, number, (s: SaveData) => SaveData, string]>([
    ['not enough gold', 'bronze_dagger', 1, (s) => ({ ...s, gold: 39 }), 'gold'],
    ['a missing material', 'bronze_dagger', 1, (s) => ({ ...s, materials: { ...s.materials, copper_bar: 0 } }), 'materials'],
    ['a character level that is too low', 'iron_short_sword', 1, (s) => ({ ...s, gold: 9999, materials: tier2Mats }), 'level'],
    ['missing component pieces (tier 2 needs 2 daggers)', 'iron_short_sword', 10, (s) => ({ ...s, gold: 9999, materials: tier2Mats }), 'ingredients'],
  ])('refuses %s without charging anything', (_name, template, level, mutate, reason) => {
    const res = applyForge(mutate(stocked()), template, { level });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe(reason);
    expect(res.save).toBeUndefined();
  });

  it('a tier-2 craft consumes exactly two unequipped lower-tier pieces, never the equipped one', () => {
    let s: SaveData = { ...stocked(), gold: 9999, materials: { ...emptyMaterials(), ...recipeStock('iron_short_sword') } as ReturnType<typeof emptyMaterials> };
    const daggers = [1, 2, 3].map((n) => createGearInstance('bronze_dagger', { id: `gi_d${n}`, origin: 'craft', rarity: 'common', substats: [] }));
    s = { ...s, gearInstances: { ...s.gearInstances, ...Object.fromEntries(daggers.map((d) => [d.id, d])) } };
    s = applyEquipInstance(s, 'gi_d1')!;
    const res = applyForge(s, 'iron_short_sword', { level: 10, now: START });
    expect(res.ok).toBe(true);
    expect(res.consumed!.map((i) => i.id)).not.toContain('gi_d1');
    expect(res.consumed).toHaveLength(2);
    expect(res.save!.gearInstances.gi_d1).toBeDefined();
  });

  it('upgrades are guaranteed through +3, then roll; a failure still charges but never loses the piece', () => {
    let s: SaveData = { ...fresh(), gold: 100_000, materials: { ...emptyMaterials(), iron: 99, refining_dust: 99, leather_scrap: 99, demon_claw: 99, demon_core: 99 }, shards: 9 };
    const dagger = createGearInstance('bronze_dagger', { id: 'gi_up', origin: 'craft', rarity: 'common', substats: [] });
    s = { ...s, gearInstances: { ...s.gearInstances, gi_up: dagger } };
    for (let lvl = 0; lvl < 3; lvl++) {
      const r = applyUpgrade(s, 'gi_up', false, () => 0.999)!; // worst possible roll
      expect(r.success).toBe(true);
      s = r.save;
    }
    expect(s.gearInstances.gi_up.upgrade).toBe(3);
    const goldBefore = s.gold;
    const failed = applyUpgrade(s, 'gi_up', false, () => 0.999)!;
    expect(failed.success).toBe(false);
    expect(failed.save.gearInstances.gi_up.upgrade).toBe(3);
    expect(failed.save.gold).toBe(goldBefore - upgradeCost(getGear('bronze_dagger'), 3).gold);
    // never past the cap
    const maxed = { ...s, gearInstances: { ...s.gearInstances, gi_up: { ...s.gearInstances.gi_up, upgrade: MAX_REFINE } } };
    expect(applyUpgrade(maxed, 'gi_up', false, () => 0)).toBeNull();
  });
});
