import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSave, normalizeSave, SaveData } from '../engine';
import {
  addForced,
  addWithOverflow,
  bagFreeSlots,
  canAdd,
  canAddInstances,
  DEFAULT_INVENTORY_CAPACITY,
  fitsBag,
  inventoryCapacity,
  inventorySlotsUsed,
  placeUnits,
  slotsForQty,
  STACK_LIMIT,
  stockIsEmpty,
} from '../inventory';
import { applyHuntClaim, applyHuntStart, applyHuntStop, huntClaimBlocked, planHuntClaim } from '../huntLifecycle';
import { PendingHuntReward } from '../huntSession';
import { emptyMaterials, MATERIALS, MaterialId } from '../materials';
import { CONSUMABLES } from '../consumables';
import { GEAR, getGear, isInstancedSlot } from '../gear';
import { createGearInstance } from '../gearInstances';
import { applyClaimGathering, applyStartGathering } from '../gathering';
import { applyHarvest } from '../gardenActions';
import { applyBattlePassClaim } from '../battlepass';
import { applyBuyConsumable, applyCraftPotion, applyRefine } from '../craftActions';
import { applySalvage, salvageBlockReason } from '../gearInstances';
import { LEGACY_POUCH_SLOTS_PER_TIER } from '../legacyPouch';

const NOW = new Date('2026-10-10T12:00:00Z').getTime();
const HOUR = 3600 * 1000;
const wire = (s: unknown) => JSON.parse(JSON.stringify(s)) as Record<string, unknown>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

// Fill the bag up to `n` slots with one unit each of types the tests below never touch.
const RESERVED = new Set<string>(['leather_scrap', 'demon_claw', 'demon_core', 'copper', 'iron', 'obsidian', 'common_herb', 'essence', 'bone_fragment', 'concentrated_blood', 'corrupted_crystal', 'leather', 'copper_bar', 'wood_handle_common', 'small_hp', 'large_hp']);
const FILLER_MATERIALS = MATERIALS.map((m) => m.id).filter((id) => !RESERVED.has(id));
const FILLER_CONSUMABLES = CONSUMABLES.map((c) => c.id).filter((id) => !RESERVED.has(id));
function withSlotsUsed(save: SaveData, n: number): SaveData {
  const materials = { ...save.materials };
  const consumables = { ...save.consumables };
  let used = inventorySlotsUsed({ ...save, materials, consumables });
  for (const id of FILLER_MATERIALS) {
    if (used >= n) break;
    if ((materials[id] ?? 0) === 0) {
      materials[id] = 1;
      used++;
    }
  }
  for (const id of FILLER_CONSUMABLES) {
    if (used >= n) break;
    if ((consumables[id] ?? 0) === 0) {
      consumables[id] = 1;
      used++;
    }
  }
  return { ...save, materials, consumables };
}
// A filler unit of the bag that can be taken out to free exactly one slot.
const aFillerSlot = (s: SaveData): MaterialId => FILLER_MATERIALS.find((id) => (s.materials[id] ?? 0) === 1)!;

const RELIC_ID = GEAR.find((g) => !isInstancedSlot(g.slot))!.id;

