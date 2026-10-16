import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSave, normalizeSave, SaveData } from '../engine';
import { applyMerchantSell, merchantPrice } from '../merchant';
import { applyStashMove, applyStoreAll } from '../stash';
import { addWithOverflow, bagFreeSlots, inventorySlotsUsed, placeUnits, stockSlots, STACK_LIMIT } from '../inventory';
import { applyForge } from '../gearInstances';
import { applyWholesaleSell, wholesaleQuote } from '../wholesale';
import { MATERIALS, MaterialId } from '../materials';
import { GEAR } from '../gear';
import { PLANTS } from '../garden';
import { ORE_TIERS } from '../ores';
import { WOOD_TIERS } from '../woodcutting';
import { HUNTING_ZONES } from '../huntingZones';
import { setItemAuthority } from '../itemAuthority';
import { queueMaterialClaim, sanitizeMaterialClaims } from '../materialClaims';
import {
  TRADEABLE_MATERIALS,
  addTradeableUnits,
  clampTradeable,
  convertToTradeable,
  gateTradeableUse,
  isTradeableMaterial,
  listTradeable,
  normalOf,
  reconcileTradeable,
  removeTradeableUnits,
  settleBurns,
  stackQty,
  stripTradeable,
  tradeableOf,
  withMaterialPrefs,
} from '../tradeableMaterials';
import { recipeStock } from './recipeStock';

const NOW = new Date('2026-10-16T12:00:00Z').getTime();
const with_ = (s: SaveData, total: Partial<Record<MaterialId, number>>, trade: Partial<Record<MaterialId, number>>): SaveData => ({
  ...s,
  materials: { ...s.materials, ...total },
  tradeableMaterials: { ...trade },
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  setItemAuthority('local');
});
afterEach(() => {
  vi.useRealTimers();
  setItemAuthority('local');
});

describe('which materials have a tradeable variant', () => {
  it('exactly the ones a claim produces: ores, woods, garden plants and the Hunting drops', () => {
    const produced = new Set<string>([...ORE_TIERS.map((o) => o.id), ...WOOD_TIERS.map((w) => w.id), ...PLANTS.map((p) => p.material), ...HUNTING_ZONES.flatMap((z) => z.drops.map((d) => d.material))]);
    expect([...TRADEABLE_MATERIALS].sort()).toEqual([...produced].sort());
    expect(TRADEABLE_MATERIALS).toHaveLength(32);
  });

  it('bars, handles, dust and the shop materials never do (they are made or bought, not claimed)', () => {
    for (const id of ['copper_bar', 'silver_ingot', 'gold_bar', 'refined_obsidian', 'wood_handle_common', 'wood_handle_ancient', 'refining_dust', 'steel', 'leather', 'essence', 'dragon_scales']) {
      expect(isTradeableMaterial(id), id).toBe(false);
    }
  });
});

