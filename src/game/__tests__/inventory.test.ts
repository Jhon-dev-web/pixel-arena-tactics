import { describe, expect, it } from 'vitest';
import { defaultSave, SaveData } from '../engine';
import {
  DEFAULT_INVENTORY_CAPACITY,
  expandInventory,
  INVENTORY_EXPANSION_STEPS,
  inventoryCapacity,
  inventorySlotsUsed,
  isBagFull,
  MAX_INVENTORY_CAPACITY,
  nextExpansion,
  normalizeInventoryCapacity,
} from '../inventory';
import { applyForge, createGearInstance } from '../gearInstances';
import { allocateToPouch, defaultHuntPouch, drainPouchToMaterials } from '../huntPouch';
import { emptyMaterials, MATERIALS } from '../materials';
import { CONSUMABLES } from '../consumables';

// Fill the bag with `n` distinct material types (one slot each), on top of whatever the save already holds.
function withSlotsUsed(save: SaveData, n: number): SaveData {
  const materials = { ...save.materials };
  let used = inventorySlotsUsed({ ...save, materials });
  for (const m of MATERIALS) {
    if (used >= n) break;
    if ((materials[m.id] ?? 0) === 0) {
      materials[m.id] = 1;
      used++;
    }
  }
  return { ...save, materials };
}

describe('inventory capacity', () => {
  it('a new character starts empty with the default capacity (equipped starter gear is free)', () => {
    const s = defaultSave();
    expect(inventoryCapacity(s)).toBe(DEFAULT_INVENTORY_CAPACITY);
    expect(inventorySlotsUsed(s)).toBe(0);
    expect(isBagFull(s)).toBe(false);
  });

  it('counts one slot per material / consumable type (not per unit) and per stored, unequipped gear instance', () => {
    let s = defaultSave();
    s = { ...s, materials: { ...s.materials, leather_scrap: 500, iron: 1 }, consumables: { ...s.consumables, small_hp: 20 } };
    expect(inventorySlotsUsed(s)).toBe(3);
    const spare = createGearInstance('bronze_dagger', { id: 'gi_spare', origin: 'craft', rarity: 'common', substats: [] });
    s = { ...s, gearInstances: { ...s.gearInstances, gi_spare: spare } };
    expect(inventorySlotsUsed(s)).toBe(4);
    // equipping it frees the slot (the starter club it replaces is now the stored one)
    s = { ...s, equipped: { ...s.equipped, weapon: 'gi_spare' } };
    expect(inventorySlotsUsed(s)).toBe(4);
    expect(CONSUMABLES.length).toBeGreaterThan(0);
  });

  it('isBagFull flips exactly at capacity', () => {
    const s = defaultSave();
    expect(isBagFull(withSlotsUsed(s, DEFAULT_INVENTORY_CAPACITY - 1))).toBe(false);
    expect(isBagFull(withSlotsUsed(s, DEFAULT_INVENTORY_CAPACITY))).toBe(true);
  });

  it('normalizeInventoryCapacity only ever raises a floor, never shrinks', () => {
    expect(normalizeInventoryCapacity(undefined)).toBe(DEFAULT_INVENTORY_CAPACITY);
    expect(normalizeInventoryCapacity('x')).toBe(DEFAULT_INVENTORY_CAPACITY);
    expect(normalizeInventoryCapacity(NaN)).toBe(DEFAULT_INVENTORY_CAPACITY);
    expect(normalizeInventoryCapacity(5)).toBe(DEFAULT_INVENTORY_CAPACITY);
    expect(normalizeInventoryCapacity(44.9)).toBe(44);
    expect(normalizeInventoryCapacity(500)).toBe(500);
  });

  it('paid expansion: each step costs its price, adds slots, and is all-or-nothing', () => {
    let s: SaveData = { ...defaultSave(), gold: 10_000_000 };
    let expected = DEFAULT_INVENTORY_CAPACITY;
    for (const step of INVENTORY_EXPANSION_STEPS) {
      expect(nextExpansion(s)).toEqual({ nextCapacity: step.capacity, goldCost: step.goldCost });
      const goldBefore = s.gold;
      const next = expandInventory(s)!;
      expect(next).not.toBeNull();
      expect(next.inventoryCapacity).toBe(step.capacity);
      expect(next.gold).toBe(goldBefore - step.goldCost);
      expect(next.inventoryCapacity).toBeGreaterThan(expected);
      expected = next.inventoryCapacity;
      s = next;
    }
    expect(expected).toBe(MAX_INVENTORY_CAPACITY);
    expect(nextExpansion(s)).toBeNull();
    expect(expandInventory(s)).toBeNull();
  });

  it('expansion is refused without the gold and then changes nothing', () => {
    const s: SaveData = { ...defaultSave(), gold: INVENTORY_EXPANSION_STEPS[0].goldCost - 1 };
    expect(expandInventory(s)).toBeNull();
    expect(s.inventoryCapacity).toBe(DEFAULT_INVENTORY_CAPACITY);
  });
});