describe('stack math', () => {
  it('a type holds STACK_LIMIT per slot and takes ceil(qty / STACK_LIMIT) slots', () => {
    expect(STACK_LIMIT).toBe(99);
    expect([0, 1, 98, 99, 100, 198, 199, 500].map(slotsForQty)).toEqual([0, 1, 1, 1, 2, 2, 3, 6]);
  });

  it('materials, consumables and stackable gear all follow the same rule; equipped pieces are free', () => {
    const base = defaultSave();
    const s: SaveData = { ...base, materials: { ...base.materials, iron: 250 }, consumables: { ...base.consumables, small_hp: 100 }, inventory: { ...base.inventory, [RELIC_ID]: 1 } };
    expect(inventorySlotsUsed(s)).toBe(3 + 2 + 1);
    const spare = createGearInstance('bronze_dagger', { id: 'gi_spare', origin: 'craft', rarity: 'common', substats: [] });
    const withSpare = { ...s, gearInstances: { ...s.gearInstances, gi_spare: spare } };
    expect(inventorySlotsUsed(withSpare)).toBe(7);
    expect(inventorySlotsUsed({ ...withSpare, equipped: { ...withSpare.equipped, weapon: 'gi_spare' } })).toBe(7); // the starter club it replaces is now the stored one
  });

  it('an old save holding 500 units of one material loads whole: 6 slots, over capacity is allowed, nothing is deleted', () => {
    let s = defaultSave();
    s = withSlotsUsed({ ...s, materials: { ...s.materials, leather_scrap: 500 } }, DEFAULT_INVENTORY_CAPACITY + 3);
    const loaded = normalizeSave(wire(s));
    expect(loaded.materials.leather_scrap).toBe(500);
    expect(slotsForQty(loaded.materials.leather_scrap)).toBe(6);
    expect(inventorySlotsUsed(loaded)).toBeGreaterThan(inventoryCapacity(loaded)); // over capacity: supported
    expect(normalizeSave(wire(loaded))).toEqual(loaded); // round trip
    expect(canAdd(loaded, { materials: { copper: 1 } })).toBe(false); // a new type does not fit...
    expect(addWithOverflow(loaded, { materials: { leather_scrap: 100 } }).added.materials.leather_scrap).toBe(94); // ...but the partial stack (500 = 5 x 99 + 5) still takes its 94
  });
});

describe('the shared placement rule', () => {
  it('placeUnits: exact arithmetic', () => {
    const r = placeUnits({ materials: { leather_scrap: 95 } }, { materials: { demon_core: 3, demon_claw: 120, leather_scrap: 10 } }, 2);
    expect(r.stock.materials).toEqual({ leather_scrap: 99, demon_core: 3, demon_claw: 99 });
    expect(r.added.materials).toEqual({ leather_scrap: 4, demon_core: 3, demon_claw: 99 });
    expect(r.leftover.materials).toEqual({ leather_scrap: 6, demon_claw: 21 });
  });

  it('with no free slot only the partial stacks take units; the input is never mutated', () => {
    const stock = { materials: { iron: 98 } };
    const r = placeUnits(stock, { materials: { iron: 5, copper: 5 } }, 0);
    expect(r.added.materials).toEqual({ iron: 1 });
    expect(r.leftover.materials).toEqual({ iron: 4, copper: 5 });
    expect(stock).toEqual({ materials: { iron: 98 } });
  });

  it('canAdd / addForced / reserve', () => {
    const base = defaultSave();
    const almost = withSlotsUsed(base, DEFAULT_INVENTORY_CAPACITY - 1);
    expect(canAdd(almost, { materials: { obsidian: 99 } })).toBe(true);
    expect(canAdd(almost, { materials: { obsidian: 100 } })).toBe(false);
    expect(stockIsEmpty(addWithOverflow(almost, { materials: { obsidian: 5 } }, { reserve: 1 }).added)).toBe(true); // that slot is reserved
    const forced = addForced(almost, { materials: { obsidian: 500 } });
    expect(forced.materials.obsidian).toBe(500);
    expect(inventorySlotsUsed(forced)).toBeGreaterThan(inventoryCapacity(forced));
    expect(canAddInstances(almost, 1)).toBe(true);
    expect(canAddInstances(almost, 2)).toBe(false);
  });

  it('fitsBag: a result may not take more slots than the bag has, but an over-full bag may still shrink or stay', () => {
    const base = defaultSave();
    const full = withSlotsUsed(base, DEFAULT_INVENTORY_CAPACITY);
    const grown = addForced(full, { materials: { obsidian: 1 } });
    expect(fitsBag(full, grown)).toBe(false);
    expect(fitsBag(grown, grown)).toBe(true);
    expect(fitsBag(grown, { ...grown, materials: { ...grown.materials, obsidian: 0 } })).toBe(true);
  });

  it('a bag over the limit (filled while the Pass perk was on, now not an owner) deletes nothing on load', () => {
    const base = defaultSave();
    const pass = { ...base, hasBattlePass: true };
    const bigger = { ...withSlotsUsed(pass, inventoryCapacity(pass, NOW)), hasBattlePass: false };
    expect(inventorySlotsUsed(bigger)).toBeGreaterThan(DEFAULT_INVENTORY_CAPACITY);
    const later = NOW + 2 * HOUR;
    vi.setSystemTime(later);
    const loaded = normalizeSave(wire(bigger));
    expect(inventorySlotsUsed(loaded)).toBe(inventorySlotsUsed(bigger));
    expect(inventorySlotsUsed(loaded)).toBeGreaterThan(inventoryCapacity(loaded, later));
    expect(bagFreeSlots(loaded, later)).toBe(0);
  });
});

