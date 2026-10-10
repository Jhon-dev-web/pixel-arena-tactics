import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeCP, defaultSave, loadSave, normalizeSave, persistSave, playerMaxHp, SaveData } from '../engine';
import { LocalSaveRepository } from '../saveRepository';
import { MAX_DUNGEON_FLOOR } from '../dungeon';
import { DEFAULT_INVENTORY_CAPACITY } from '../inventory';
import { emptyMaterials } from '../materials';

const NOW = new Date('2026-10-10T12:00:00Z').getTime();
const TODAY = new Date(NOW).toDateString();

// Loading stamps "today" on the two daily counters (quests + Dungeon sessions); nothing else may change.
const asLoaded = (s: SaveData): SaveData => ({ ...s, quests: { ...s.quests, dailyDay: TODAY }, dungeonSessionsDay: TODAY });
const wire = (s: unknown) => JSON.parse(JSON.stringify(s)) as Record<string, unknown>;

const isCleanNumber = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  localStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe('save round trip', () => {
  it('defaultSave() survives normalizeSave unchanged (object and JSON-string input)', () => {
    const fresh = defaultSave();
    expect(normalizeSave(wire(fresh))).toEqual(asLoaded(fresh));
    expect(normalizeSave(JSON.stringify(fresh))).toEqual(asLoaded(fresh));
  });

  it('normalizeSave is idempotent', () => {
    const once = normalizeSave(wire(defaultSave()));
    expect(normalizeSave(wire(once))).toEqual(once);
  });

  it('persistSave -> loadSave through localStorage and the local repository gives the same save back', async () => {
    const fresh = defaultSave();
    persistSave(fresh);
    expect(loadSave()).toEqual(asLoaded(fresh));
    const repo = new LocalSaveRepository();
    await repo.save(fresh);
    const { save, revision } = await repo.load();
    expect(save).toEqual(asLoaded(fresh));
    expect(revision).toBe(0);
  });

  it('a played save keeps its progress through a reload', () => {
    const base = defaultSave();
    const played: SaveData = {
      ...base,
      gold: 4321,
      shards: 7,
      xp: 98765,
      str: 4,
      vit: 3,
      highestDungeonFloor: 31,
      dungeonCheckpoints: [25],
      materials: { ...emptyMaterials(), leather_scrap: 12, iron: 5 },
      gems: { ruby: 1, sapphire: 2, emerald: 0 },
      consumables: { ...base.consumables, small_hp: 3 },
      unlockedHuntingZones: ['demon_glade', 'blood_marsh'],
    };
    expect(normalizeSave(wire(played))).toEqual(asLoaded(played));
  });
});

describe('legacy and unknown fields', () => {
  it('a stale oneTokenBalance (removed from the game) loads without throwing or losing progress', () => {
    const s = defaultSave();
    s.gold = 1234;
    s.xp = 5678;
    s.materials = { ...emptyMaterials(), leather_scrap: 9 };
    s.inventory = { ring_vitality: 1 };
    const raw = { ...wire(s), oneTokenBalance: 50, someFutureField: { nested: true } };
    let loaded!: SaveData;
    expect(() => {
      loaded = normalizeSave(raw);
    }).not.toThrow();
    expect(loaded.gold).toBe(1234);
    expect(loaded.xp).toBe(5678);
    expect(loaded.materials.leather_scrap).toBe(9);
    expect(loaded.inventory.ring_vitality).toBe(1);
    // and the loaded save is still a working one
    expect(Number.isFinite(computeCP(loaded))).toBe(true);
  });

  it('a v1 save (per-item maps, no gearInstances) migrates to instances once and is stable after that', () => {
    const v1 = {
      gold: 50,
      xp: 400,
      inventory: { wooden_club: 1, ragged_clothes: 1, bronze_dagger: 2 },
      equipped: { weapon: 'bronze_dagger', armor: 'ragged_clothes' },
      upgrades: { bronze_dagger: 2 },
    };
    const first = normalizeSave(JSON.stringify(v1));
    expect(first.schemaVersion).toBe(2);
    expect(Object.values(first.gearInstances).filter((i) => i.templateId === 'bronze_dagger')).toHaveLength(2);
    const weapon = first.gearInstances[first.equipped.weapon as string];
    expect(weapon.templateId).toBe('bronze_dagger');
    expect(weapon.upgrade).toBe(2);
    // the raw v1 payload is kept once, for a manual rollback
    expect(localStorage.getItem('arena-rpg-save-v1.pre-instances')).not.toBeNull();
    // the migration is deterministic: load -> persist -> load gives the same save
    expect(normalizeSave(wire(first))).toEqual(first);
    expect(Object.keys(first)).not.toContain('upgrades');
  });
});

