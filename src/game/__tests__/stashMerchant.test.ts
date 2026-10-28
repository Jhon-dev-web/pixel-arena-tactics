import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSave, normalizeSave, playerLevel, SaveData, xpToReachLevel } from '../engine';
import { inventorySlotsUsed, inventoryCapacity, STACK_LIMIT } from '../inventory';
import {
  applyStashMove,
  applyStashUpgrade,
  applyStoreAll,
  emptyStash,
  MAX_STASH_LEVEL,
  nextStashUpgrade,
  sanitizeStash,
  STASH_BASE_SLOTS,
  STASH_STEP_SLOTS,
  STASH_UPGRADES,
  stashCapacity,
  stashCount,
  stashFreeSlots,
  stashHintFor,
  stashSlotsUsed,
} from '../stash';
import {
  applyMerchantSell,
  merchantBudget,
  merchantBuys,
  merchantPrice,
  merchantQuote,
  merchantRemaining,
} from '../merchant';
import { applyDiscard } from '../bagActions';
import { baseGoldValue } from '../economy';
import { MATERIALS, MATERIAL_CONSUMER_PENDING, MaterialId } from '../materials';
import { CONSUMABLES, ConsumableId } from '../consumables';
import { GEAR, isInstancedSlot } from '../gear';
import { REFINING_RECIPES } from '../refining';
import { POTION_RECIPES, potionRecipeKey } from '../potions';
import { getSalvageReturn } from '../salvage';
import { createGearInstance } from '../gearInstances';
import { CONSUMABLES_WITHOUT_USE, MATERIALS_WITHOUT_USE, materialsWithoutUse, usesOf } from '../itemUses';
import { ORE_TIERS } from '../ores';
import { WOOD_TIERS } from '../woodcutting';
import T from '../tunables';

const NOW = new Date('2026-10-10T12:00:00Z').getTime();
const wire = (s: unknown) => JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
const withMats = (s: SaveData, m: Partial<Record<MaterialId, number>>): SaveData => ({ ...s, materials: { ...s.materials, ...m } });
const atLevel = (s: SaveData, level: number): SaveData => ({ ...s, xp: xpToReachLevel(level) });
const RELIC_ID = GEAR.find((g) => !isInstancedSlot(g.slot))!.id;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('stash: capacity, saving and upgrades', () => {
  it('starts at 20 slots, +10 per upgrade, up to 100, one upgrade table row per level', () => {
    expect(STASH_BASE_SLOTS).toBe(20);
    expect(STASH_STEP_SLOTS).toBe(10);
    expect(STASH_BASE_SLOTS + STASH_STEP_SLOTS * MAX_STASH_LEVEL).toBe(100);
    expect(MAX_STASH_LEVEL).toBe(STASH_UPGRADES.length);
    expect(stashCapacity(defaultSave())).toBe(20);
  });

  it('the upgrade table asks for refined wood and bars plus gold, rising level by level', () => {
    const wood = new Set(['wood_handle_common', 'wood_handle_oak', 'wood_handle_ebony', 'wood_handle_elven', 'wood_handle_ancient']);
    const bars = new Set(['copper_bar', 'steel', 'silver_ingot', 'gold_bar', 'refined_obsidian']);
    for (const u of STASH_UPGRADES) {
      const ids = Object.keys(u.materials);
      expect(ids.some((m) => wood.has(m))).toBe(true);
      expect(ids.some((m) => bars.has(m))).toBe(true);
      expect(u.gold).toBeGreaterThan(0);
    }
    expect(STASH_UPGRADES.map((u) => u.gold)).toEqual([...STASH_UPGRADES.map((u) => u.gold)].sort((a, b) => a - b));
  });

  it('an upgrade takes gold and materials from the INVENTORY (never the stash), all or nothing, and adds 10 slots', () => {
    const first = STASH_UPGRADES[0];
    const s = withMats({ ...defaultSave(), gold: first.gold }, first.materials as Record<MaterialId, number>);
    const up = applyStashUpgrade(s)!;
    expect(up.stash.level).toBe(1);
    expect(stashCapacity(up)).toBe(30);
    expect(up.gold).toBe(0);
    for (const m of Object.keys(first.materials) as MaterialId[]) expect(up.materials[m]).toBe(0);
    // materials only in the stash do not count
    const inStash = { ...defaultSave(), gold: first.gold, stash: { ...emptyStash(), materials: first.materials } };
    expect(applyStashUpgrade(inStash)).toBeNull();
    expect(applyStashUpgrade({ ...s, gold: first.gold - 1 })).toBeNull();
    expect(nextStashUpgrade({ stash: { ...emptyStash(), level: MAX_STASH_LEVEL } })).toBeNull();
  });

  it('a save without a stash loads with the empty level-0 one; a stash survives a round trip; garbage is cleaned, nothing valid is lost', () => {
    const old = wire(defaultSave());
    delete old.stash;
    delete old.merchant;
    expect(normalizeSave(old).stash).toEqual(emptyStash());
    const s: SaveData = { ...defaultSave(), stash: { level: 3, materials: { iron: 500 }, consumables: { small_hp: 3 }, gear: { [RELIC_ID]: 2 } } };
    expect(normalizeSave(wire(s)).stash).toEqual(s.stash);
    const dirty = sanitizeStash({ level: 99, materials: { iron: 5.7, nope: 3, copper: -1 }, consumables: { small_hp: 'x' }, gear: { bronze_dagger: 1 } });
    expect(dirty.level).toBe(MAX_STASH_LEVEL);
    expect(dirty.materials).toEqual({ iron: 5 });
    expect(dirty.consumables).toEqual({});
    expect(dirty.gear).toEqual({}); // an instanced template cannot be stashed
  });
});

