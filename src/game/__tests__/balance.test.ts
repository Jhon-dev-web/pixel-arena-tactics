import { describe, expect, it } from 'vitest';
import { computeCP, defaultSave, normalizeSave } from '../engine';
import { applyHuntClaim, applyHuntStart, applyHuntStop, planHuntClaim } from '../huntLifecycle';
import { DEFAULT_INVENTORY_CAPACITY, inventoryCapacity, inventorySlotsUsed, passBagBonus } from '../inventory';
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

  it('the first two zones drop three material types, the two late ones five (their own uncommon + rare on top of the old three), plus the class materials (sinew in the glade; feather and arcane dust in the marsh; all three in the rift, the abyss and the throne)', () => {
    const count = Object.fromEntries(HUNTING_ZONES.map((z) => [z.id, z.drops.length]));
    expect(count).toEqual({ demon_glade: 5, blood_marsh: 5, demon_rift: 8, blood_abyss: 8, abyss_throne: 8 }); // zones 3 and 4 got the three class materials on 29/10 (classStream), zone 5 had them from phase 7
    // the original drops (three per zone, five for the late ones) are still there, untouched
    const original = Object.fromEntries(HUNTING_ZONES.map((z) => [z.id, z.drops.filter((d) => !['beast_sinew', 'feather', 'arcane_dust'].includes(d.material)).length]));
    expect(original).toEqual({ demon_glade: 3, blood_marsh: 3, demon_rift: 5, blood_abyss: 5, abyss_throne: 5 });
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
      // the three ORIGINAL types of the zone (the phase 1 drops of the classes reform are extra, ownStream)
      const original = ['leather_scrap', 'demon_claw', 'demon_core'] as const;
      if (original.every((m) => (reward.drops[m] ?? 0) > 0)) allThree++;
    }
    expect(allThree).toBeGreaterThan(0); // the 4 h session really did produce the three original types at least once
  });

  it('the Adventurer Pass perk adds inventory slots for its owner, for good (it never expires)', () => {
    const base = defaultSave();
    const pass = { ...base, hasBattlePass: true };
    expect(inventoryCapacity(base, NOW)).toBe(DEFAULT_INVENTORY_CAPACITY);
    expect(inventoryCapacity(pass, NOW)).toBe(DEFAULT_INVENTORY_CAPACITY + passBagBonus(DEFAULT_INVENTORY_CAPACITY));
    expect(inventoryCapacity(pass, NOW + 400 * 24 * HOUR)).toBe(DEFAULT_INVENTORY_CAPACITY + passBagBonus(DEFAULT_INVENTORY_CAPACITY));
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
      // Round 15: times the late factor of floors 51+ (piecewise linear, T.battle.late*)
      const B = T.battle;
      const hp = Math.round(715 * (1 + 0.15 * (f - 1)) * (1 + B.lateHpGrowth * 25 + B.lateHpGrowth2 * (f - 75)) * (f % 10 === 0 ? 1.5 : 1));
      const dmg = Math.round(98 * (1 + 0.12 * (f - 1)) * (1 + B.lateDmgGrowth * 25 + B.lateDmgGrowth2 * (f - 75)) * 0.45);
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
