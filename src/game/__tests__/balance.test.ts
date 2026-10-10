import { describe, expect, it } from 'vitest';
import { computeCP, defaultSave, effectivePouchSlots, normalizeSave, SaveData } from '../engine';
import { applyHuntStart, applyHuntStop } from '../huntLifecycle';
import { HUNT_POUCH_TIERS, allocateToPouch } from '../huntPouch';
import { HUNTING_ZONES } from '../huntingZones';
import { dungeonEnemyKindForFloor, MAX_DUNGEON_FLOOR, recommendedCpForFloor } from '../dungeon';
import { RECOMMENDED_CP_BY_FLOOR } from '../recommendedCp';
import { getEnemyDef } from '../enemies';
import { isDungeonBoss, stageEnemyDmg, stageEnemyHp } from '../waves';
import T from '../tunables';
import { isSpikeFloor, ladder, recommendedTable } from '../../../scripts/sim/ladder';

const HOUR = 3600 * 1000;
const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();
const wire = (s: unknown) => JSON.parse(JSON.stringify(s)) as Record<string, unknown>;

describe('balance decisions (docs/BALANCE_CHANGES.md)', () => {
  it('the Dungeon gives 10 free sessions a day and a defeat keeps 75% of the gold', () => {
    expect(T.dungeon.freeSessionsPerDay).toBe(10);
    expect(T.battle.defeatGoldKept).toBe(0.75);
  });

  it('every hunting zone drops at most as many material types as the first Hunting Pouch has slots', () => {
    expect(HUNT_POUCH_TIERS.map((t) => t.slots)).toEqual([3, 4, 6, 8]);
    for (const z of HUNTING_ZONES) expect(z.drops.length).toBeLessThanOrEqual(HUNT_POUCH_TIERS[0].slots);
  });
});

describe('Hunting Pouch capacity comes from the tier, never from the save', () => {
  it('a tier-1 pouch holds 3 types for new saves and for saves written when it held 2', () => {
    expect(effectivePouchSlots(defaultSave(), NOW)).toBe(3);
    const oldSave = { ...wire(defaultSave()), huntPouch: { tier: 1, items: [{ itemId: 'leather_scrap', count: 7 }], lostItems: [{ itemId: 'demon_claw', count: 2 }], slots: 2, capacity: 2 } };
    const loaded = normalizeSave(oldSave);
    expect(loaded.huntPouch.tier).toBe(1);
    expect(effectivePouchSlots(loaded, NOW)).toBe(3);
    // existing contents survive the load untouched
    expect(loaded.huntPouch.items).toEqual([{ itemId: 'leather_scrap', count: 7 }]);
  });

  it('higher tiers and the Battle Pass bonus are unchanged', () => {
    const at = (tier: number, pass: boolean): SaveData => ({ ...defaultSave(), huntPouch: { tier, items: [], lostItems: [] }, hasBattlePass: pass, battlePassExpiresAt: null });
    expect([1, 2, 3, 4].map((t) => effectivePouchSlots(at(t, false), NOW))).toEqual([3, 4, 6, 8]);
    expect(effectivePouchSlots(at(1, true), NOW)).toBe(3 + T.battlePass.pouchBonusSlots);
  });

  it('allocateToPouch keeps all three types of a zone when the pouch has 3 slots', () => {
    const order = HUNTING_ZONES[0].drops.map((d) => d.material);
    const out = allocateToPouch({ tier: 1, items: [], lostItems: [] }, { leather_scrap: 147, demon_claw: 48, demon_core: 4 }, order, 3);
    expect(out.lostItems).toEqual([]);
    expect(out.items.map((i) => i.itemId).sort()).toEqual([...order].sort());
  });

  it('a 4 h hunt in the first zone with the starter pouch loses nothing, for 12 different start times', () => {
    let allThree = 0;
    for (let i = 0; i < 12; i++) {
      const start = new Date(2026, 5, 1, 9, i * 11, 0).getTime();
      const base = { ...defaultSave(), huntingOfflineStart: start, lastMiningClaim: start, lastWoodcuttingClaim: start };
      const stopped = applyHuntStop(applyHuntStart(base, 'demon_glade', 'shallow', start)!, start + 4 * HOUR)!;
      const reward = stopped.pendingHuntReward!;
      expect(reward.lost).toEqual([]);
      if (Object.values(reward.drops).filter((n) => (n ?? 0) > 0).length === 3) allThree++;
    }
    expect(allThree).toBeGreaterThan(0); // the 4 h session really did produce the three types at least once
  });
});

