import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSave, normalizeSave, SaveData } from '../engine';
import { merchantPrice } from '../merchant';
import { MATERIALS, MaterialId } from '../materials';
import { baseGoldValue } from '../economy';
import {
  applyWholesaleBatch,
  applyWholesaleSell,
  isRareMaterial,
  materialRarity,
  sanitizeWholesale,
  wholesaleMultiplier,
  wholesalePlan,
  wholesaleQuote,
  wholesaleUnitPrice,
  wholesaleUnlocked,
  wholesaleWeight,
} from '../wholesale';
import { QUESTS_ACHIEVEMENTS, questProgress } from '../quests';
import { questContext } from '../questContext';
import { statsOf } from '../stats';
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

const open = (mats: Partial<Record<MaterialId, number>> = {}, floor = 50): SaveData => {
  const s = defaultSave();
  return { ...s, dungeonCheckpoints: [25, 50].filter((f) => f <= floor), materials: { ...s.materials, ...mats } };
};
const wire = (s: unknown) => JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
const priciest = MATERIALS.map((m) => m.id).sort((a, b) => merchantPrice('material', b) - merchantPrice('material', a))[0];

describe('wholesale: unlock', () => {
  it('is closed until the boss of floor 50 is down, and refuses to sell while closed', () => {
    expect(T.wholesale.unlockFloor).toBe(50);
    expect(wholesaleUnlocked(open({}, 25))).toBe(false);
    expect(wholesaleUnlocked(open({}, 50))).toBe(true);
    const s = open({ bone_fragment: 500 }, 25);
    const r = applyWholesaleSell(s, 'bone_fragment', 100, NOW);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('locked');
  });
});

describe('wholesale: the price and its soft cap', () => {
  it('the top price is the tunable share of the normal merchant price, for every material', () => {
    for (const m of MATERIALS) expect(wholesaleUnitPrice(m.id), m.id).toBeCloseTo(merchantPrice('material', m.id) * T.wholesale.priceRate, 9);
    expect(T.wholesale.priceRate).toBe(0.25);
  });

  it('the multiplier is 1 for the free units, then falls by blockDrop per block, and never below floorRate / priceRate', () => {
    const { freeUnits: N, blockUnits: B, blockDrop: X, floorRate, priceRate } = T.wholesale;
    expect(wholesaleMultiplier(0)).toBe(1);
    expect(wholesaleMultiplier(N - 1)).toBe(1);
    expect(wholesaleMultiplier(N)).toBeCloseTo(1 - X, 9);
    expect(wholesaleMultiplier(N + B)).toBeCloseTo(1 - 2 * X, 9);
    expect(wholesaleMultiplier(N + 100 * B)).toBeCloseTo(floorRate / priceRate, 9);
    let prev = 1;
    for (let k = 0; k < N + 12 * B; k += 7) {
      const m = wholesaleMultiplier(k);
      expect(m).toBeLessThanOrEqual(prev + 1e-12);
      expect(m).toBeGreaterThanOrEqual(floorRate / priceRate - 1e-12);
      prev = m;
    }
  });

  it('wholesaleWeight is the exact sum of the per-unit multipliers, from any starting point', () => {
    for (const [from, units] of [[0, 1], [0, 100], [0, 777], [60, 300], [140, 25], [333, 4000], [900, 10]] as const) {
      let sum = 0;
      for (let k = from; k < from + units; k++) sum += wholesaleMultiplier(k);
      expect(wholesaleWeight(from, units), `${from}+${units}`).toBeCloseTo(sum, 6);
    }
  });

  it('selling 100 / 500 / 2000 of one late material pays less and less per unit, and never more than the normal merchant would', () => {
    const id = 'abyssal_marrow' as MaterialId;
    const normal = merchantPrice('material', id);
    const pay = (n: number) => wholesaleQuote(open({ [id]: n }), id, n, NOW).gold;
    const [a, b, c] = [pay(100), pay(500), pay(2000)];
    expect(a).toBe(Math.floor(wholesaleUnitPrice(id) * 100));
    expect(b / 500).toBeLessThan(a / 100);
    expect(c / 2000).toBeLessThan(b / 500);
    expect(c / 2000).toBeGreaterThanOrEqual(normal * T.wholesale.floorRate - 1e-9);
    expect(c).toBeLessThan(normal * 2000 * T.wholesale.priceRate);
  });

  it('the cap is per material and per local day: a second sale the same day starts where the first stopped, another material and the next day start at the top', () => {
    let s = open({ bone_fragment: 1000, leather_scrap: 1000 });
    const first = applyWholesaleSell(s, 'bone_fragment', 150, NOW);
    s = first.save!;
    expect(s.wholesale.sold.bone_fragment).toBe(150);
    const again = wholesaleQuote(s, 'bone_fragment', 10, NOW);
    expect(again.nextUnitPrice).toBeLessThan(wholesaleUnitPrice('bone_fragment'));
    expect(wholesaleQuote(s, 'leather_scrap', 10, NOW).nextUnitPrice).toBeCloseTo(wholesaleUnitPrice('leather_scrap'), 9);
    expect(wholesaleQuote(s, 'bone_fragment', 10, NOW + DAY).nextUnitPrice).toBeCloseTo(wholesaleUnitPrice('bone_fragment'), 9);
    // the same selling in two halves pays what one sale of all of it pays (the curve belongs to the day, not to the click)
    const whole = applyWholesaleSell(open({ bone_fragment: 1000 }), 'bone_fragment', 300, NOW).gold!;
    const half = applyWholesaleSell(open({ bone_fragment: 1000 }), 'bone_fragment', 150, NOW);
    const rest = applyWholesaleSell(half.save!, 'bone_fragment', 150, NOW).gold!;
    expect(Math.abs(whole - (half.gold! + rest))).toBeLessThanOrEqual(1);
  });

  it('there is no Gold cap per day, only the price curve', () => {
    const s = open({ [priciest]: 50000 });
    const r = applyWholesaleSell(s, priciest, 'all', NOW);
    expect(r.ok).toBe(true);
    expect(r.units).toBe(50000);
    expect(r.gold!).toBeGreaterThan(0);
  });
});

