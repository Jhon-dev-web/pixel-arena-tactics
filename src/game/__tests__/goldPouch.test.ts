import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSave, normalizeSave, SaveData } from '../engine';
import { CONSUMABLES, TRADEABLE_CONSUMABLES, getConsumable } from '../consumables';
import { MATERIALS } from '../materials';
import { GEAR } from '../gear';
import { createGearInstance, isTradeable } from '../gearInstances';
import { RARITIES, Rarity } from '../rarity';
import { merchantBuys, merchantPrice } from '../merchant';
import { applyStashMove } from '../stash';
import { applyDiscard } from '../bagActions';
import { inventorySlotsUsed, inventoryCapacity, STACK_LIMIT } from '../inventory';
import { buildSaveExport, parseSaveImport } from '../saveTransfer';
import { trackSave } from '../statsTracking';
import { usesOf } from '../itemUses';
import { statsOf } from '../stats';
import { mulberry32 } from '../../../scripts/sim/driver';
import {
  POUCH_IDS,
  applyCreatePouch,
  applyOpenPouch,
  canCreatePouches,
  isPouchId,
  patrimony,
  pouchCost,
  pouchFace,
  pouchFee,
  pouchGoldHeld,
  pouchMinimum,
  pouchPerDay,
  pouchRuleParams,
  pouchesLeftToday,
  sanitizePouchDay,
} from '../goldPouch';
import en from '../../locales/en.json';
import pt from '../../locales/pt.json';
import T from '../tunables';

const NOW = new Date(2026, 9, 12, 12, 0, 0).getTime();
const DAY = 24 * 3600 * 1000;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const rich = (gold: number, pass = true): SaveData => ({ ...defaultSave(), gold, hasBattlePass: pass });
const wire = (s: unknown) => JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
const must = (r: { ok: boolean; save?: SaveData }): SaveData => {
  expect(r.ok).toBe(true);
  return r.save!;
};

describe('Gold Pouch: the numbers', () => {
  it('three denominations from the tunables, the smallest is the minimum, the fee is a rounded-up share on top', () => {
    expect(POUCH_IDS.map(pouchFace)).toEqual([10000, 50000, 100000]);
    expect(pouchMinimum()).toBe(10000);
    expect(T.goldPouch.feePct).toBe(0.05);
    expect(pouchPerDay()).toBe(3);
    for (const id of POUCH_IDS) {
      expect(pouchFee(id)).toBe(Math.ceil(pouchFace(id) * 0.05));
      expect(pouchCost(id)).toBe(pouchFace(id) + pouchFee(id));
      expect(pouchFee(id)).toBeGreaterThan(0);
    }
  });

  it('the pouches are consumables that the merchants never buy, with a use, a name and a description in both languages', () => {
    for (const id of POUCH_IDS) {
      const def = getConsumable(id)!;
      expect(def.sellValue).toBe(0);
      expect(def.purchasable).toBe(false);
      expect(merchantBuys('consumable', id)).toBe(false);
      expect(merchantPrice('consumable', id)).toBe(0);
      expect(usesOf('consumable', id).length).toBeGreaterThan(0);
      for (const tree of [pt, en]) {
        const c = (tree as unknown as { consumables: Record<string, string> }).consumables;
        expect(typeof c[def.nameKey]).toBe('string');
        expect(typeof c[def.descKey]).toBe('string');
      }
    }
  });
});