describe('Dungeon enemy curve (stage HP / damage helpers)', () => {
  const power = (floor: number) => {
    const def = getEnemyDef(dungeonEnemyKindForFloor(floor));
    return stageEnemyHp(def, floor) * stageEnemyDmg(def, floor);
  };

  it('the floor right after a boss is never softer than the floor right before it', () => {
    const bossFloors = Array.from({ length: MAX_DUNGEON_FLOOR }, (_, i) => i + 1).filter((f) => isDungeonBoss(f) && f + 1 <= MAX_DUNGEON_FLOOR);
    expect(bossFloors).toEqual([25, 50, 75]);
    for (const b of bossFloors) expect(power(b + 1)).toBeGreaterThanOrEqual(power(b - 1));
  });

  it('every biome boss is at least 1.5x the HP x damage of the floor before it', () => {
    for (const b of [25, 50, 75, 100]) expect(power(b) / power(b - 1)).toBeGreaterThanOrEqual(1.5);
  });

  it('floors 76-99 (the boss EnemyDef as a regular mob) are exactly what they were before the balance pass', () => {
    for (let f = 76; f <= 99; f++) {
      const def = getEnemyDef(dungeonEnemyKindForFloor(f));
      const hp = Math.round(550 * (1 + 0.15 * (f - 1)) * (f % 10 === 0 ? 1.5 : 1));
      const dmg = Math.round(75 * (1 + 0.12 * (f - 1)) * 0.45);
      expect([f, stageEnemyHp(def, f), stageEnemyDmg(def, f)]).toEqual([f, hp, dmg]);
    }
  });

  it('the orc biome is a real climb: floor 49 is at least 1.5x floor 26 in HP x damage', () => {
    expect(power(49) / power(26)).toBeGreaterThanOrEqual(1.5);
  });
});

describe('recommended CP per floor (generated table)', () => {
  it('has one finite, positive, whole number per floor and never decreases (a mini-boss checkpoint is a one-floor spike)', () => {
    expect(RECOMMENDED_CP_BY_FLOOR).toHaveLength(MAX_DUNGEON_FLOOR);
    let lastNormal = 0; // the value of the last floor that is not a checkpoint spike
    for (let f = 1; f <= MAX_DUNGEON_FLOOR; f++) {
      const v = recommendedCpForFloor(f);
      expect(Number.isInteger(v) && v > 0).toBe(true);
      expect(v).toBeGreaterThanOrEqual(lastNormal);
      if (!isSpikeFloor(f)) lastNormal = v;
    }
  });

  it('a checkpoint spike never raises more than the one floor it sits on', () => {
    for (let f = 2; f <= MAX_DUNGEON_FLOOR - 1; f++) {
      if (isSpikeFloor(f)) expect(recommendedCpForFloor(f + 1)).toBeLessThanOrEqual(recommendedCpForFloor(f));
    }
  });

  it('floors 1-3 are at or below a brand-new hero, so a new player never sees the CP warning there', () => {
    const fresh = computeCP(defaultSave());
    for (const f of [1, 2, 3]) expect(recommendedCpForFloor(f)).toBeLessThanOrEqual(fresh);
  });

  it('floors outside 1..100 are clamped', () => {
    expect(recommendedCpForFloor(0)).toBe(recommendedCpForFloor(1));
    expect(recommendedCpForFloor(1000)).toBe(recommendedCpForFloor(MAX_DUNGEON_FLOOR));
  });

  it('is up to date with the current Dungeon tuning (if this fails: npm run sim:cp, then commit src/game/recommendedCp.ts)', () => {
    expect(recommendedTable(ladder(), NOW).table).toEqual([...RECOMMENDED_CP_BY_FLOOR]);
  });
});
