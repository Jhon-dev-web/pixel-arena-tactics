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

  it('counts one slot per stack of up to STACK_LIMIT units of a material / consumable type and one per stored, unequipped gear instance', () => {
    let s = defaultSave();
    s = { ...s, materials: { ...s.materials, leather_scrap: 99, iron: 1 }, consumables: { ...s.consumables, small_hp: 20 } };
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
      { ...base, gold: 10_000, materials: { ...emptyMaterials(), copper_bar: 5, leather: 20, wood_handle_common: 5 } },
      DEFAULT_INVENTORY_CAPACITY,
    );
    expect(isBagFull(full)).toBe(true);
    const res = applyForge(full, 'bronze_dagger', { level: 1 });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('capacity');
    // one slot free -> it works, and the bag ends exactly full
    const roomy = withSlotsUsed({ ...full, materials: { ...emptyMaterials(), copper_bar: 5, leather: 20, wood_handle_common: 5 } }, DEFAULT_INVENTORY_CAPACITY - 1);
    const ok = applyForge(roomy, 'bronze_dagger', { level: 1 });
    expect(ok.ok).toBe(true);
    expect(inventorySlotsUsed(ok.save!)).toBeLessThanOrEqual(inventoryCapacity(ok.save!));
  });
});
