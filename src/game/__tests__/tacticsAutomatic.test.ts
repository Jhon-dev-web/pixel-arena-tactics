import { describe, expect, it } from 'vitest';
import { automaticRotation, hero } from '../../../scripts/sim/duel';
import { buildCombatStats, defaultSave, effectiveRotation, equippedAbilities, normalizeSave, SaveData } from '../engine';
import { AbilityId, defaultRotation, grantedAbilities } from '../abilities';
import { ArmorWeight, GEAR, WeaponLine } from '../gear';
import { createGearInstance } from '../gearInstances';
import T from '../tunables';

// 2026-10-31: the Taticas screen has NOTHING to choose. Every ability the worn gear grants is used by itself, so a save that still carries an old choice (its own list, or [] "cleared on purpose") has to come
// back automatic when it is LOADED. Nothing on a green screen shows it: a hero whose old list left an ability out would simply fight with less, forever, and no screen has the button to fix it any more.

const wire = (s: unknown) => JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
function wear(base: SaveData, slot: 'weapon' | 'armor', templateId: string): SaveData {
  const inst = createGearInstance(templateId, { id: `gi_test_${templateId}`, origin: 'craft', rarity: 'common', substats: [], upgrade: 0 });
  return { ...base, gearInstances: { ...base.gearInstances, [inst.id]: inst }, equipped: { ...base.equipped, [slot]: inst.id } };
}
const firstOf = (pick: (g: (typeof GEAR)[number]) => boolean) => GEAR.find((g) => g.tier >= 1 && pick(g))!.id;
const LINES = ['sword', 'axe', 'bow', 'crossbow', 'staff', 'scepter'] as const;
const WEAPONS = LINES.map((line) => firstOf((g) => g.slot === 'weapon' && (line === 'sword' ? !g.line : g.line === line)));
const CHESTS = [firstOf((g) => g.slot === 'armor' && !g.weight), firstOf((g) => g.slot === 'armor' && g.weight === 'leather'), firstOf((g) => g.slot === 'armor' && g.weight === 'cloth')];

describe('a loaded save is automatic: it uses every ability the worn gear grants', () => {
  // what an older save could carry: its own list, a partial one, a list of the wrong abilities, [] cleared on purpose, junk
  const OLD_CHOICES: unknown[] = [[], ['breach'], ['iron_stance', 'firm_strike'], ['arrow_rain', 'nope'], ['firm_strike', 'double_thrust', 'breach', 'iron_stance'].reverse(), 'x', null];

  it('through the real loading path, every old choice ends with all the granted abilities in the combat stats (every weapon line with every chestpiece)', () => {
    let checked = 0;
    for (const w of WEAPONS) {
      for (const c of CHESTS) {
        const base = wear(wear(automaticRotation(hero('2', 3, { level: 40 })), 'weapon', w), 'armor', c);
        const granted = equippedAbilities(base);
        expect(granted.length, `${w} + ${c}`).toBeGreaterThan(0);
        for (const rotation of OLD_CHOICES) {
          const loaded = normalizeSave(wire({ ...base, rotation }));
          const where = `${w} + ${c} loaded with ${JSON.stringify(rotation)}`;
          expect('rotation' in loaded, where).toBe(false);
          expect(effectiveRotation(loaded), where).toEqual(granted);
          expect(buildCombatStats(loaded).rotation, where).toEqual(granted);
          checked++;
        }
      }
    }
    expect(checked).toBe(WEAPONS.length * CHESTS.length * OLD_CHOICES.length);
  });

  it('the hero of the stats is the same whether the old choice was there or not (nothing else changed by loading)', () => {
    const base = automaticRotation(hero('2', 3, { level: 40 }));
    const plain = normalizeSave(wire(base));
    for (const rotation of OLD_CHOICES) expect(buildCombatStats(normalizeSave(wire({ ...base, rotation })))).toEqual(buildCombatStats(plain));
  });

  it('the starting gear grants nothing, so loading it with a list leaves the hero with no ability and no list', () => {
    const loaded = normalizeSave(wire({ ...defaultSave(), rotation: ['firm_strike'] }));
    expect('rotation' in loaded).toBe(false);
    expect(effectiveRotation(loaded)).toEqual([]);
  });
});

// "All of them fit" is what makes the screen honest to say they all fire: the slots of the rotation are the ceiling, and defaultRotation cuts at it. The day a weapon grants a fourth ability, this fails and says so
// (the options are more slots or a screen that says some stay out), instead of the hero silently leaving one out.
describe('the gear never grants more abilities than the rotation has slots', () => {
  const lines: (WeaponLine | undefined | null)[] = [null, undefined, ...LINES];
  const weights: (ArmorWeight | undefined | null)[] = [null, undefined, 'leather', 'cloth'];
  it('every weapon line with every chestpiece weight fits in T.abilities.rotationSlots, so defaultRotation drops nothing', () => {
    for (const line of lines) {
      for (const weight of weights) {
        const granted: AbilityId[] = grantedAbilities(line, weight);
        expect(granted.length, `${String(line)} + ${String(weight)}`).toBeLessThanOrEqual(T.abilities.rotationSlots);
        expect(defaultRotation(granted), `${String(line)} + ${String(weight)}`).toEqual(granted);
      }
    }
  });
});
