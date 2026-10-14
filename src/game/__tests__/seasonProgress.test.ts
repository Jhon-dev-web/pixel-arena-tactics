import { describe, expect, it } from 'vitest';
import { defaultSave, playerLevel } from '../engine';
import { paragonLevel } from '../paragon';
import { MAX_SAVE_UPLOAD_BYTES, toUploadBlob } from '../saveUpload';
import { buildTables } from '../../../scripts/sim/seasonTablesBuild';
import { deriveBounds } from '../../../scripts/sim/seasonBoundsDerive';
import { BOUNDS, burstXp, xpPerHourAt } from '../../../supabase/functions/_shared/progress/bounds';
import { MAX_BODY_BYTES } from '../../../supabase/functions/_shared/progress/handler';
import { computeScore, extractMetrics, levelFromXp, paragonFromXp } from '../../../supabase/functions/_shared/progress/metrics';
import * as tables from '../../../supabase/functions/_shared/progress/tables';

// The server copies a few game numbers (tables.ts) and the client shares metrics.ts with the Edge Function. These tests fail the day the game moves and the copies do not.

describe('season progress: the server tables follow the game', () => {
  it('tables.ts is exactly what `npm run season:tables` would write now', () => {
    const t = buildTables();
    expect([...tables.XP_TO_LEVEL]).toEqual(t.xpToLevel);
    expect(tables.PARAGON_FIRST_XP).toBe(t.paragonFirstXp);
    expect(tables.PARAGON_GROWTH).toBe(t.paragonGrowth);
    expect(tables.GEAR_LEVEL_GATES).toEqual(t.levelGates);
    expect(tables.UNIQUE_FLOOR_GATES).toEqual(t.floorGates);
    expect([...tables.DUNGEON_RUN_XP]).toEqual(t.dungeonRunXp);
    expect([...tables.ZONE_TABLE]).toEqual(t.zoneFloors);
  });

  it('level and paragon read from XP match the game at the start, middle and end of many levels', () => {
    for (let level = 1; level <= 100; level++) {
      for (const xp of [tables.XP_TO_LEVEL[level - 1], tables.XP_TO_LEVEL[level - 1] + 17, (tables.XP_TO_LEVEL[Math.min(99, level)] ?? 0) - 1]) {
        if (xp < 0) continue;
        expect(levelFromXp(xp)).toBe(playerLevel(xp));
      }
    }
    for (const extra of [0, 1, 456_912, 456_913, 5_000_000, 30_000_000, 200_000_000]) {
      const xp = tables.XP_TO_LEVEL[99] + extra;
      expect(paragonFromXp(xp).level).toBe(paragonLevel(xp));
    }
  });

  it('the gates cover the tier 5 and 6 crafted pieces', () => {
    expect(tables.GEAR_LEVEL_GATES.abyssal_greatblade).toBe(90);
    expect(tables.GEAR_LEVEL_GATES.voidsteel_blade).toBe(70);
  });
});

describe('season progress: bounds still hold the game', () => {
  it('the theoretical constants are at least what the tunables allow', () => {
    const d = deriveBounds();
    expect(BOUNDS.xpPerHour).toBeGreaterThanOrEqual(d.xpPerHour);
    expect(xpPerHourAt(100)).toBeGreaterThanOrEqual(d.xpPerHour * 0.999);
    expect(BOUNDS.burstHours).toBeGreaterThanOrEqual(d.capHours);
    expect(BOUNDS.dungeonRunsPerDay).toBeGreaterThanOrEqual(d.runsPerDay);
    expect(BOUNDS.dungeonFloorsPerDay).toBeGreaterThanOrEqual(d.runsPerDay * 140);
    expect(BOUNDS.huntXpFactor).toBeGreaterThanOrEqual(1.3 * (1 + d.xpBonus) - 1e-9);
    expect(BOUNDS.ordersXpPerHour).toBeGreaterThanOrEqual(d.ordersPerHour);
    expect(burstXp(100, 100)).toBeGreaterThan(burstXp(1, 0));
  });

  it('the body limit is the client upload limit', () => {
    expect(MAX_BODY_BYTES).toBe(MAX_SAVE_UPLOAD_BYTES);
  });
});

describe('season progress: metrics of a real save', () => {
  it('a brand-new hero uploaded the way the game uploads it reads as level 1 with nothing out of place', () => {
    const save = defaultSave();
    const m = extractMetrics(toUploadBlob(save));
    expect(m).not.toBeNull();
    expect(m!.heroLevel).toBe(1);
    expect(m!.levelTotal).toBe(1);
    expect(m!.gateViolations).toEqual([]);
    expect(m!.premiumClaims).toBe(0);
    expect(m!.hasPassFlag).toBe(false);
    expect(computeScore(m!)).toBe(1_000_001); // highestDungeonFloor starts at 1
    expect(m!.items.common).toBeGreaterThan(0); // the starter weapon / armor
  });

  it('the fields the metrics read exist under the same names in the real save', () => {
    const save = defaultSave() as unknown as Record<string, unknown>;
    for (const key of ['xp', 'highestDungeonFloor', 'stats', 'quests', 'gearInstances', 'claimedPassRewards', 'stashBonusSlots', 'hasBattlePass']) expect(save).toHaveProperty(key);
    const stats = save.stats as Record<string, unknown>;
    for (const key of ['deepestDepth', 'kills', 'goldEarned', 'bossesKilled', 'secondsPlayed', 'uniquesFound', 'dungeonFloors', 'dungeonRuns']) expect(stats).toHaveProperty(key);
    expect(Array.isArray((save.quests as { claimed: unknown }).claimed)).toBe(true);
  });
});