describe('capacity is respected by the add / overflow helpers', () => {
  it('forge refuses to create an instance in a full bag, charging nothing', () => {
    const base = defaultSave();
    const full: SaveData = withSlotsUsed(
      { ...base, gold: 10_000, materials: { ...emptyMaterials(), copper_bar: 1, leather: 1, wood_handle_common: 1 } },
      DEFAULT_INVENTORY_CAPACITY,
    );
    expect(isBagFull(full)).toBe(true);
    const res = applyForge(full, 'bronze_dagger', { level: 1 });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('capacity');
    // one slot free -> it works, and the bag ends exactly full
    const roomy = withSlotsUsed({ ...full, materials: { ...emptyMaterials(), copper_bar: 1, leather: 1, wood_handle_common: 1 } }, DEFAULT_INVENTORY_CAPACITY - 1);
    const ok = applyForge(roomy, 'bronze_dagger', { level: 1 });
    expect(ok.ok).toBe(true);
    expect(inventorySlotsUsed(ok.save!)).toBeLessThanOrEqual(inventoryCapacity(ok.save!));
  });

  it('drainPouchToMaterials lets stacks already in the bag through but blocks brand-new types once full', () => {
    const materials = { ...emptyMaterials(), leather_scrap: 5 };
    const items = [
      { itemId: 'leather_scrap' as const, count: 3 },
      { itemId: 'demon_claw' as const, count: 2 },
    ];
    // bag exactly full: the existing stack still grows, the new type stays in the pouch
    const full = drainPouchToMaterials(items, materials, 30, 30);
    expect(full.materials.leather_scrap).toBe(8);
    expect(full.materials.demon_claw).toBe(0);
    expect(full.remaining).toEqual([{ itemId: 'demon_claw', count: 2 }]);
    expect(full.blocked).toBe(true);
    // one free slot: the new type fits, and the slot count never goes above capacity
    const roomy = drainPouchToMaterials(items, materials, 29, 30);
    expect(roomy.materials.demon_claw).toBe(2);
    expect(roomy.remaining).toEqual([]);
    expect(roomy.blocked).toBe(false);
  });

  it('the hunt pouch holds at most `capacity` material types; the overflow is recorded as lost', () => {
    const order = ['leather_scrap', 'demon_claw', 'demon_core'] as const;
    const out = allocateToPouch(defaultHuntPouch(), { leather_scrap: 40, demon_claw: 6, demon_core: 1 }, [...order], 2);
    expect(out.items).toHaveLength(2);
    expect(out.items.map((i) => i.itemId).sort()).toEqual(['demon_claw', 'demon_core']);
    expect(out.lostItems).toEqual([{ itemId: 'leather_scrap', count: 40 }]);
    // a type already in the pouch keeps stacking even when the pouch is full
    const stacked = allocateToPouch(out, { demon_claw: 4 }, [...order], 2);
    expect(stacked.items.find((i) => i.itemId === 'demon_claw')!.count).toBe(10);
    expect(stacked.items).toHaveLength(2);
  });
});