describe('stash moves', () => {
  const stocked = (): SaveData => withMats(defaultSave(), { iron: 250, copper: 40, leather_scrap: 10 });
  const total = (s: SaveData, id: MaterialId) => s.materials[id] + (s.stash.materials[id] ?? 0);

  it('stores part of a stack, or all of it, and takes it back; units are conserved', () => {
    const s = stocked();
    const half = applyStashMove(s, 'store', 'material', 'iron', 100);
    expect(half.moved).toBe(100);
    expect(half.save.materials.iron).toBe(150);
    expect(stashCount(half.save, 'material', 'iron')).toBe(100);
    const all = applyStashMove(half.save, 'store', 'material', 'iron', 'all');
    expect(all.save.materials.iron).toBe(0);
    expect(stashCount(all.save, 'material', 'iron')).toBe(250);
    expect(stashSlotsUsed(all.save)).toBe(3);
    const back = applyStashMove(all.save, 'take', 'material', 'iron', 'all');
    expect(back.moved).toBe(250);
    expect(back.save.materials.iron).toBe(250);
    expect(stashCount(back.save, 'material', 'iron')).toBe(0);
    expect(total(back.save, 'iron')).toBe(250);
  });

  it('the stash follows the same 99-per-slot rule and moves only what fits (partial stacks first)', () => {
    let s = withMats(defaultSave(), { iron: 99 * 25 }); // 25 slots of iron, the stash holds 20
    const r = applyStashMove(s, 'store', 'material', 'iron', 'all');
    expect(r.moved).toBe(99 * 20);
    expect(stashFreeSlots(r.save)).toBe(0);
    expect(r.save.materials.iron).toBe(99 * 5);
    expect(total(r.save, 'iron')).toBe(99 * 25);
    // full stash: only a partial stack could take more, and there is none
    expect(applyStashMove(withMats(r.save, { copper: 5 }), 'store', 'material', 'copper', 'all').moved).toBe(0);
    s = r.save;
    expect(inventorySlotsUsed(s)).toBe(5);
  });

  it('taking is limited by the inventory room; a full bag takes nothing new, and nothing is lost', () => {
    const base: SaveData = { ...defaultSave(), stash: { ...emptyStash(), materials: { iron: 300, copper: 5 } } };
    const filler = MATERIALS.filter((m) => m.id !== 'iron' && m.id !== 'copper').slice(0, inventoryCapacity(base)).map((m) => m.id);
    const full = withMats(base, Object.fromEntries(filler.slice(0, inventoryCapacity(base)).map((id) => [id, 1])) as Record<MaterialId, number>);
    expect(inventorySlotsUsed(full)).toBe(inventoryCapacity(full));
    expect(applyStashMove(full, 'take', 'material', 'iron', 'all').moved).toBe(0);
    const room = withMats(full, { [filler[0]]: 0, [filler[1]]: 0 });
    const r = applyStashMove(room, 'take', 'material', 'iron', 'all');
    expect(r.moved).toBe(2 * STACK_LIMIT);
    expect(stashCount(r.save, 'material', 'iron')).toBe(300 - 2 * STACK_LIMIT);
  });

  it('consumables move too, and the equipped relic copy never leaves the bag', () => {
    const s: SaveData = { ...defaultSave(), consumables: { ...defaultSave().consumables, small_hp: 7 }, inventory: { ...defaultSave().inventory, [RELIC_ID]: 2 }, equipped: { ...defaultSave().equipped, relic: RELIC_ID } };
    expect(applyStashMove(s, 'store', 'consumable', 'small_hp', 'all').save.stash.consumables.small_hp).toBe(7);
    const r = applyStashMove(s, 'store', 'gear', RELIC_ID, 'all');
    expect(r.moved).toBe(1); // one copy is worn
    expect(r.save.inventory[RELIC_ID]).toBe(1);
    const only: SaveData = { ...s, inventory: { ...s.inventory, [RELIC_ID]: 1 } };
    expect(applyStashMove(only, 'store', 'gear', RELIC_ID, 'all').moved).toBe(0);
  });

  it('"guardar tudo" stores every material type that fits and conserves the units', () => {
    const r = applyStoreAll(stocked(), 'material');
    expect(r.moved).toBe(300);
    expect(r.save.materials.iron).toBe(0);
    expect(stashCount(r.save, 'material', 'copper')).toBe(40);
  });

  it('recipes consume only from the inventory; the hint says what the stash holds and whether it fits', () => {
    const s: SaveData = { ...defaultSave(), stash: { ...emptyStash(), materials: { iron: 40 } } };
    expect(stashHintFor(s, 'material', 'iron', 10)).toEqual({ inStash: 40, bring: 10, fits: true });
    expect(stashHintFor(withMats(s, { iron: 10 }), 'material', 'iron', 10)).toBeNull(); // nothing missing
    expect(stashHintFor(s, 'material', 'copper', 10)).toBeNull(); // nothing in the stash
  });
});