describe('two stacks of one material', () => {
  it('the tradeable units are a stack of their own: separate slots, the total stays in materials', () => {
    const s = with_(defaultSave(), { iron: 100 }, { iron: 1 });
    expect(normalOf(s, 'iron')).toBe(99);
    expect(tradeableOf(s, 'iron')).toBe(1);
    expect(stockSlots({ materials: { iron: 100 }, tradeable: { iron: 1 } })).toBe(2); // 99 + 1
    expect(stockSlots({ materials: { iron: 100 } })).toBe(2); // (100 normal units are 2 slots anyway)
    expect(stockSlots({ materials: { iron: 99 }, tradeable: { iron: 99 } })).toBe(1); // all tradeable: one slot
    expect(stockSlots({ materials: { iron: 198 }, tradeable: { iron: 99 } })).toBe(2);
    expect(stockSlots({ materials: { iron: 5 }, tradeable: { iron: 3 } })).toBe(2); // 2 normal + 3 tradeable: one slot each
    expect(inventorySlotsUsed(with_(defaultSave(), { iron: 5 }, { iron: 3 }))).toBe(inventorySlotsUsed(defaultSave()) + 2);
  });

  it('a corrupt tradeable count (more than the total) never makes a negative stack', () => {
    expect(stockSlots({ materials: { iron: 3 }, tradeable: { iron: 50 } })).toBe(1);
  });

  it('new normal units fill the partial NORMAL stack and never the tradeable one', () => {
    const s = with_(defaultSave(), { iron: 50 }, { iron: 40 }); // 10 normal + 40 tradeable
    const placed = placeUnits({ materials: s.materials, consumables: {}, gear: {}, tradeable: s.tradeableMaterials }, { materials: { iron: 89 } }, 0);
    expect(placed.added.materials.iron).toBe(89); // 10 normal + 89 = 99: it fits the one normal slot, with no free slot at all
    const over = placeUnits({ materials: s.materials, consumables: {}, gear: {}, tradeable: s.tradeableMaterials }, { materials: { iron: 90 } }, 0);
    expect(over.added.materials.iron).toBe(89);
    expect(over.leftover.materials.iron).toBe(1);
  });

  it('the bag capacity rules apply to the tradeable stack too', () => {
    const s0 = with_(defaultSave(), { iron: 1 }, { iron: 1 });
    const free = bagFreeSlots(s0);
    // the one tradeable unit sits in a partial stack (98 more fit for free); every free slot then takes a whole stack
    const r = addTradeableUnits(s0, 'iron', STACK_LIMIT * (free + 1) + 50);
    expect(r.added).toBe(98 + STACK_LIMIT * free);
    expect(bagFreeSlots(r.save)).toBe(0);
    expect(addTradeableUnits(r.save, 'iron', 1).added).toBe(0);
    // normal units of the same material need a slot of their own: none left
    expect(addWithOverflow(r.save, { materials: { iron: 5 } }).added.materials.iron ?? 0).toBe(0);
  });
});