describe('wholesale: selling is exact and manual', () => {
  it('moves the units out and the Gold in, counts the statistics, and never touches the stash', () => {
    const base = open({ iron: 300 });
    const s = { ...base, stash: { ...base.stash, materials: { iron: 40 } } };
    const r = applyWholesaleSell(s, 'iron', 120, NOW);
    expect(r.ok).toBe(true);
    expect(r.save!.materials.iron).toBe(180);
    expect(r.save!.stash.materials.iron).toBe(40);
    expect(r.save!.gold).toBe(s.gold + r.gold!);
    const st = statsOf(r.save!);
    expect(st.wholesaleUnits).toBe(120);
    expect(st.wholesaleGold).toBe(r.gold);
  });

  it('refuses what it cannot pay for: nothing owned, and a sale worth less than 1 Gold (nothing is destroyed)', () => {
    expect(applyWholesaleSell(open({}), 'iron', 10, NOW).reason).toBe('none');
    const three = open({ leather_scrap: 3 });
    const tiny = applyWholesaleSell(three, 'leather_scrap', 3, NOW);
    expect(wholesaleQuote(three, 'leather_scrap', 3, NOW).gold).toBe(0);
    expect(tiny.ok).toBe(false);
    expect(tiny.reason).toBe('worthless');
    expect(three.materials.leather_scrap).toBe(3);
  });

  it('a ticked list is priced and sold line by line with the shared daily counter: the plan shown is the sale made', () => {
    const s = open({ bone_fragment: 400, concentrated_blood: 400, blood_heart: 20 });
    const lines = [{ id: 'bone_fragment' as MaterialId, qty: 'all' as const }, { id: 'blood_heart' as MaterialId, qty: 5 }, { id: 'bone_fragment' as MaterialId, qty: 10 }];
    const plan = wholesalePlan(s, lines, NOW);
    const done = applyWholesaleBatch(s, lines, NOW);
    expect(done.gold).toBe(plan.gold);
    expect(done.units).toBe(plan.units);
    expect(done.save.gold).toBe(s.gold + plan.gold);
    expect(plan.hasRare).toBe(true);
    // the second bone line found none left (the first sold the whole stack) and is simply absent
    expect(plan.lines.map((l) => l.id)).toEqual(['bone_fragment', 'blood_heart']);
  });

  it('planning sells nothing: the save is untouched', () => {
    const s = open({ bone_fragment: 400 });
    const before = JSON.stringify(s);
    wholesalePlan(s, [{ id: 'bone_fragment', qty: 'all' }], NOW);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('nothing in the game modules sells by itself: only wholesale.ts defines the sale, and the UI handler is the one caller', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const hits: string[] = [];
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name);
        if (f.isDirectory()) {
          if (f.name !== '__tests__') walk(p);
        } else if (/\.(ts|tsx)$/.test(f.name) && /applyWholesale(Sell|Batch)\(/.test(fs.readFileSync(p, 'utf8'))) hits.push(path.relative(process.cwd(), p).replace(/\\/g, '/'));
      }
    };
    walk(path.join(process.cwd(), 'src'));
    // wholesale.ts defines them (and plans through them); App.tsx is the button handler. Nothing else, in particular no tick, claim, load or timer path.
    expect(hits.sort()).toEqual(['src/App.tsx', 'src/game/wholesale.ts']);
  });
});