describe('merchant: prices', () => {
  it('a material sells for floor(15% of its economic reference), minimum 1, never above its legacy sellValue', () => {
    for (const m of MATERIALS) {
      const p = merchantPrice('material', m.id);
      expect(p, m.id).toBeGreaterThanOrEqual(1);
      expect(p, m.id).toBeLessThanOrEqual(Math.max(1, Math.floor(T.merchant.priceRate * baseGoldValue(m.id))));
      if (m.sellValue > 0) expect(p, m.id).toBeLessThanOrEqual(m.sellValue);
    }
    expect(merchantPrice('material', 'leather_scrap')).toBe(1);
    expect(merchantPrice('material', 'demon_core')).toBe(Math.floor(0.15 * baseGoldValue('demon_core')));
  });

  it('consumables sell for their sellValue; Pass-only items and tickets cannot be sold', () => {
    expect(merchantPrice('consumable', 'small_hp')).toBeLessThanOrEqual(12);
    expect(merchantBuys('consumable', 'refine_catalyst')).toBe(false);
    expect(merchantBuys('consumable', 'expedition_ticket_1h')).toBe(false);
    expect(merchantBuys('consumable', 'nope')).toBe(false);
  });

  it('ARBITRAGE SCAN: no recipe turns Gold into more Gold (craft cost + inputs\' sell value >= output sell value), refining chains included', () => {
    const matSell = (id: MaterialId) => merchantPrice('material', id);
    const violations: string[] = [];
    for (const r of REFINING_RECIPES) {
      const inputs = (Object.entries(r.input) as [MaterialId, number][]).reduce((sum, [id, q]) => sum + q * matSell(id), 0);
      if (r.cost + inputs < r.outputQty * matSell(r.output)) violations.push(`refino ${r.id}: ${r.cost}+${inputs} < ${r.outputQty * matSell(r.output)}`);
    }
    for (const r of POTION_RECIPES) {
      const inputs = (Object.entries(r.input) as [MaterialId, number][]).reduce((sum, [id, q]) => sum + q * matSell(id), 0);
      if (r.cost + inputs < merchantPrice('consumable', r.id)) violations.push(`alquimia ${r.id}: ${r.cost}+${inputs} < ${merchantPrice('consumable', r.id)}`);
    }
    // the Shop sells potions for more than the merchant pays for them
    for (const c of CONSUMABLES.filter((x) => x.purchasable)) if (merchantPrice('consumable', c.id) > c.cost) violations.push(`loja ${c.id}`);
    // forging then salvaging then selling the refund
    for (const g of GEAR.filter((x) => x.recipe && !x.unique)) {
      const mats = (Object.entries(g.recipe!.materials ?? {}) as [MaterialId, number][]).reduce((sum, [id, q]) => sum + q * matSell(id), 0);
      const refund = (Object.entries(getSalvageReturn(g).materials) as [MaterialId, number][]).reduce((sum, [id, q]) => sum + q * matSell(id), 0);
      if (g.cost + mats < refund) violations.push(`salvar ${g.id}`);
    }
    expect(violations).toEqual([]);
  });
});