describe('Gold Pouch: creating', () => {
  it('only the Pass owner creates; everyone sees why', () => {
    const free = rich(1_000_000, false);
    expect(canCreatePouches(free)).toBe(false);
    const r = applyCreatePouch(free, 'gold_pouch_s', NOW);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('noPass');
    expect(canCreatePouches(rich(0))).toBe(true);
  });

  it('cannot be created without the face value PLUS the fee, and a failure changes nothing', () => {
    for (const id of POUCH_IDS) {
      const short = rich(pouchCost(id) - 1);
      const before = JSON.stringify(short);
      const r = applyCreatePouch(short, id, NOW);
      expect(r.ok, id).toBe(false);
      expect(r.reason).toBe('gold');
      expect(JSON.stringify(short)).toBe(before);
      expect(applyCreatePouch(rich(pouchFace(id)), id, NOW).reason, 'the face value alone is not enough').toBe('gold');
      expect(applyCreatePouch(rich(pouchCost(id)), id, NOW).ok, 'exactly the total is enough').toBe(true);
    }
  });

  it('pays face + fee, gives one pouch, counts it toward the daily limit, and refuses the fourth', () => {
    let s = rich(10_000_000);
    for (let i = 0; i < pouchPerDay(); i++) {
      const before = s;
      s = must(applyCreatePouch(s, 'gold_pouch_s', NOW));
      expect(before.gold - s.gold).toBe(pouchCost('gold_pouch_s'));
    }
    expect(s.consumables.gold_pouch_s).toBe(pouchPerDay());
    expect(pouchesLeftToday(s, NOW)).toBe(0);
    const r = applyCreatePouch(s, 'gold_pouch_l', NOW);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('limit');
  });

  it('the limit is for every denomination together and resets on the same local-day boundary as the other dailies', () => {
    let s = rich(10_000_000);
    s = must(applyCreatePouch(s, 'gold_pouch_s', NOW));
    s = must(applyCreatePouch(s, 'gold_pouch_m', NOW));
    s = must(applyCreatePouch(s, 'gold_pouch_l', NOW));
    expect(applyCreatePouch(s, 'gold_pouch_s', NOW).reason).toBe('limit');
    expect(applyCreatePouch(s, 'gold_pouch_s', NOW + 60_000).reason).toBe('limit');
    // the next local day: the same string key the merchant uses
    expect(s.pouchDay.day).toBe(new Date(NOW).toDateString());
    expect(s.pouchDay.day).toBe(s.merchant.day === '' ? new Date(NOW).toDateString() : s.merchant.day);
    expect(pouchesLeftToday(s, NOW + DAY)).toBe(pouchPerDay());
    expect(applyCreatePouch(s, 'gold_pouch_s', NOW + DAY).ok).toBe(true);
    // a save from yesterday loads with a fresh count; today's count survives a reload
    expect(normalizeSave(wire(s)).pouchDay.made).toBe(3);
    expect(sanitizePouchDay(wire(s).pouchDay, NOW + DAY).made).toBe(0);
    expect(sanitizePouchDay({ day: new Date(NOW).toDateString(), made: 'x' }, NOW).made).toBe(0);
  });

  it('a pouch takes bag room like any stackable: 99 per slot, and nothing is made (nor Gold taken) when the bag is full', () => {
    const base = rich(10_000_000);
    const used = inventorySlotsUsed(base);
    const one = must(applyCreatePouch(base, 'gold_pouch_s', NOW));
    expect(inventorySlotsUsed(one)).toBe(used + 1);
    const two = must(applyCreatePouch(one, 'gold_pouch_s', NOW));
    expect(inventorySlotsUsed(two)).toBe(used + 1); // the same slot
    // a bag with no free slot and no partial pouch stack
    const filler = Object.fromEntries(MATERIALS.slice(0, inventoryCapacity(base)).map((m) => [m.id, 1]));
    const full: SaveData = { ...base, materials: { ...base.materials, ...filler } };
    expect(inventorySlotsUsed(full)).toBeGreaterThanOrEqual(inventoryCapacity(full));
    const r = applyCreatePouch(full, 'gold_pouch_s', NOW);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('bag');
    expect(r.save).toBeUndefined();
    expect(full.gold).toBe(10_000_000);
    expect(STACK_LIMIT).toBe(99);
  });
});

describe('Gold Pouch: opening', () => {
  it('anyone opens one for exactly its face value, one at a time, and it is gone', () => {
    for (const id of POUCH_IDS) {
      const s: SaveData = { ...rich(500, false), consumables: { ...defaultSave().consumables, [id]: 2 } };
      const o = must(applyOpenPouch(s, id));
      expect(o.gold).toBe(500 + pouchFace(id));
      expect(o.consumables[id]).toBe(1);
      const o2 = must(applyOpenPouch(o, id));
      expect(o2.consumables[id]).toBe(0);
      expect(applyOpenPouch(o2, id).ok).toBe(false);
    }
  });

  it('create then open is ALWAYS a net loss of exactly the fee, for every denomination and any starting Gold', () => {
    for (const id of POUCH_IDS) {
      for (const start of [pouchCost(id), pouchCost(id) + 1, 7_777_777]) {
        const s0 = rich(start);
        const s2 = must(applyOpenPouch(must(applyCreatePouch(s0, id, NOW)), id));
        expect(s0.gold - s2.gold, `${id} from ${start}`).toBe(pouchFee(id));
        expect(s2.consumables[id]).toBe(0);
      }
    }
  });

  it('opening is not "earned": the lifetime Gold counter (and so the Gold achievements) cannot be farmed by create and open', () => {
    let prev = rich(5_000_000);
    prev = { ...prev, stats: { ...statsOf(prev), goldEarned: 1000 } };
    const made = trackSave(prev, must(applyCreatePouch(prev, 'gold_pouch_l', NOW)));
    expect(statsOf(made).goldEarned).toBe(1000);
    const opened = trackSave(made, must(applyOpenPouch(made, 'gold_pouch_l')));
    expect(statsOf(opened).goldEarned).toBe(1000);
    expect(statsOf(opened).pouchGoldOpened).toBe(pouchFace('gold_pouch_l'));
    // while Gold earned any other way still counts
    const earned = trackSave(opened, { ...opened, gold: opened.gold + 123 });
    expect(statsOf(earned).goldEarned).toBe(1123);
  });
});