describe('spending: normal units first, tradeable ones only when the normal ones run out', () => {
  const recipe = GEAR.find((g) => g.id === 'bronze_dagger')!.recipe!;
  const need = recipe.materials as Partial<Record<MaterialId, number>>;
  const matId = Object.keys(need)[0] as MaterialId;

  it('a recipe that normal units cover spends no tradeable unit', () => {
    const stock = recipeStock('bronze_dagger');
    const s0 = { ...defaultSave(), gold: 1e6, materials: { ...defaultSave().materials, ...stock } as SaveData['materials'] };
    const s = with_(s0, { [matId]: (stock[matId] ?? 0) + 4 }, { [matId]: 4 });
    const r = applyForge(s, 'bronze_dagger', { level: 100, now: NOW });
    expect(r.ok).toBe(true);
    const rec = reconcileTradeable(s, r.save!);
    expect(rec.used).toEqual({});
    expect(tradeableOf(rec.save, matId)).toBe(4);
    expect(rec.save.tradeableBurns).toBeUndefined();
  });

  it('when the normal units run out the tradeable ones are spent, counted and queued for the burn', () => {
    const stock = recipeStock('bronze_dagger');
    const spent = need[matId]!;
    const have = spent + 1;
    const s = with_({ ...defaultSave(), gold: 1e6, materials: { ...defaultSave().materials, ...stock, [matId]: have } as SaveData['materials'] }, { [matId]: have }, { [matId]: have }); // no normal unit at all
    const r = applyForge(s, 'bronze_dagger', { level: 100, now: NOW });
    expect(r.ok).toBe(true);
    const rec = reconcileTradeable(s, r.save!);
    expect(rec.used[matId]).toBe(spent);
    expect(tradeableOf(rec.save, matId)).toBe(1);
    expect(rec.save.tradeableBurns?.[matId]).toBe(spent);
    expect(rec.save.materials[matId]).toBe(1);
    // ... and a partly covered recipe: one normal unit helps, the rest comes from the tradeable stack
    const mixed = with_({ ...defaultSave(), gold: 1e6, materials: { ...defaultSave().materials, ...stock, [matId]: have } as SaveData['materials'] }, { [matId]: have }, { [matId]: have - 1 });
    const r2 = applyForge(mixed, 'bronze_dagger', { level: 100, now: NOW });
    const rec2 = reconcileTradeable(mixed, r2.save!);
    expect(rec2.used[matId] ?? 0).toBe(spent - 1);
  });

  it('with the player setting flipped, tradeable units go first', () => {
    const s = withMaterialPrefs(with_(defaultSave(), { iron: 10 }, { iron: 4 }), { useTradeableFirst: true });
    const next: SaveData = { ...s, materials: { ...s.materials, iron: 8 } }; // spent 2
    const rec = reconcileTradeable(s, next);
    expect(rec.used.iron).toBe(2);
    expect(tradeableOf(rec.save, 'iron')).toBe(2);
    // and the other way (the default): the 6 normal units cover 2
    const def = reconcileTradeable(with_(defaultSave(), { iron: 10 }, { iron: 4 }), { ...s, materials: { ...s.materials, iron: 8 }, materialPrefs: undefined });
    expect(def.used).toEqual({});
    expect(tradeableOf(def.save, 'iron')).toBe(4);
  });

  it('the stack the player picked can be forced first (selling or discarding from the tradeable tile)', () => {
    const s = with_(defaultSave(), { iron: 10 }, { iron: 4 });
    const rec = reconcileTradeable(s, { ...s, materials: { ...s.materials, iron: 7 } }, { first: true });
    expect(rec.used.iron).toBe(3);
    expect(tradeableOf(rec.save, 'iron')).toBe(1);
  });

  it('a change that does not touch the totals, or only adds, spends nothing', () => {
    const s = with_(defaultSave(), { iron: 10 }, { iron: 4 });
    expect(reconcileTradeable(s, { ...s, gold: 5 }).used).toEqual({});
    expect(reconcileTradeable(s, { ...s, materials: { ...s.materials, iron: 40 } }).used).toEqual({});
  });

  it('a reducer that sets tradeableMaterials itself (a listing, a delivery) is only clamped, never counted as a spend', () => {
    const s = with_(defaultSave(), { iron: 10 }, { iron: 4 });
    const listed = removeTradeableUnits(s, 'iron', 3)!;
    const rec = reconcileTradeable(s, listed);
    expect(rec.used).toEqual({});
    expect(tradeableOf(rec.save, 'iron')).toBe(1);
    expect(rec.save.materials.iron).toBe(7);
    expect(removeTradeableUnits(s, 'iron', 5)).toBeNull();
  });

  it('settling a burn removes it from the queue', () => {
    const queued: SaveData = { ...defaultSave(), tradeableBurns: { iron: 5, copper: 2 } };
    expect(settleBurns(queued, { iron: 5 }).tradeableBurns).toEqual({ copper: 2 });
    expect(settleBurns(queued, { iron: 5, copper: 2 }).tradeableBurns).toBeUndefined();
    expect(settleBurns(queued, { iron: 2 }).tradeableBurns).toEqual({ iron: 3, copper: 2 });
  });

  it('stackQty means "all of THIS stack", never the total of both', () => {
    const s = with_(defaultSave(), { iron: 10 }, { iron: 4 });
    expect(stackQty(s, 'iron', undefined, 'all')).toBe(6);
    expect(stackQty(s, 'iron', 'tradeable', 'all')).toBe(4);
    expect(stackQty(s, 'iron', 'tradeable', 99)).toBe(4);
    expect(stackQty(s, 'iron', undefined, 3)).toBe(3);
  });
});