describe('hunt claim into the inventory', () => {
  const START = NOW;
  const reward = (over: Partial<PendingHuntReward> = {}): PendingHuntReward => ({
    id: 'r1',
    zoneId: 'demon_glade',
    depth: 'shallow',
    startedAt: 1,
    endedAt: 2,
    timeMs: HOUR,
    pendingMs: HOUR,
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
    uniques: [],
    ...over,
  });

  it('stopping a session stores the drops in the reward; nothing touches the bag until the claim', () => {
    const base = { ...defaultSave(), huntingOfflineStart: START, lastMiningClaim: START, lastWoodcuttingClaim: START };
    const stopped = applyHuntStop(applyHuntStart(base, 'demon_glade', 'shallow', START)!, START + 4 * HOUR)!;
    expect(stopped.pendingHuntReward!.lost).toEqual([]);
    expect(Object.values(stopped.pendingHuntReward!.drops).some((n) => (n ?? 0) > 0)).toBe(true);
    expect(stopped.materials).toEqual(base.materials);
  });

  it('with room, everything goes in; gold and XP are paid; the reward closes', () => {
    const s: SaveData = { ...defaultSave(), pendingHuntReward: reward({ drops: { leather_scrap: 150, demon_claw: 20, demon_core: 2 } }) };
    const plan = planHuntClaim(s, s.pendingHuntReward!);
    expect(plan.leftBehind).toEqual([]);
    const claimed = applyHuntClaim(s, 'r1')!;
    expect(claimed.materials.leather_scrap).toBe(150);
    expect(inventorySlotsUsed(claimed)).toBe(2 + 1 + 1);
    expect(claimed.gold).toBe(100);
    expect(claimed.pendingHuntReward).toBeNull();
  });

  it('with partial room: free space at claim time, rarest first, existing partial stacks first; the rest is left behind (gold / XP never)', () => {
    const base = defaultSave();
    // 95 scrap (partial stack, room 4) and exactly 2 free slots
    const s: SaveData = {
      ...withSlotsUsed({ ...base, materials: { ...base.materials, leather_scrap: 95 } }, DEFAULT_INVENTORY_CAPACITY - 2),
      pendingHuntReward: reward({ drops: { leather_scrap: 300, demon_claw: 150, demon_core: 3 } }),
    };
    const plan = planHuntClaim(s, s.pendingHuntReward!);
    expect(plan.added.demon_core).toBe(3); // rare first
    expect(plan.added.demon_claw).toBe(99); // uncommon takes the second free slot (a full stack)
    expect(plan.added.leather_scrap).toBe(4); // the common only tops off its partial stack
    expect(Object.fromEntries(plan.leftBehind.map((i) => [i.itemId, i.count]))).toEqual({ demon_claw: 51, leather_scrap: 296 });
    const claimed = applyHuntClaim(s, 'r1')!;
    expect(claimed.pendingHuntReward).toBeNull(); // drops left behind do not keep the reward pending
    expect(claimed.gold).toBe(100);
    expect(claimed.xp).toBe(50);
    expect(inventorySlotsUsed(claimed)).toBe(DEFAULT_INVENTORY_CAPACITY);
  });

  it('an unplaced unique is held in the pending reward (everything else is paid once); freeing a slot delivers it', () => {
    const base = defaultSave();
    const full = withSlotsUsed(base, DEFAULT_INVENTORY_CAPACITY);
    const drop = { templateId: 'demon_fang_dagger', rarity: 'epic' as const, substats: [] };
    const s: SaveData = { ...full, pendingHuntReward: reward({ drops: { leather_scrap: 10 }, uniques: [drop] }) };
    const first = applyHuntClaim(s, 'r1')!;
    expect(first.gold).toBe(100);
    expect(huntClaimBlocked(first)).toBe(true);
    expect(first.pendingHuntReward!.uniques).toHaveLength(1);
    expect(first.pendingHuntReward!.drops).toEqual({});
    const freed: SaveData = { ...first, materials: { ...first.materials, [aFillerSlot(first)]: 0 } };
    const done = applyHuntClaim(freed, 'r1')!;
    expect(done.pendingHuntReward).toBeNull();
    expect(done.gold).toBe(100);
    expect(Object.values(done.gearInstances).filter((i) => i.templateId === 'demon_fang_dagger')).toHaveLength(1);
  });

  it('claiming is idempotent: a second claim with the same id finds nothing', () => {
    const s: SaveData = { ...defaultSave(), pendingHuntReward: reward({ drops: { leather_scrap: 5 } }) };
    const once = applyHuntClaim(s, 'r1')!;
    expect(applyHuntClaim(once, 'r1')).toBeNull();
  });
});