describe('Gold Pouch: no path makes Gold out of nothing', () => {
  it('a long random walk of create / open / stash / take / discard never raises (Gold + Gold in pouches) except by what is spent as fee... and never lets it grow at all', () => {
    const rnd = mulberry32(1812);
    let s = rich(2_000_000);
    const start = patrimony(s);
    let feesPaid = 0;
    let discarded = 0;
    for (let i = 0; i < 400; i++) {
      const id = POUCH_IDS[Math.floor(rnd() * POUCH_IDS.length)];
      const when = NOW + Math.floor(rnd() * 6) * DAY;
      const roll = rnd();
      if (roll < 0.35) {
        const r = applyCreatePouch(s, id, when);
        if (r.ok) {
          s = r.save!;
          feesPaid += pouchFee(id);
        }
      } else if (roll < 0.6) {
        const r = applyOpenPouch(s, id);
        if (r.ok) s = r.save!;
      } else if (roll < 0.75) {
        s = applyStashMove(s, 'store', 'consumable', id, 1 + Math.floor(rnd() * 3)).save;
      } else if (roll < 0.9) {
        s = applyStashMove(s, 'take', 'consumable', id, 1 + Math.floor(rnd() * 3)).save;
      } else {
        const before = pouchGoldHeld(s);
        const next = applyDiscard(s, 'consumable', id, 1);
        if (next) {
          s = next;
          discarded += before - pouchGoldHeld(s);
        }
      }
      expect(patrimony(s) + feesPaid + discarded, `step ${i}`).toBe(start);
      expect(s.gold).toBeGreaterThanOrEqual(0);
    }
  });

  it('the merchants and the wholesaler have no entry for a pouch; the only way to turn it back into Gold is to open it', () => {
    for (const c of CONSUMABLES.filter((x) => isPouchId(x.id))) expect(c.sellValue).toBe(0);
    expect(MATERIALS.some((m) => isPouchId(m.id))).toBe(false);
  });
});

describe('Gold Pouch: the tradeable rule, in ONE place', () => {
  const forged = { id: 'iron_helm' };
  const unique = GEAR.find((g) => g.unique)!;
  const mk = (templateId: string, rarity: Rarity, bound: boolean) => ({ ...createGearInstance(templateId, { id: 'x', origin: 'craft', rarity, substats: [] }), ...(bound ? { bound: true } : {}) });

  it('truth table: gear instance by rarity x unique x bound, material, consumable, pouch', () => {
    const rows: [string, boolean, boolean][] = [];
    for (const r of RARITIES) {
      const high = r.id === 'epic' || r.id === 'legendary';
      for (const bound of [false, true]) {
        rows.push([`forged ${r.id} bound=${bound}`, isTradeable(mk(forged.id, r.id, bound)), !bound && high]);
        rows.push([`unique ${r.id} bound=${bound}`, isTradeable(mk(unique.id, r.id, bound)), !bound]);
      }
    }
    for (const m of MATERIALS) rows.push([`material ${m.id}`, isTradeable({ kind: 'material', id: m.id }), false]);
    for (const c of CONSUMABLES) rows.push([`consumable ${c.id}`, isTradeable({ kind: 'consumable', id: c.id }), isPouchId(c.id)]);
    // a material id asked as a consumable (and the other way round) is never tradeable
    rows.push(['material id as consumable', isTradeable({ kind: 'consumable', id: 'iron' }), false]);
    rows.push(['pouch id as material', isTradeable({ kind: 'material', id: 'gold_pouch_s' }), false]);
    for (const [name, got, want] of rows) expect(got, name).toBe(want);
    expect(TRADEABLE_CONSUMABLES.length).toBe(POUCH_IDS.length);
    for (const id of POUCH_IDS) expect(isTradeable({ kind: 'consumable', id })).toBe(true);
  });
});

