import { describe, expect, it } from 'vitest';
import {
  crossedMilestoneFloors,
  dungeonRunXp,
  getBiomeForFloor,
  getMilestoneReward,
  isDungeonBoss,
  MAX_DUNGEON_FLOOR,
  MILESTONE_FLOORS,
  MILESTONE_REWARDS,
  milestoneXpBonus,
  nextMilestone,
  recommendedCpForFloor,
  stageVictoryXp,
} from '../dungeon';
import { TITLES } from '../titles';
import { computeCP, defaultSave } from '../engine';

describe('dungeon milestone rewards', () => {
  it('are exactly the biome-boss floors 25/50/75/100, each with real gold and gems', () => {
    expect(MILESTONE_FLOORS).toEqual([25, 50, 75, 100]);
    for (const floor of MILESTONE_FLOORS) {
      expect(isDungeonBoss(floor)).toBe(true);
      const r = getMilestoneReward(floor);
      expect(r).toBeDefined();
      expect(r!.gold).toBeGreaterThan(0);
      expect(Object.values(r!.gems).some((n) => (n ?? 0) > 0)).toBe(true);
    }
    expect(getMilestoneReward(24)).toBeUndefined();
    expect(getMilestoneReward(26)).toBeUndefined();
  });

  it('pay more the deeper they are', () => {
    const golds = MILESTONE_REWARDS.map((m) => m.gold);
    expect([...golds].sort((a, b) => a - b)).toEqual(golds);
  });

  it('every title they hand out exists in the title catalog', () => {
    const ids = new Set(TITLES.map((t) => t.id));
    for (const m of MILESTONE_REWARDS) if (m.titleId) expect(ids.has(m.titleId)).toBe(true);
  });

  describe('crossedMilestoneFloors', () => {
    it('credits nothing when no floor was cleared', () => {
      expect(crossedMilestoneFloors(1, 0, [])).toEqual([]);
      expect(crossedMilestoneFloors(25, -3, [])).toEqual([]);
    });

    it('credits floor 25 only once floor 25 itself was defeated', () => {
      expect(crossedMilestoneFloors(1, 24, [])).toEqual([]); // floors 1..24
      expect(crossedMilestoneFloors(1, 25, [])).toEqual([25]); // floors 1..25
    });

    it('counts a run that starts exactly on an unclaimed milestone floor', () => {
      expect(crossedMilestoneFloors(25, 1, [])).toEqual([25]);
      expect(crossedMilestoneFloors(26, 1, [])).toEqual([]);
    });

    it('credits several milestones crossed in one long run, in order', () => {
      expect(crossedMilestoneFloors(1, 100, [])).toEqual([25, 50, 75, 100]);
      expect(crossedMilestoneFloors(20, 40, [])).toEqual([25, 50]);
    });

    it('never credits a milestone that is already claimed (granted once)', () => {
      let claimed: number[] = [];
      const first = crossedMilestoneFloors(1, 30, claimed);
      expect(first).toEqual([25]);
      claimed = [...claimed, ...first];
      expect(crossedMilestoneFloors(1, 30, claimed)).toEqual([]);
      expect(crossedMilestoneFloors(20, 80, claimed)).toEqual([50, 75]);
    });

    it('does not mutate the claimed list it is given', () => {
      const claimed = [25];
      crossedMilestoneFloors(1, 100, claimed);
      expect(claimed).toEqual([25]);
    });

    // Defeat rule (dungeon.ts: "Callers must only invoke this for a successful (retreat) outcome") is NOT enforced by
    // this pure helper - it has no notion of an outcome. The gate is `success ? crossedMilestoneFloors(...) : []` inside
    // App.tsx finishRun (a React component closure), so it cannot be unit-tested today.
    it.todo('a run that ends in defeat never credits a milestone (gate lives in App.tsx finishRun; extract it to a pure helper to test it)');
  });
});

describe('dungeon xp and pacing helpers', () => {
  it('stage XP grows with depth and run XP is the sum of the stages cleared', () => {
    expect(stageVictoryXp(10)).toBeGreaterThan(stageVictoryXp(1));
    expect(dungeonRunXp(5, 0)).toBe(0);
    expect(dungeonRunXp(1, 3)).toBe(stageVictoryXp(1) + stageVictoryXp(2) + stageVictoryXp(3));
  });

  it('milestone XP bonus counts only the checkpoint / boss floors actually defeated', () => {
    expect(milestoneXpBonus(1, 9)).toBe(0); // floors 1..9
    const checkpoint = milestoneXpBonus(1, 10); // floor 10 defeated
    expect(checkpoint).toBeGreaterThan(0);
    const boss = milestoneXpBonus(25, 1); // floor 25 only
    expect(boss).toBeGreaterThan(checkpoint);
    expect(milestoneXpBonus(1, 25)).toBe(2 * checkpoint + boss); // 10, 20, 25
  });

  it('floors map to a biome and the recommended-CP table is defined for every floor', () => {
    for (let f = 1; f <= MAX_DUNGEON_FLOOR; f++) {
      expect(getBiomeForFloor(f)).toBeDefined();
      expect(Number.isFinite(recommendedCpForFloor(f))).toBe(true);
    }
    expect(recommendedCpForFloor(1)).toBeLessThanOrEqual(computeCP(defaultSave())); // a fresh character never sees the warning on floor 1
  });

  it('nextMilestone points at the next checkpoint / boss and ends after the last floor', () => {
    expect(nextMilestone(1)).toEqual({ floor: 10, boss: false });
    expect(nextMilestone(20)).toEqual({ floor: 25, boss: true });
    expect(nextMilestone(MAX_DUNGEON_FLOOR)).toBeNull();
  });
});