describe('the one-time question and the unreachable server', () => {
  const used = { iron: 3 };
  it('nothing spent: free', () => {
    expect(gateTradeableUse({}, { server: true, reachable: false, acked: false, npc: true })).toBe('free');
  });
  it('the first time it asks; afterwards it does not (a recipe)', () => {
    expect(gateTradeableUse(used, { server: true, reachable: true, acked: false, npc: false })).toBe('confirm');
    expect(gateTradeableUse(used, { server: true, reachable: true, acked: true, npc: false })).toBe('free');
  });
  it('a sale to an NPC merchant always asks', () => {
    expect(gateTradeableUse(used, { server: true, reachable: true, acked: true, npc: true })).toBe('confirm');
  });
  it('the server being unreachable blocks spending tradeable units (normal units are not asked at all)', () => {
    expect(gateTradeableUse(used, { server: true, reachable: false, acked: true, npc: false })).toBe('blocked');
    expect(gateTradeableUse({}, { server: true, reachable: false, acked: true, npc: false })).toBe('free');
  });
  it('without a server there is nothing to record: free', () => {
    expect(gateTradeableUse(used, { server: false, reachable: false, acked: false, npc: true })).toBe('free');
  });
});

describe('the merchants pay the same price for both variants', () => {
  it('merchant: the price of a unit is the material price, tradeable or not, and the units spent are counted', () => {
    const s = with_(defaultSave(), { iron: 10 }, { iron: 4 });
    const price = merchantPrice('material', 'iron');
    const normal = applyMerchantSell(s, 'material', 'iron', 3, NOW);
    expect(normal.gold).toBe(3 * price);
    expect(reconcileTradeable(s, normal.save!).used).toEqual({});
    const trade = applyMerchantSell(s, 'material', 'iron', stackQty(s, 'iron', 'tradeable', 'all'), NOW);
    expect(trade.gold).toBe(4 * price);
    const rec = reconcileTradeable(s, trade.save!, { first: true });
    expect(rec.used.iron).toBe(4);
    expect(tradeableOf(rec.save, 'iron')).toBe(0);
    expect(rec.save.tradeableBurns?.iron).toBe(4);
  });

  it('wholesale: the quote and the payout do not depend on which units are sold', () => {
    const wsave = { ...with_(defaultSave(), { iron: 60 }, { iron: 30 }), dungeonCheckpoints: [75] };
    const plain = { ...wsave, tradeableMaterials: undefined };
    expect(wholesaleQuote(wsave, 'iron', 20, NOW)).toEqual(wholesaleQuote(plain as SaveData, 'iron', 20, NOW));
    const a = applyWholesaleSell(wsave, 'iron', 20, NOW);
    const b = applyWholesaleSell(plain as SaveData, 'iron', 20, NOW);
    expect(a.gold).toBe(b.gold);
  });
});

describe('the Bau never takes tradeable units', () => {
  it('only the normal units of a stack move; storing "everything" leaves the tradeable stack in the bag', () => {
    const s = with_(defaultSave(), { iron: 10 }, { iron: 4 });
    const moved = applyStashMove(s, 'store', 'material', 'iron', 'all');
    expect(moved.moved).toBe(6);
    expect(moved.save.materials.iron).toBe(4);
    expect(tradeableOf(moved.save, 'iron')).toBe(4);
    const all = applyStoreAll(s, 'material');
    expect(all.save.materials.iron).toBe(4);
    expect(tradeableOf(all.save, 'iron')).toBe(4);
    const onlyTrade = with_(defaultSave(), { iron: 4 }, { iron: 4 });
    expect(applyStashMove(onlyTrade, 'store', 'material', 'iron', 'all').moved).toBe(0);
  });

  it('moving normal units to the Bau is not a spend even when the player puts tradeable units first', () => {
    const s = withMaterialPrefs(with_(defaultSave(), { iron: 10 }, { iron: 4 }), { useTradeableFirst: true });
    const moved = applyStashMove(s, 'store', 'material', 'iron', 3);
    const rec = reconcileTradeable(s, moved.save);
    expect(rec.used).toEqual({});
    expect(tradeableOf(rec.save, 'iron')).toBe(4);
  });
});

