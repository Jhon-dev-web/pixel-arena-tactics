import { describe, expect, it } from 'vitest';
import { computeCP, defaultSave, normalizeSave } from '../engine';
import { applyHuntClaim, applyHuntStart, applyHuntStop, planHuntClaim } from '../huntLifecycle';
import { DEFAULT_INVENTORY_CAPACITY, inventoryCapacity, inventorySlotsUsed } from '../inventory';
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

  it('the first two zones drop three material types, the two late ones five (their own uncommon + rare on top of the old three)', () => {
    const count = Object.fromEntries(HUNTING_ZONES.map((z) => [z.id, z.drops.length]));
    expect(count).toEqual({ demon_glade: 3, blood_marsh: 3, demon_rift: 5, blood_abyss: 5 });
  });
});

describe('Hunt loot goes into the inventory (no separate container)', () => {
  it('a 4 h hunt in the first zone into an empty bag loses nothing, for 12 different start times, and fits in a handful of slots', () => {
    let allThree = 0;
    for (let i = 0; i < 12; i++) {
      const start = new Date(2026, 5, 1, 9, i * 11, 0).getTime();
      const base = { ...defaultSave(), huntingOfflineStart: start, lastMiningClaim: start, lastWoodcuttingClaim: start };
      const stopped = applyHuntStop(applyHuntStart(base, 'demon_glade', 'shallow', start)!, start + 4 * HOUR)!;
      const reward = stopped.pendingHuntReward!;
      expect(reward.lost).toEqual([]);
      expect(planHuntClaim(stopped, reward).leftBehind).toEqual([]);
      const claimed = applyHuntClaim(stopped, reward.id)!;
      expect(inventorySlotsUsed(claimed)).toBeLessThanOrEqual(DEFAULT_INVENTORY_CAPACITY);
      if (Object.values(reward.drops).filter((n) => (n ?? 0) > 0).length === 3) allThree++;
    }
    expect(allThree).toBeGreaterThan(0); // the 4 h session really did produce the three types at least once
  });

  it('the Battle Pass perk adds inventory slots only while it lasts', () => {
    const base = defaultSave();
    const pass = { ...base, hasBattlePass: true, battlePassExpiresAt: NOW + HOUR };
    expect(inventoryCapacity(base, NOW)).toBe(DEFAULT_INVENTORY_CAPACITY);
    expect(inventoryCapacity(pass, NOW)).toBe(DEFAULT_INVENTORY_CAPACITY + T.battlePass.bagBonusSlots);
    expect(inventoryCapacity(pass, NOW + 2 * HOUR)).toBe(DEFAULT_INVENTORY_CAPACITY);
    expect(normalizeSave(wire(pass)).inventoryBonusSlots).toBe(0);
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

  // Rodada 3: the boss EnemyDef went from 550 / 75 to 715 / 98 (x1.3, like the warlock and the orc) because heroes now fill six gear slots.
  it('floors 76-99 (the boss EnemyDef as a regular mob) follow the boss EnemyDef curve', () => {
    for (let f = 76; f <= 99; f++) {
      const def = getEnemyDef(dungeonEnemyKindForFloor(f));
      const hp = Math.round(715 * (1 + 0.15 * (f - 1)) * (f % 10 === 0 ? 1.5 : 1));
      const dmg = Math.round(98 * (1 + 0.12 * (f - 1)) * 0.45);
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
