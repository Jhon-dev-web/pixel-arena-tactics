import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { hero } from '../../../scripts/sim/duel';
import { buildCombatStats, computeCP, normalizeSave } from '../engine';
import { dungeonScenarios, huntScenarios } from './abilitiesGolden';

// Classes reform, phase 4: the abilities engine is ADDITIVE. abilitiesGolden.json was recorded from the code as it stood BEFORE the engine existed (HEAD 622857f, no abilities.ts): Hunting sessions of four
// builds and two ladder heroes (kills, XP, Gold, drops, uniques, promotions, the live snapshot, the skill tallies, the total damage), seeded Dungeon runs of four heroes, their combat stats, their CP, and a
// normalized fresh save. A hero with no rotation has to give every one of those numbers again, bit for bit, through the same code path: the three combat loops now call the abilities functions on every
// swing and every enemy hit, and those calls must be exact no-ops.
const GOLDEN = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'abilitiesGolden.json'), 'utf8')) as { hunt: unknown; dungeon: unknown };

describe('a hero without a rotation fights exactly as before the abilities engine', () => {
  it('Hunting: every session of the golden file comes out identical (no rotation field at all)', () => {
    expect(huntScenarios()).toEqual(GOLDEN.hunt);
  });

  it('Hunting: an EMPTY rotation takes the same path and gives the same result as a missing one', () => {
    expect(huntScenarios({ rotation: [] })).toEqual(GOLDEN.hunt);
  });

  it('Dungeon driver, combat stats, CP and the fresh save: identical to the golden file', () => {
    expect(dungeonScenarios()).toEqual(GOLDEN.dungeon);
  });

  it('the result of a session without a rotation does not even grow a new field', () => {
    const sessions = huntScenarios() as Record<string, Record<string, unknown>>;
    for (const r of Object.values(sessions)) expect('abilityFired' in r).toBe(false);
  });

  it('a save that stores an empty or unusable rotation is the same hero as one that never had the field: stats and CP', () => {
    const base = hero('3', 5, { level: 30 });
    const stored = (rotation: unknown) => normalizeSave(JSON.parse(JSON.stringify({ ...base, rotation })));
    const plain = normalizeSave(JSON.parse(JSON.stringify(base)));
    for (const rotation of [[], 'x', null, ['bogus'], ['arrow_rain'], [3]]) {
      const s = stored(rotation);
      expect('rotation' in s).toBe(false);
      expect(buildCombatStats(s)).toEqual(buildCombatStats(plain));
      expect(computeCP(s)).toBe(computeCP(plain));
    }
    expect(buildCombatStats({ ...base, rotation: [] })).toEqual(buildCombatStats(base));
  });
});