describe('merchant: sales and the daily budget', () => {
  const rich = (): SaveData => atLevel(withMats(defaultSave(), { leather_scrap: 5000, demon_core: 40 }), 30);

  it('budget = base + per level x level; shown as what is left today', () => {
    expect(merchantBudget(30)).toBe(Math.round(T.merchant.baseBudget + T.merchant.budgetPerLevel * 30));
    expect(merchantBudget(100)).toBeGreaterThan(merchantBudget(10));
    const s = rich();
    expect(merchantRemaining(s, NOW)).toBe(merchantBudget(playerLevel(s.xp)));
  });

  it('selling pays price x units from the inventory only, spends the budget, and stops when it is gone', () => {
    const s = rich();
    const budget = merchantRemaining(s, NOW);
    const r = applyMerchantSell(s, 'material', 'leather_scrap', 10, NOW);
    expect(r.ok).toBe(true);
    expect(r.units).toBe(10);
    expect(r.gold).toBe(10 * merchantPrice('material', 'leather_scrap'));
    expect(r.save!.materials.leather_scrap).toBe(4990);
    expect(r.save!.gold).toBe(r.gold);
    expect(merchantRemaining(r.save!, NOW)).toBe(budget - r.gold!);
    // everything: capped by what the day's budget pays for
    const all = applyMerchantSell(r.save!, 'material', 'leather_scrap', 'all', NOW);
    expect(all.ok).toBe(true);
    expect(all.capped).toBe(true);
    expect(all.save!.gold).toBeLessThanOrEqual(budget);
    expect(merchantRemaining(all.save!, NOW)).toBeLessThan(merchantPrice('material', 'leather_scrap') + 1);
    // spent: nothing more today
    const again = applyMerchantSell(all.save!, 'material', 'demon_core', 1, NOW);
    expect(again.ok).toBe(false);
    expect(again.reason).toBe('budget');
  });

  it('the budget resets at the local midnight, survives a reload within the day and never carries over', () => {
    const s = applyMerchantSell(rich(), 'material', 'leather_scrap', 'all', NOW).save!;
    expect(merchantRemaining(s, NOW)).toBeLessThan(2);
    expect(merchantRemaining(normalizeSave(wire(s)), NOW)).toBeLessThan(2); // same day, reload
    const next = new Date(NOW);
    next.setHours(24, 0, 1, 0); // just past the local midnight
    vi.setSystemTime(next.getTime());
    expect(merchantRemaining(s, next.getTime())).toBe(merchantBudget(playerLevel(s.xp)));
    expect(merchantRemaining(normalizeSave(wire(s)), next.getTime())).toBe(merchantBudget(playerLevel(s.xp)));
    expect(applyMerchantSell(s, 'material', 'demon_core', 1, next.getTime()).ok).toBe(true);
  });

  it('quotes never promise more than is sold; unknown or empty stacks are refused', () => {
    const s = rich();
    const q = merchantQuote(s, 'material', 'leather_scrap', 'all', NOW);
    expect(applyMerchantSell(s, 'material', 'leather_scrap', 'all', NOW).units).toBe(q.units);
    expect(applyMerchantSell(s, 'material', 'iron', 5, NOW).reason).toBe('none');
    expect(applyMerchantSell(s, 'consumable', 'refine_catalyst', 1, NOW).reason).toBe('unsellable');
  });

  it('consumables can be sold and gear instances / uniques are not part of the merchant at all', () => {
    const s: SaveData = atLevel({ ...defaultSave(), consumables: { ...defaultSave().consumables, small_hp: 5 } }, 20);
    const r = applyMerchantSell(s, 'consumable', 'small_hp', 5, NOW);
    expect(r.ok).toBe(true);
    expect(r.save!.consumables.small_hp).toBe(0);
    expect(r.gold).toBe(5 * merchantPrice('consumable', 'small_hp'));
    // the API only knows materials and consumables: an instance id is not a sellable thing
    expect(applyMerchantSell(s, 'material', 'bronze_dagger', 1, NOW).reason).toBe('unsellable');
  });
});

