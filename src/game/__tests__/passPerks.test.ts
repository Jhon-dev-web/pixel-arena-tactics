import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeMiningStatus, defaultSave, effectiveRepairCost, normalizeSave, SaveData, snapshotGatherPass } from '../engine';
import { deliveryGold, deliveryXp, offerCount, rerollCap } from '../deliveries';
import { grantDailyPassKit } from '../entitlements';
import { repairCost } from '../gear';
import { inventoryCapacity } from '../inventory';
import { passPerkLines } from '../passPerks';
import { skillXpToReachLevel } from '../skills';
import { stashCapacity } from '../stash';
import { buildHuntSession } from '../engine';
import T from '../tunables';
import en from '../../locales/en.json';
import pt from '../../locales/pt.json';

// The Adventurer Pass screen lists its perks from passPerkLines(); each line is checked here against what the ENGINE really does for an owner, in both languages.
const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();
const HOUR = 3600 * 1000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const render = (tree: unknown, line: { key: string; params?: Record<string, number> }): string => {
  const raw = line.key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], tree) as string;
  return raw.replace(/\{(\w+)\}/g, (whole, k) => String(line.params?.[k] ?? whole));
};
const owner = (s: SaveData = defaultSave()): SaveData => ({ ...s, hasBattlePass: true });
const perk = (key: string) => passPerkLines().find((p) => p.key === key)!;
const numbersIn = (s: string): number[] => (s.match(/\d+/g) ?? []).map(Number);

describe('Adventurer Pass perks: the text says what the code does', () => {
  it('every line has pt and en text with no placeholder left over', () => {
    for (const p of passPerkLines()) {
      for (const tree of [pt, en]) {
        for (const part of [p.label, p.sub]) {
          const text = render(tree, part);
          expect(text, `${p.key} ${part.key}`).toBeTruthy();
          expect(text, `${p.key} ${part.key}`).not.toMatch(/\{\w+\}/);
        }
      }
    }
  });

  it('storage: an owner session keeps the hours the line says, a free one the base cap', () => {
    const base = { ...defaultSave(), activeOreId: 'copper', lastMiningClaim: NOW - 48 * HOUR };
    const free = computeMiningStatus({ ...base, miningPass: snapshotGatherPass(base, base.miningCapHours) }, NOW);
    const own = owner(base);
    const paid = computeMiningStatus({ ...own, miningPass: snapshotGatherPass(own, own.miningCapHours) }, NOW);
    expect(free.capMs / HOUR).toBe(T.mining.capHours);
    expect(paid.capMs / HOUR).toBe(numbersIn(render(en, perk('storage').label))[0]);
    expect(paid.capMs / HOUR).toBe(numbersIn(render(pt, perk('storage').label))[0]);
  });

  it('gold: Orders and Hunting pay the percentage in the line', () => {
    const n = numbersIn(render(en, perk('gold').label))[0];
    expect(deliveryGold({ gold: 1000 }, true) / 1000).toBeCloseTo(1 + n / 100, 5);
    expect(deliveryGold({ gold: 1000 }, false)).toBe(1000);
    expect(buildHuntSession({ ...owner(), activeHuntingZone: 'demon_glade' }, NOW).passGold).toBeCloseTo(n, 5);
    expect(buildHuntSession(defaultSave(), NOW).passGold).toBeUndefined();
  });

  it('materials: Mining yields the percentage in the line over a free session', () => {
    const n = numbersIn(render(pt, perk('luck').label))[0];
    const rich = { ...defaultSave(), skillXp: { ...defaultSave().skillXp, mining: skillXpToReachLevel(60, 'mining') }, activeOreId: 'iron', lastMiningClaim: NOW - 4 * HOUR };
    const free = computeMiningStatus({ ...rich, miningPass: snapshotGatherPass(rich, 4) }, NOW).oreReady;
    const own = owner(rich);
    const paid = computeMiningStatus({ ...own, miningPass: snapshotGatherPass(own, 4) }, NOW).oreReady;
    expect(paid / free).toBeCloseTo(1 + n / 100, 1);
  });

  it('orders: the extra offers, rerolls and XP are the ones in the lines', () => {
    const label = perk('orders').label.params!;
    expect(offerCount(true) - offerCount(false)).toBe(label.o);
    expect(rerollCap(true) - rerollCap(false)).toBe(label.r);
    expect(deliveryXp({ xp: 1000 }, true) / 1000).toBeCloseTo(1 + numbersIn(render(en, perk('orders').sub))[0] / 100, 5);
    for (const tree of [pt, en]) expect(numbersIn(render(tree, perk('orders').label))).toEqual([label.o, label.r]);
  });

  it('bag, stash and repair: the owner really gets the numbers the lines print', () => {
    const free = defaultSave();
    const paid = owner();
    const share = numbersIn(render(en, perk('bag').label))[0] / 100;
    const min = numbersIn(render(en, perk('bag').sub))[0];
    expect(inventoryCapacity(paid) - inventoryCapacity(free)).toBe(Math.max(min, Math.ceil(inventoryCapacity(free) * share)));
    expect(stashCapacity(paid) - stashCapacity(free)).toBe(numbersIn(render(en, perk('stash').label))[0]);
    const off = numbersIn(render(pt, perk('repair').label))[0];
    for (const tier of [1, 3, 6]) expect(effectiveRepairCost(paid, tier) / repairCost(tier)).toBeCloseTo(1 - off / 100, 1);
    expect(effectiveRepairCost(free, 3)).toBe(repairCost(3));
  });

  it('daily kit: an owner gets the printed number on a new day, once, never past the stock cap; a free player never', () => {
    const n = perk('kit').label.params!.n;
    for (const tree of [pt, en]) {
      expect(numbersIn(render(tree, perk('kit').label))).toEqual([n]);
      expect(numbersIn(render(tree, perk('kit').sub))).toEqual([T.consumables.repairKitDurability]);
    }
    const day1 = grantDailyPassKit(owner(), 'Sat Jun 20 2026');
    expect(day1.consumables.repair_kit).toBe(n);
    expect(grantDailyPassKit(day1, 'Sat Jun 20 2026')).toBe(day1); // same day: nothing
    expect(grantDailyPassKit(day1, 'Sun Jun 21 2026').consumables.repair_kit).toBe(2 * n);
    const full = { ...day1, consumables: { ...day1.consumables, repair_kit: T.battlePass.dailyRepairKitStock } };
    expect(grantDailyPassKit(full, 'Sun Jun 21 2026').consumables.repair_kit).toBe(T.battlePass.dailyRepairKitStock);
    expect(grantDailyPassKit(defaultSave(), 'Sat Jun 20 2026').consumables.repair_kit).toBe(0);
  });

  it('daily kit through the loader: owners get it when the save loads on a new day, a reload the same day gives nothing more', () => {
    const first = normalizeSave(JSON.parse(JSON.stringify(owner())));
    expect(first.consumables.repair_kit).toBe(T.battlePass.dailyRepairKits);
    const again = normalizeSave(JSON.parse(JSON.stringify(first)));
    expect(again.consumables.repair_kit).toBe(T.battlePass.dailyRepairKits);
    expect(normalizeSave(JSON.parse(JSON.stringify(defaultSave()))).consumables.repair_kit).toBe(0);
  });
});
