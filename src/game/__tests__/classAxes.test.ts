import { describe, expect, it } from 'vitest';
import { axisLeads } from '../../../scripts/sim/classAxes';

// THE PROMISE THE CLASSES REFORM MAKES (docs/CLASSES_E_EQUIPAMENTOS.md 2.5, 28/10): each class is 15-20 % better than the others on ITS OWN axis and not more than 10 % behind on the other two. Not "the same CP":
// CP counts damage and effective HP as equals, and in Hunting and against a boss nobody dies, so it approves an imbalance forever (the phase 8 measurement: at the same CP the archer killed 50 % faster than the
// warrior and the mage 16 % slower). This guard measures the axes themselves, at the reference tier (tier 6 +8, level 100), with the real Hunting engine and the real Dungeon loop, and lights when a change of gear,
// ability or class leaves the archer a boss-killer by 50 % or the mage with no area. The ranges have a few points of room around 15-20 for the discrete steps (a sub-level, a floor).
//   Axis            leader     measure
//   Hunting         mage       kills an hour (pinned sub-level 7 of the abyss)
//   Boss            archer     speed of the four biome bosses
//   Depth           warrior    only where the axis discriminates (tiers 2 to 5, guarded at tier 4); at tier 6 it SATURATES, see the note at the end
describe('class axes at tier 6 +8', () => {
  const leads = axisLeads(6, 100, 8);
  const [warrior, archer, mage] = [0, 1, 2];

  it('the mage leads Hunting by 12 to 24 %', () => {
    expect(leads.hunting[mage]).toBeGreaterThanOrEqual(0.12);
    expect(leads.hunting[mage]).toBeLessThanOrEqual(0.24);
  });

  it('the archer leads the boss by 12 to 25 %', () => {
    expect(leads.boss[archer]).toBeGreaterThanOrEqual(0.12);
    expect(leads.boss[archer]).toBeLessThanOrEqual(0.25);
  });

  it('no class falls more than 10 % behind the other two on any axis', () => {
    for (const axis of ['hunting', 'boss', 'depth'] as const) {
      expect(leads[axis][warrior], `warrior ${axis}`).toBeGreaterThanOrEqual(-0.1);
      expect(leads[axis][archer], `archer ${axis}`).toBeGreaterThanOrEqual(-0.1);
      expect(leads[axis][mage], `mage ${axis}`).toBeGreaterThanOrEqual(-0.1);
    }
  });

  it('the archer does not also win Hunting (its lead there stays under 10 %: one class, one axis)', () => {
    expect(leads.hunting[archer]).toBeLessThanOrEqual(0.1);
  });

  // TIER 4 +8 (level 62, the middle of the game). Cooldowns count AVERAGE swings since 28/10 (abilities.ts abilityCdScale), which is what lets tier 4 close at all: with fixed cooldowns the warrior's Firm Strike
  // took the boss axis from the archer. All three leads close, and so does the mage's weak side (the boss and the floors), which needed the abilities and the staff dial of the 28/10 round and the shorter opening shot of the archer (see docs/CLASSES_E_EQUIPAMENTOS.md 5.1.6).
  describe('tier 4 +8', () => {
    const t4 = axisLeads(4, 62, 8, 'blood_abyss', 5);
    it('the mage leads Hunting by 12 to 24 %, the archer leads the boss by 12 to 25 %, the warrior leads the depth by 12 to 25 %', () => {
      expect(t4.hunting[mage]).toBeGreaterThanOrEqual(0.12);
      expect(t4.hunting[mage]).toBeLessThanOrEqual(0.24);
      expect(t4.boss[archer]).toBeGreaterThanOrEqual(0.12);
      expect(t4.boss[archer]).toBeLessThanOrEqual(0.25);
      expect(t4.depth[warrior]).toBeGreaterThanOrEqual(0.12);
      expect(t4.depth[warrior]).toBeLessThanOrEqual(0.25);
    });
    it('no class falls more than 10 % behind the other two on any axis, and the archer does not also win Hunting', () => {
      for (const axis of ['hunting', 'boss', 'depth'] as const) {
        expect(t4[axis][warrior], `warrior ${axis}`).toBeGreaterThanOrEqual(-0.1);
        expect(t4[axis][archer], `archer ${axis}`).toBeGreaterThanOrEqual(-0.1);
        expect(t4[axis][mage], `mage ${axis}`).toBeGreaterThanOrEqual(-0.1);
      }
      expect(t4.hunting[archer]).toBeLessThanOrEqual(0.1);
    });
    // The floors of this tier are discrete (a class stops at 59, 69, 74...: the walls are the checkpoints 60 and 70 and the boss of 75), so the leads above come out of the triple of reaches: the one that closes the three
    // rules is warrior 69 / archer 59 / mage 59 (+16.9 / -7.8 / -7.8 %); any other triple the game can reach breaks one (74 / 69 / 59 is +15.6 / +3.8 / -17.5). If a depth line lights after a change of survival, look at the reaches first.
  });

  // DEPTH AXIS. At tier 6 every class stops between floor 84 and 89 (the content saturates: nobody gets past about floor 86 with a common tier 6 set), so there is no room to tell the classes apart there, and the lead of the
  // warrior is +3 to +5 %. The 15-20 % target of the depth is meant where the axis discriminates (tier 2 to 5; at tier 3 +8 the floors are 59 / 59 / 39). Measuring it somewhere else to manufacture a difference would be
  // choosing the ruler by the result; tier 4 is guarded above, tier 3 and 5 stay unmeasured on purpose.
  it.todo('the mage at tier 3 +8 is not more than 10 % behind on the boss and does not stop at floor 39');
});