describe('discard', () => {
  it('discards part or all of a stack, always, and never the worn copy', () => {
    const s = withMats(defaultSave(), { iron: 250 });
    expect(applyDiscard(s, 'material', 'iron', 50)!.materials.iron).toBe(200);
    expect(applyDiscard(s, 'material', 'iron', 'all')!.materials.iron).toBe(0);
    expect(applyDiscard(s, 'material', 'copper', 'all')).toBeNull();
    const relic: SaveData = { ...s, inventory: { ...s.inventory, [RELIC_ID]: 3 }, equipped: { ...s.equipped, relic: RELIC_ID } };
    expect(applyDiscard(relic, 'gear', RELIC_ID, 'all')!.inventory[RELIC_ID]).toBe(1);
    expect(applyDiscard({ ...relic, inventory: { ...relic.inventory, [RELIC_ID]: 1 } }, 'gear', RELIC_ID, 'all')).toBeNull();
    const inst = createGearInstance('bronze_dagger', { id: 'gi_x', origin: 'craft', rarity: 'common', substats: [] });
    const withInst: SaveData = { ...s, gearInstances: { ...s.gearInstances, gi_x: inst } };
    expect(applyDiscard(withInst, 'instance', 'gi_x')!.gearInstances.gi_x).toBeUndefined();
    expect(applyDiscard(withInst, 'instance', withInst.equipped.weapon!)).toBeNull(); // the equipped one stays
  });

  it('frees slots: discarding 150 of 250 drops a 3-slot stack to 1 slot', () => {
    const s = withMats(defaultSave(), { iron: 250 });
    expect(inventorySlotsUsed(s)).toBe(3);
    expect(inventorySlotsUsed(applyDiscard(s, 'material', 'iron', 150)!)).toBe(2);
  });
});

