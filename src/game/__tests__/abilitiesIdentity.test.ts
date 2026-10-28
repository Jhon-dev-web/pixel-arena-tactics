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
//
// SCOPE CHANGED ON 2026-10-28 (phase 5), ON PURPOSE, and the golden file was NOT touched or re-recorded. Phase 5 turned the default rotation on: a save WITHOUT a rotation field is now AUTOMATIC, and the
// rotation in force is derived from the worn gear on the spot (effectiveRotation; the owner's decision: in an idle game most players never open the Taticas screen and must not play with their gear
// switched off). So "a hero with no field fights as before" is no longer true, and that is the point of the change, not a loosened test. What the golden proves is now stated exactly: a hero whose
// rotation is EMPTY (an explicit `rotation: []`, which is also what a player who cleared his rotation has) fights exactly as before the engine existed. That stays true and is still checked against the
// same bytes; the only edit to the scenarios (abilitiesGolden.ts) is that their heroes carry an explicit empty rotation. The automatic default is proved in defaultRotation.test.ts.
const GOLDEN = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'abilitiesGolden.json'), 'utf8')) as { hunt: unknown; dungeon: unknown };

describe('a hero with an EMPTY rotation fights exactly as before the abilities engine', () => {
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

  it('a loaded save that stores an explicit empty rotation keeps it, and is the same hero as the raw one with an empty rotation: stats and CP', () => {
    const base = { ...hero('3', 5, { level: 30 }), rotation: [] };
    const s = normalizeSave(JSON.parse(JSON.stringify(base)));
    expect(s.rotation).toEqual([]);
    expect('rotation' in buildCombatStats(s)).toBe(false);
    expect(buildCombatStats(s)).toEqual(buildCombatStats(base));
    expect(computeCP(s)).toBe(computeCP(base));
  });
});