describe('claims turn units into tradeable ones; delivered units are added', () => {
  it('convertToTradeable marks normal units, never more than exist, and costs at most the slot of the split', () => {
    const s = with_(defaultSave(), { iron: 20 }, {});
    const r = convertToTradeable(s, 'iron', 3);
    expect(r.converted).toBe(3);
    expect(tradeableOf(r.save, 'iron')).toBe(3);
    expect(r.save.materials.iron).toBe(20);
    expect(convertToTradeable(s, 'iron', 99).converted).toBe(20);
    expect(convertToTradeable(s, 'copper_bar', 1).converted).toBe(0); // not an eligible material
  });

  it('a full bag cannot take the extra slot of a split, and the conversion then marks what still fits (or nothing)', () => {
    const base = defaultSave();
    let s = with_(base, { iron: 50 }, {});
    // fill every other slot with a full stack of something else, until the bag is exactly full
    for (const m of MATERIALS) {
      if (bagFreeSlots(s) === 0) break;
      if (m.id !== 'iron') s = { ...s, materials: { ...s.materials, [m.id]: STACK_LIMIT } };
    }
    expect(bagFreeSlots(s)).toBe(0);
    const part = convertToTradeable(s, 'iron', 10);
    expect(part.converted).toBe(0);
    const whole = convertToTradeable(s, 'iron', 50); // the whole stack: still one slot
    expect(whole.converted).toBe(50);
  });

  it('addTradeableUnits adds to both the total and the tradeable stack, as many as the bag takes', () => {
    const s = with_(defaultSave(), { iron: 5 }, { iron: 2 });
    const r = addTradeableUnits(s, 'iron', 10);
    expect(r.added).toBe(10);
    expect(r.save.materials.iron).toBe(15);
    expect(tradeableOf(r.save, 'iron')).toBe(12);
    expect(listTradeable(r.save)).toEqual([{ id: 'iron', qty: 12 }]);
  });

  it('addWithOverflow of normal units leaves the tradeable portion alone', () => {
    const s = with_(defaultSave(), { iron: 5 }, { iron: 2 });
    const r = addWithOverflow(s, { materials: { iron: 7 } });
    expect(r.save.materials.iron).toBe(12);
    expect(tradeableOf(r.save, 'iron')).toBe(2);
  });
});

describe('only the server creates tradeable units (offline and desktop never do)', () => {
  it('no tradeable unit is ever created by game code without a server: a claim queues nothing offline', () => {
    setItemAuthority('local');
    const s = queueMaterialClaim(defaultSave(), { id: 'hunt:1:a:b', activity: 'hunt', place: 'demon_glade', durationMs: 3600_000, units: { leather_scrap: 40 }, at: NOW });
    expect(s.materialClaims).toBeUndefined();
  });

  it('on the web build the claim is queued once, with only eligible materials, and a full queue takes no more', () => {
    setItemAuthority('server');
    const claim = { id: 'hunt:1:a:b', activity: 'hunt' as const, place: 'demon_glade', durationMs: 3600_000, units: { leather_scrap: 40, copper_bar: 9 } as Partial<Record<MaterialId, number>>, at: NOW };
    let s = queueMaterialClaim(defaultSave(), claim);
    expect(s.materialClaims).toHaveLength(1);
    expect(s.materialClaims![0].units).toEqual({ leather_scrap: 40 });
    s = queueMaterialClaim(s, claim);
    expect(s.materialClaims).toHaveLength(1);
    for (let i = 0; i < 30; i++) s = queueMaterialClaim(s, { ...claim, id: `hunt:${i}:z:y` });
    expect(s.materialClaims!.length).toBeLessThanOrEqual(12);
    expect(queueMaterialClaim(defaultSave(), { ...claim, units: { copper_bar: 3 } }).materialClaims).toBeUndefined();
  });

  it('stripTradeable turns everything back into normal units (the units themselves stay in materials)', () => {
    const s = { ...with_(defaultSave(), { iron: 10 }, { iron: 4 }), tradeableBurns: { iron: 1 }, materialClaims: [] };
    const out = stripTradeable(s as SaveData);
    expect(out.tradeableMaterials).toBeUndefined();
    expect(out.tradeableBurns).toBeUndefined();
    expect(out.materials.iron).toBe(10);
    expect(normalOf(out, 'iron')).toBe(10);
  });
});