describe('usesOf: where an item is consumed, from the real recipe data', () => {
  it('every material has at least one use (or is flagged), and the flags are exactly the unused ones', () => {
    // MATERIAL_CONSUMER_PENDING (materials.ts) is the only other exception: materials whose consumer arrives in a later phase of the classes reform
    const flagged = [...MATERIALS_WITHOUT_USE, ...MATERIAL_CONSUMER_PENDING];
    expect(materialsWithoutUse().sort()).toEqual([...flagged].sort());
    for (const m of MATERIALS) if (!flagged.includes(m.id)) expect(usesOf('material', m.id).length, m.id).toBeGreaterThan(0);
  });

  it('MATERIAL_CONSUMER_PENDING never goes stale: every id in it still has no consumer (take it out in the commit that adds the recipe that spends it)', () => {
    const stale = MATERIAL_CONSUMER_PENDING.filter((id) => usesOf('material', id).length > 0);
    expect(stale, 'these now have a consumer: remove them from MATERIAL_CONSUMER_PENDING in materials.ts').toEqual([]);
    expect(new Set(MATERIAL_CONSUMER_PENDING).size).toBe(MATERIAL_CONSUMER_PENDING.length);
  });

  it('every consumable has a use or is flagged', () => {
    for (const c of CONSUMABLES) if (!CONSUMABLES_WITHOUT_USE.includes(c.id as ConsumableId)) expect(usesOf('consumable', c.id).length, c.id).toBeGreaterThan(0);
  });

  it('the entries point at real recipes: forge ids, refining recipe ids, alchemy ids', () => {
    for (const m of MATERIALS) {
      for (const u of usesOf('material', m.id)) {
        if (u.kind === 'forge') for (const ref of u.refs) expect(GEAR.find((g) => g.id === ref)?.recipe?.materials?.[m.id]).toBeGreaterThan(0);
        if (u.kind === 'refine') for (const ref of u.refs) expect(REFINING_RECIPES.find((r) => r.id === ref)?.input[m.id]).toBeGreaterThan(0);
        if (u.kind === 'alchemy') for (const ref of u.refs) expect(POTION_RECIPES.find((r) => potionRecipeKey(r) === ref)?.input[m.id]).toBeGreaterThan(0);
      }
    }
    const copper = usesOf('material', 'copper').map((u) => u.kind);
    expect(copper).toContain('refine');
    expect(usesOf('material', 'copper_bar').map((u) => u.kind)).toContain('forge');
    expect(usesOf('material', 'wood_handle_oak').map((u) => u.kind)).toEqual(expect.arrayContaining(['forge', 'stash']));
    expect(usesOf('material', 'refining_dust').map((u) => u.kind)).toContain('upgrade');
    expect(usesOf('material', 'demon_claw').map((u) => u.kind)).toContain('reforge');
    expect(usesOf('consumable', 'fertilizer').map((u) => u.kind)).toEqual(['garden']);
    expect(usesOf('consumable', 'expedition_ticket_2h').map((u) => u.kind)).toEqual(['delivery']);
    expect(usesOf('consumable', 'small_hp').map((u) => u.kind)).toEqual(['auto']);
    for (const t of [...ORE_TIERS, ...WOOD_TIERS]) expect(usesOf('material', t.id).length, t.id).toBeGreaterThan(0);
  });

  it('delivery uses name the offers on the board that ask for the item right now', () => {
    const offer = { id: 'd7', arch: 'militar', dist: 'curta', cls: 'simple', tier: 0, items: { demon_claw: 5 }, gold: 1, xp: 1, shards: 0, durationMs: 1, bornAt: 1, dest: 0 };
    const s = { deliveries: { seq: 7, offers: [offer], active: null, rerollDay: '', rerollsUsed: 0 } } as unknown as Pick<SaveData, 'deliveries'>;
    expect(usesOf('material', 'demon_claw', s).find((u) => u.kind === 'delivery')!.refs).toEqual(['d7']);
    expect(usesOf('material', 'leather_scrap', s).find((u) => u.kind === 'delivery')!.refs).toEqual(['board']);
  });
});