describe('corrupt input', () => {
  it.each([
    ['invalid JSON', '{not json'],
    ['empty string', ''],
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['a JSON string literal', '"hello"'],
    ['an array', []],
  ])('%s falls back to a usable, brand-new save', (_name, input) => {
    const loaded = normalizeSave(input);
    // Not compared field-for-field with defaultSave(): a truthy-but-garbage payload (42, [], "hello") goes down the v1
    // migration path (mg_* instance ids, tutorial marked completed), which is equivalent for gameplay.
    expect(loaded.gold).toBe(0);
    expect(loaded.xp).toBe(0);
    expect(loaded.schemaVersion).toBe(2);
    expect(loaded.highestDungeonFloor).toBe(1);
    expect(loaded.gearInstances[loaded.equipped.weapon as string].templateId).toBe('wooden_club');
    expect(loaded.gearInstances[loaded.equipped.armor as string].templateId).toBe('ragged_clothes');
    expect(computeCP(loaded)).toBe(computeCP(defaultSave()));
  });

  it.each([['abc'], [-50], [Number.NaN], [Number.POSITIVE_INFINITY], [{}], [[]], [null], [true]])('xp = %j never survives as a bad number', (bad) => {
    const loaded = normalizeSave({ ...wire(defaultSave()), xp: bad });
    expect(isCleanNumber(loaded.xp)).toBe(true);
  });

  it('out-of-range / wrong-typed progress fields are clamped, not trusted', () => {
    const loaded = normalizeSave({
      ...wire(defaultSave()),
      highestDungeonFloor: 99999,
      dungeonCheckpoints: [25, 25, 13, 'x', 100, 999],
      inventoryCapacity: 'lots',
      unlockedHuntingZones: ['blood_marsh', 'does_not_exist'],
      activeHuntingZone: 'does_not_exist',
      battlePassLevel: 9999,
      equipped: { weapon: 'gi_missing', armor: 42 },
    });
    expect(loaded.highestDungeonFloor).toBe(MAX_DUNGEON_FLOOR);
    expect([...loaded.dungeonCheckpoints].sort((a, b) => a - b)).toEqual([25, 100]);
    expect(loaded.inventoryCapacity).toBe(DEFAULT_INVENTORY_CAPACITY);
    expect(loaded.unlockedHuntingZones).toEqual(['demon_glade', 'blood_marsh']);
    expect(loaded.activeHuntingZone).toBeNull();
    expect(loaded.battlePassLevel).toBeLessThanOrEqual(30);
    expect(loaded.equipped.weapon).toBeNull();
    expect(loaded.equipped.armor).toBeNull();
    expect(Number.isFinite(computeCP(loaded))).toBe(true);
  });

  it('a stored negative capacity never shrinks the bag below the default, and a bigger one is kept', () => {
    expect(normalizeSave({ ...wire(defaultSave()), inventoryCapacity: -10 }).inventoryCapacity).toBe(DEFAULT_INVENTORY_CAPACITY);
    expect(normalizeSave({ ...wire(defaultSave()), inventoryCapacity: 55 }).inventoryCapacity).toBe(55);
  });

  // gold, shards, victories, vit and armorLevel used to be copied from the payload unchecked (a string or a negative
  // survived the load); normalizeSave now validates them like every other numeric field.
  it('non-numeric or negative gold falls back to a clean number', () => {
    for (const bad of ['abc', -5, Number.NaN, null, {}]) {
      const loaded = normalizeSave({ ...wire(defaultSave()), gold: bad });
      expect(isCleanNumber(loaded.gold)).toBe(true);
    }
  });

  it('non-numeric or negative shards fall back to a clean number', () => {
    for (const bad of ['abc', -5, null]) {
      const loaded = normalizeSave({ ...wire(defaultSave()), shards: bad });
      expect(isCleanNumber(loaded.shards)).toBe(true);
    }
  });

  it('a corrupt vit / armorLevel can no longer turn max HP and CP into NaN', () => {
    for (const field of ['vit', 'armorLevel'] as const) {
      const loaded = normalizeSave({ ...wire(defaultSave()), [field]: 'abc' });
      expect(Number.isFinite(playerMaxHp(loaded))).toBe(true);
      expect(computeCP(loaded)).toBeGreaterThan(0);
    }
  });

  it('victories, vit and armorLevel keep legal values and replace illegal ones', () => {
    const ok = normalizeSave({ ...wire(defaultSave()), victories: 12, vit: 40, armorLevel: 3, gold: 1500, shards: 9 });
    expect([ok.victories, ok.vit, ok.armorLevel, ok.gold, ok.shards]).toEqual([12, 40, 3, 1500, 9]);
    for (const bad of ['7', -1, Number.NaN, Number.POSITIVE_INFINITY, null, {}, [], true]) {
      const loaded = normalizeSave({ ...wire(defaultSave()), victories: bad, vit: bad, armorLevel: bad, gold: bad, shards: bad });
      expect(loaded.victories).toBe(0);
      expect(loaded.vit).toBe(0);
      expect(loaded.armorLevel).toBe(1);
      expect(loaded.gold).toBe(0);
      expect(loaded.shards).toBe(0);
    }
    // whole numbers only, vit capped at 3 points per level of the level-100 cap, armorLevel never below 1
    const odd = normalizeSave({ ...wire(defaultSave()), gold: 10.9, vit: 99999, armorLevel: 0.5 });
    expect(odd.gold).toBe(10);
    expect(odd.vit).toBe(300);
    expect(odd.armorLevel).toBe(1);
  });
});