describe('saves', () => {
  it('an old save (no tradeable fields) loads exactly as before, with none', () => {
    const old = JSON.parse(JSON.stringify(defaultSave())) as Record<string, unknown>;
    const loaded = normalizeSave(old);
    expect(loaded.tradeableMaterials).toBeUndefined();
    expect(loaded.tradeableBurns).toBeUndefined();
    expect(loaded.materialClaims).toBeUndefined();
    expect(loaded.materialPrefs).toBeUndefined();
  });

  it('the tradeable portion survives a save and a load, clamped to the totals and to eligible materials', () => {
    const s = with_(defaultSave(), { iron: 10, copper_bar: 5 }, { iron: 4 });
    const round = normalizeSave(JSON.parse(JSON.stringify(s)));
    expect(round.tradeableMaterials).toEqual({ iron: 4 });
    const bad = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    bad.tradeableMaterials = { iron: 999, copper_bar: 3, nonsense: 5, copper: -2, silver: 'x' };
    bad.tradeableBurns = { iron: 5.7, junk: 3 };
    bad.materialClaims = [{ id: 'x', activity: 'hunt', units: { iron: 1 } }, { id: 'hunt:1:a:b', activity: 'hunt', place: 'demon_glade', durationMs: 5, units: { iron: 2, copper_bar: 1 } }];
    bad.materialPrefs = { useTradeableFirst: 'yes', useAcked: true };
    const loaded = normalizeSave(bad);
    expect(loaded.tradeableMaterials).toEqual({ iron: 10 });
    expect(loaded.tradeableBurns).toEqual({ iron: 5 });
    expect(loaded.materialClaims).toHaveLength(1);
    expect(loaded.materialClaims![0].units).toEqual({ iron: 2 });
    expect(loaded.materialPrefs).toEqual({ useTradeableFirst: false, useAcked: true });
  });

  it('a save whose totals shrank has its tradeable portion clamped (the excess becomes normal units: it never exceeds the total)', () => {
    const s = with_(defaultSave(), { iron: 3 }, { iron: 9 });
    expect(tradeableOf(s, 'iron')).toBe(3);
    expect(clampTradeable(s).tradeableMaterials).toEqual({ iron: 3 });
    expect(clampTradeable(with_(defaultSave(), { iron: 3 }, { iron: 2 })).tradeableMaterials).toEqual({ iron: 2 });
  });

  it('sanitizeMaterialClaims drops malformed reports', () => {
    expect(sanitizeMaterialClaims('nope')).toEqual([]);
    expect(sanitizeMaterialClaims([{ id: 'short', activity: 'hunt', units: { iron: 1 } }])).toEqual([]);
    expect(sanitizeMaterialClaims([{ id: 'hunt:1:a:b', activity: 'fishing', units: { iron: 1 } }])).toEqual([]);
    expect(sanitizeMaterialClaims([{ id: 'hunt:1:a:b', activity: 'hunt', units: {} }])).toEqual([]);
  });
});

describe('the material catalog is untouched', () => {
  it('every tradeable material is a real material', () => {
    const ids = new Set(MATERIALS.map((m) => m.id));
    for (const id of TRADEABLE_MATERIALS) expect(ids.has(id)).toBe(true);
  });
});