describe('Gold Pouch: save, export, import and the Gold in pouches', () => {
  it('an old save (no pouches, no daily count) loads empty; pouches and the count survive a reload', () => {
    const old = wire(defaultSave());
    delete old.pouchDay;
    const consumables = old.consumables as Record<string, number>;
    for (const id of POUCH_IDS) delete consumables[id];
    const loaded = normalizeSave(old);
    expect(loaded.pouchDay).toEqual({ day: '', made: 0 });
    for (const id of POUCH_IDS) expect(loaded.consumables[id]).toBe(0);
    const s = must(applyCreatePouch(rich(1_000_000), 'gold_pouch_m', NOW));
    const back = normalizeSave(wire(s));
    expect(back.consumables.gold_pouch_m).toBe(1);
    expect(back.pouchDay.made).toBe(1);
  });

  it('export then import keeps the pouches (a copy of the whole hero: out of scope for the no-duplication rule, said in the docs)', () => {
    const s = must(applyCreatePouch(rich(1_000_000), 'gold_pouch_l', NOW));
    const { text } = buildSaveExport(s, NOW);
    const imported = parseSaveImport(text, s);
    expect(imported.ok).toBe(true);
    if (imported.ok) {
      expect(imported.save.consumables.gold_pouch_l).toBe(1);
      expect(imported.save.gold).toBe(s.gold);
    }
  });

  it('patrimony counts the Gold in pouches in the bag and in the Stash, but only the plain Gold is spendable', () => {
    let s = must(applyCreatePouch(rich(1_000_000), 'gold_pouch_m', NOW));
    s = must(applyCreatePouch(s, 'gold_pouch_s', NOW));
    const inBag = pouchFace('gold_pouch_m') + pouchFace('gold_pouch_s');
    expect(pouchGoldHeld(s)).toBe(inBag);
    expect(patrimony(s)).toBe(s.gold + inBag);
    const stored = applyStashMove(s, 'store', 'consumable', 'gold_pouch_m', 1).save;
    expect(stored.consumables.gold_pouch_m).toBe(0);
    expect(pouchGoldHeld(stored)).toBe(inBag);
    expect(patrimony(stored)).toBe(patrimony(s));
    expect(stored.gold).toBe(s.gold);
  });
});

describe('Gold Pouch: the text states the rules from the same tunables', () => {
  const render = (tree: unknown, key: string, params: Record<string, number | string>): string => {
    const raw = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], tree) as string;
    return raw.replace(/\{(\w+)\}/g, (whole, k) => String(params[k] ?? whole));
  };
  const digits = (s: string): number[] => (s.replace(/(\d)[ ., ](?=\d{3}\b)/g, '$1').match(/\d+/g) ?? []).map(Number);

  it('pt and en say the minimum, the fee and the daily limit that the code enforces, and no placeholder is left over', () => {
    const p = pouchRuleParams();
    expect(p).toEqual({ min: pouchMinimum(), fee: 5, n: pouchPerDay() });
    for (const tree of [pt, en]) {
      const text = render(tree, 'pouch.explain', { ...p, min: String(p.min) });
      expect(text).not.toMatch(/\{\w+\}/);
      expect(digits(text)).toEqual([p.min, p.fee, p.n]);
    }
  });

  it('changing the tunables changes the numbers the rules print and the rules the code applies', () => {
    const was = { ...T.goldPouch };
    try {
      T.goldPouch.denomSmall = 20000;
      T.goldPouch.feePct = 0.1;
      T.goldPouch.perDay = 5;
      const p = pouchRuleParams();
      expect(p).toEqual({ min: 20000, fee: 10, n: 5 });
      expect(pouchCost('gold_pouch_s')).toBe(22000);
      expect(applyCreatePouch(rich(21999), 'gold_pouch_s', NOW).ok).toBe(false);
      expect(applyCreatePouch(rich(22000), 'gold_pouch_s', NOW).ok).toBe(true);
      expect(digits(render(en, 'pouch.explain', { ...p, min: String(p.min) }))).toEqual([20000, 10, 5]);
    } finally {
      Object.assign(T.goldPouch, was);
    }
  });
});
