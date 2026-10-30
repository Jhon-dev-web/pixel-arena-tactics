import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mulberry32, withSeededRandom } from '../../../scripts/sim/driver';
import { Player, SimClass } from '../../../scripts/sim/player';

// THE MAGE'S DOOR. Each class is born in a different activity (warrior: Mining, archer: Hunting, mage: Garden -> Weaving), and a recipe edit to ONE of the three lines can lock its class out of tier 3 for a
// month without a single number on the screen changing: it was found on 30/10, when a measurement showed the simulated mage wearing his first tier-3 piece on day 25-30 (in some seeds never) against day 10 of the
// warrior. Most of that gap was the simulated player's policy (it never took off the piece it was about to upgrade, so it forged every lower tier twice, and its Garden planted what the next craft asked for and
// left the fibre of the set waiting), not the recipes: with a reasonable player the three classes wear tier 3 on days 8-12. This plays that reasonable player (scripts/tools/classDoor.tool.ts prints the
// whole table) and holds two rules: the mage opens the door by day 16, and not before the warrior (the Garden stays the slow, patient activity: 3 to 4 days behind, not 3 to 4 weeks, and not ahead).
// A failure here is a recipe (CLOTH_LINES, the weaving costs, the plant yields) that moved the mage's door, not the test: measure with the tool before touching a bound.
const START = new Date(2026, 5, 1, 0, 0, 0).getTime();
const DAYS = 18;
const MAGE_BY_DAY = 16;

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
});
afterAll(() => {
  vi.useRealTimers();
});

// the first day the class wears a piece of tier 3 (any of the five armor slots), or null
function firstTier3Day(cls: SimClass, seed: number): number | null {
  let found: number | null = null;
  withSeededRandom(seed * 7919 + 13, () => {
    const jitter = mulberry32(seed * 104729 + 7);
    const p = new Player((t) => vi.setSystemTime(t), START, { cls, wornIngredients: true, plantFibre: true });
    for (let d = 0; d < DAYS && found === null; d++) {
      p.playDay(d, jitter);
      const s = p.snapshots[p.snapshots.length - 1];
      if (Math.max(...s.wornTiers.slice(1, 6)) >= 3) found = s.day;
    }
  });
  return found;
}

describe("the mage's door to tier 3", () => {
  it('opens by day 16 and never before the warrior', () => {
    const warrior = firstTier3Day('warrior', 1);
    const mage = firstTier3Day('mage', 1);
    expect(warrior, 'the simulated warrior never wore a tier-3 piece in 18 days').not.toBeNull();
    expect(mage, `the simulated mage never wore a tier-3 piece in ${DAYS} days (warrior: day ${warrior})`).not.toBeNull();
    expect(mage!, `mage day ${mage}, warrior day ${warrior}`).toBeLessThanOrEqual(MAGE_BY_DAY);
    expect(mage!, `the mage (day ${mage}) passed the warrior (day ${warrior})`).toBeGreaterThanOrEqual(warrior!);
  }, 120_000);
});