describe('migration of the old Hunting Pouch', () => {
  const pouch = (tier: number, items: { itemId: string; count: number }[] = []) => ({ tier, items, lostItems: [{ itemId: 'demon_claw', count: 2 }] });
  const old = (huntPouch: unknown, extra: Record<string, unknown> = {}) => ({ ...wire(defaultSave()), huntPouch, ...extra });

  it('a paid tier becomes permanent slots, exactly once, and the pouch fields disappear', () => {
    const loaded = normalizeSave(old(pouch(3)));
    expect(loaded.inventoryBonusSlots).toBe(LEGACY_POUCH_SLOTS_PER_TIER * 2);
    expect(inventoryCapacity(loaded)).toBe(DEFAULT_INVENTORY_CAPACITY + 4);
    expect((loaded as unknown as Record<string, unknown>).huntPouch).toBeUndefined();
    expect(loaded.pouchMigrated).toBe(true);
    const again = normalizeSave(wire(loaded));
    expect(again.inventoryBonusSlots).toBe(4); // not granted twice
    // even if a stale pouch comes back in the payload, the bonus is not granted again
    expect(normalizeSave({ ...wire(loaded), huntPouch: pouch(4) }).inventoryBonusSlots).toBe(4);
  });

  it('tier 1 (the free one) grants nothing; tampered tiers are clamped', () => {
    expect(normalizeSave(old(pouch(1))).inventoryBonusSlots).toBe(0);
    expect(normalizeSave(old(pouch(99))).inventoryBonusSlots).toBe(6);
    expect(normalizeSave(old(pouch(-5))).inventoryBonusSlots).toBe(0);
  });

  it('items in the pouch move into the inventory (stacking onto what is there)', () => {
    const base = wire({ ...defaultSave(), materials: { ...emptyMaterials(), leather_scrap: 5 } });
    const loaded = normalizeSave({ ...base, huntPouch: pouch(1, [{ itemId: 'leather_scrap', count: 7 }, { itemId: 'demon_core', count: 2 }, { itemId: 'nope', count: 9 }]) });
    expect(loaded.materials.leather_scrap).toBe(12);
    expect(loaded.materials.demon_core).toBe(2);
    expect(loaded.pendingHuntReward).toBeNull();
  });

  it('items that do not fit stay claimable in the pending reward (nothing is lost) and arrive once there is room', () => {
    const full = wire(withSlotsUsed(defaultSave(), DEFAULT_INVENTORY_CAPACITY));
    const loaded = normalizeSave({ ...full, huntPouch: pouch(1, [{ itemId: 'demon_core', count: 4 }]) });
    expect(loaded.materials.demon_core).toBe(0);
    expect(loaded.pendingHuntReward!.owed).toEqual({ demon_core: 4 });
    expect(loaded.pendingHuntReward!.gold).toBe(0);
    // still full: the claim holds it
    const held = applyHuntClaim(loaded, loaded.pendingHuntReward!.id)!;
    expect(huntClaimBlocked(held)).toBe(true);
    expect(held.pendingHuntReward!.owed).toEqual({ demon_core: 4 });
    // survives a reload
    expect(normalizeSave(wire(held)).pendingHuntReward!.owed).toEqual({ demon_core: 4 });
    // room: it arrives, and the reward closes
    const freed: SaveData = { ...held, materials: { ...held.materials, [aFillerSlot(held)]: 0 } };
    const done = applyHuntClaim(freed, freed.pendingHuntReward!.id)!;
    expect(done.materials.demon_core).toBe(4);
    expect(done.pendingHuntReward).toBeNull();
  });

  it('a pending reward written under the pouch rule is not placed twice (its drops already live in the pouch)', () => {
    const rewardRaw = { ...wire(defaultSave().pendingHuntReward ?? {}), id: 'x1', zoneId: 'demon_glade', depth: 'shallow', gold: 70, xp: 30, drops: { leather_scrap: 40 }, lost: [{ itemId: 'demon_claw', count: 2 }], uniques: [], pouchCapacity: 3 };
    const loaded = normalizeSave(old(pouch(1, [{ itemId: 'leather_scrap', count: 30 }]), { pendingHuntReward: rewardRaw }));
    expect(loaded.materials.leather_scrap).toBe(30); // what the pouch held, not the 40 rolled
    expect(loaded.pendingHuntReward!.drops).toEqual({});
    expect(loaded.pendingHuntReward!.gold).toBe(70); // gold and XP still claimable
    expect(loaded.pendingHuntReward!.lost).toEqual([{ itemId: 'demon_claw', count: 2 }]);
    const claimed = applyHuntClaim(loaded, 'x1')!;
    expect(claimed.gold).toBe(70);
    expect(claimed.materials.leather_scrap).toBe(30);
  });

  it('a save without a pouch (new or already migrated) loads unchanged', () => {
    const fresh = defaultSave();
    expect(normalizeSave(wire(fresh)).inventoryBonusSlots).toBe(0);
  });
});