describe('wholesale: rare materials', () => {
  it('rarity follows the drop (hunting), the tier (ore / wood) and the reference value (everything else)', () => {
    expect(materialRarity('leather_scrap')).toBe('common');
    expect(materialRarity('concentrated_blood')).toBe('uncommon');
    expect(materialRarity('blood_heart')).toBe('rare');
    expect(materialRarity('copper')).toBe('common');
    expect(isRareMaterial('blood_heart')).toBe(true);
    expect(isRareMaterial('bone_fragment')).toBe(false);
    for (const m of MATERIALS) expect(['common', 'uncommon', 'rare']).toContain(materialRarity(m.id));
    expect(baseGoldValue('blood_heart')).toBeGreaterThan(baseGoldValue('bone_fragment'));
  });
});

describe('wholesale: save, statistics, achievements, text', () => {
  it('an old save loads with an empty counter, a saved one keeps only today, and garbage is ignored', () => {
    const old = wire(defaultSave());
    delete old.wholesale;
    expect(normalizeSave(old).wholesale).toEqual({ day: '', sold: {} });
    const s = applyWholesaleSell(open({ iron: 200 }), 'iron', 150, NOW).save!;
    expect(normalizeSave(wire(s)).wholesale.sold.iron).toBe(150);
    expect(sanitizeWholesale(wire(s).wholesale, NOW + DAY).sold).toEqual({});
    expect(sanitizeWholesale({ day: new Date(NOW).toDateString(), sold: { iron: 'x', nope: 5, copper: -3, steel: 7 } }, NOW).sold).toEqual({ steel: 7 });
    expect(sanitizeWholesale(42, NOW)).toEqual({ day: '', sold: {} });
  });

  it('the two achievements read the statistics, so the 21-day simulator (which does not pass them) never sees them', () => {
    const a = QUESTS_ACHIEVEMENTS.filter((q) => q.metric === 'wholesale_units' || q.metric === 'wholesale_gold');
    expect(a.length).toBe(2);
    const s = applyWholesaleSell(open({ iron: 2000 }), 'iron', 'all', NOW).save!;
    const ctx = questContext(s);
    expect(questProgress(a.find((q) => q.metric === 'wholesale_units')!, s.quests, ctx)).toBe(2000);
    expect(questProgress(a.find((q) => q.metric === 'wholesale_gold')!, s.quests, ctx)).toBe(statsOf(s).wholesaleGold);
    expect(questProgress(a[0], s.quests, { cp: 0, maxRefine: 0 })).toBe(0);
  });

  it('the rare-material warning says what the owner asked for, in both languages', () => {
    for (const tree of [pt, en] as const) {
      const w = (tree as unknown as { wholesale: Record<string, string> }).wholesale;
      for (const k of ['explain', 'curve', 'locked', 'rareWarn', 'confirmTotal', 'fullHint']) expect(typeof w[k], k).toBe('string');
    }
    expect((pt as unknown as { wholesale: { rareWarn: string } }).wholesale.rareWarn).toContain('Outros jogadores pagariam mais por isto no mercado');
    expect((en as unknown as { wholesale: { rareWarn: string } }).wholesale.rareWarn).toContain('Other players would pay more for this');
  });
});