describe('every other source follows its own full-bag rule', () => {
  const full = (s: SaveData = defaultSave()): SaveData => withSlotsUsed(s, inventoryCapacity(s, NOW));

  it('mining / woodcutting (passive): what fits goes in, the rest is left behind and reported, XP and gold are kept', () => {
    const start = NOW;
    const base = { ...defaultSave(), lastMiningClaim: start, lastWoodcuttingClaim: start, huntingOfflineStart: start };
    const started = applyStartGathering(base, 'mining', 'copper', start)!.save;
    const bag = full({ ...started, materials: { ...started.materials, copper: 0 } });
    const claim = applyClaimGathering(bag, 'mining', start + 4 * HOUR)!;
    expect(claim.units).toBeGreaterThan(0);
    expect(claim.leftBehind).toBe(claim.units); // no free slot and no partial stack
    expect(claim.save.materials.copper).toBe(0);
    expect(claim.save.skillXp.mining).toBeGreaterThan(bag.skillXp.mining);
    // with room nothing is left behind
    const roomy = applyClaimGathering({ ...started, materials: { ...started.materials } }, 'mining', start + 4 * HOUR)!;
    expect(roomy.leftBehind).toBe(0);
    expect(roomy.save.materials.copper).toBe(roomy.units);
  });

  it('garden harvest (deliberate): a plot whose yield does not fit stays ready, nothing is lost or paid', () => {
    const base = defaultSave();
    const planted = { ...base, gardenSlots: base.gardenSlots.map((sl, i) => (i === 0 ? { ...sl, plantId: 'common_herb' as const, startedAt: NOW - 100 * HOUR } : sl)) };
    const blockedRes = applyHarvest(full({ ...planted, materials: { ...planted.materials, common_herb: 0 } }), [0], NOW)!;
    expect(blockedRes.harvested).toEqual([]);
    expect(blockedRes.blocked).toEqual([0]);
    expect(blockedRes.save.gardenSlots[0].plantId).toBe('common_herb');
    expect(blockedRes.save.skillXp.gardening).toBe(planted.skillXp.gardening);
    const ok = applyHarvest(planted, [0], NOW)!;
    expect(ok.harvested).toHaveLength(1);
    expect(ok.blocked).toEqual([]);
  });

  it('Battle Pass item rewards (deliberate): refused when they do not fit and stay claimable; gold always goes in', () => {
    const base: SaveData = { ...defaultSave(), battlePassLevel: 30, hasBattlePass: true };
    // level 2 free = copper x5 (a new type); level 1 free = gold
    const bag = full({ ...base, materials: { ...base.materials, copper: 0 } });
    const blocked = applyBattlePassClaim(bag, 2, 'free', NOW);
    expect(blocked.blocked).toBe(true);
    expect(blocked.save).toBeNull();
    expect(bag.claimedPassRewards.free).toEqual([]);
    expect(applyBattlePassClaim(bag, 1, 'free', NOW).save!.gold).toBe(100);
    expect(applyBattlePassClaim(base, 2, 'free', NOW).save!.materials.copper).toBe(5);
  });

  it('refining / Alchemy / Shop (deliberate): refused when the result does not fit, charging nothing; eating a whole stack makes room', () => {
    const stocked: SaveData = { ...defaultSave(), gold: 1000, xp: 0, materials: { ...emptyMaterials(), copper: 10 } };
    // dust_from_copper: 10 copper -> 1 dust, costs 0: the copper stack disappears, so the dust has its slot
    const eats = applyRefine(full({ ...stocked, materials: { ...stocked.materials, copper: 10 } }), 'dust_from_copper');
    expect(eats.ok).toBe(true);
    // tan_leather: 3 scrap of 5 -> the scrap stack stays, the new type does not fit
    const bag = full({ ...stocked, materials: { ...emptyMaterials(), leather_scrap: 5 } });
    const refused = applyRefine(bag, 'tan_leather');
    expect(refused.ok).toBe(false);
    expect(refused.reason).toBe('bag');
    const potion = applyCraftPotion(full({ ...stocked, materials: { ...emptyMaterials(), common_herb: 9 } }), 'small_hp');
    expect(potion.reason).toBe('bag');
    const buy = applyBuyConsumable(full({ ...stocked }), 'small_hp');
    expect(buy.reason).toBe('bag');
    expect(applyBuyConsumable(stocked, 'small_hp').ok).toBe(true);
  });

  it('salvage (deliberate): the salvaged piece frees its own slot; a refund that still would not fit (counting the chance of a bonus Essence) is blocked with a reason', () => {
    const base = defaultSave();
    const piece = (rarity: 'common' | 'rare') => createGearInstance('bronze_helm', { id: 'gi_s', origin: 'craft', rarity, substats: [] }); // refunds one kind of material (the scrap)
    const bagWith = (rarity: 'common' | 'rare'): SaveData => withSlotsUsed({ ...base, gearInstances: { ...base.gearInstances, gi_s: piece(rarity) } }, DEFAULT_INVENTORY_CAPACITY);
    const common = bagWith('common');
    expect(inventorySlotsUsed(common)).toBe(DEFAULT_INVENTORY_CAPACITY);
    expect(salvageBlockReason(common, 'gi_s')).toBeNull(); // 1 slot freed, the scrap needs 1
    const done = applySalvage(common, 'gi_s')!;
    expect(done.save.materials.leather_scrap).toBe(Math.floor((getGear('bronze_helm').recipe!.materials!.leather_scrap as number) * 0.45));
    expect(inventorySlotsUsed(done.save)).toBe(DEFAULT_INVENTORY_CAPACITY);
    // a rare piece could also return Essence: scrap + essence = 2 new types, 1 slot freed
    const rare = bagWith('rare');
    expect(salvageBlockReason(rare, 'gi_s')).toBe('bag');
    expect(applySalvage(rare, 'gi_s')).toBeNull();
    expect(rare.gearInstances.gi_s).toBeDefined(); // untouched
    const roomy = { ...rare, materials: { ...rare.materials, [aFillerSlot(rare)]: 0 } };
    expect(salvageBlockReason(roomy, 'gi_s')).toBeNull();
    expect(applySalvage(roomy, 'gi_s', () => 0)).not.toBeNull();
  });

  it('every material id is a valid placement key (no catalog id is silently dropped)', () => {
    const everything: Record<string, number> = Object.fromEntries(MATERIALS.map((m) => [m.id, 1]));
    const res = placeUnits({}, { materials: everything as Record<MaterialId, number> }, 1000);
    expect(Object.keys(res.added.materials)).toHaveLength(MATERIALS.length);
  });
});
