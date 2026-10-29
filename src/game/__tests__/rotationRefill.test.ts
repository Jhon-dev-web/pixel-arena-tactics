import { describe, expect, it } from 'vitest';
import { automaticRotation, hero } from '../../../scripts/sim/duel';
import { applyRotation, buildCombatStats, computeCP, effectiveRotation, equippedAbilities, normalizeSave, SaveData } from '../engine';
import { ABILITY_IDS, AbilityId, defaultRotation, fillRotation } from '../abilities';
import { GEAR } from '../gear';
import { createGearInstance } from '../gearInstances';
import T from '../tunables';

// The hole this closes: a hero who CHOSE a rotation changes weapon, the abilities of the old weapon leave his list and the places stay empty. He keeps fighting with fewer abilities than the gear gives him, and
// nothing on the screen says so (an idle player rarely opens Taticas). The rotation in force (effectiveRotation) now refills those places from the worn gear. Nothing here shows up on a green screen: the hero
// simply fights with less, so each rule below is a guard.
// Three states stay what they were: ABSENT = automatic (the default of the worn gear), [] = cleared on purpose (stays empty), a short list the player picked on gear that still grants all of it (stays short).

const wire = (s: unknown) => JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
const slots = () => T.abilities.rotationSlots;

function wear(base: SaveData, slot: 'weapon' | 'armor', templateId: string): SaveData {
  const inst = createGearInstance(templateId, { id: `gi_test_${templateId}`, origin: 'craft', rarity: 'common', substats: [], upgrade: 0 });
  return { ...base, gearInstances: { ...base.gearInstances, [inst.id]: inst }, equipped: { ...base.equipped, [slot]: inst.id } };
}
const firstOf = (pick: (g: (typeof GEAR)[number]) => boolean) => GEAR.find((g) => g.tier >= 1 && pick(g))!.id;
const SHORT_BOW = 'short_bow';
const LEATHER_CHEST = firstOf((g) => g.slot === 'armor' && g.weight === 'leather');
const CLOTH_CHEST = firstOf((g) => g.slot === 'armor' && g.weight === 'cloth');
// A level 15 hero with a tier 3 sword and the plate chest: firm_strike, double_thrust, breach (sword) + iron_stance (plate).
const sword = automaticRotation(hero('2', 3, { level: 15 }));
const choose = (s: SaveData, rotation: AbilityId[]): SaveData => ({ ...s, rotation });

describe('a weapon change refills the places it emptied', () => {
  it('the dropped abilities are replaced IN THEIR PLACE, then the free slots are filled, in definition order; combat reads the same list', () => {
    const chosen = choose(sword, ['breach', 'iron_stance', 'firm_strike']);
    const bow = wear(chosen, 'weapon', SHORT_BOW); // bow: arrow_rain, opening_shot, true_shot + the plate chest's iron_stance
    expect(equippedAbilities(bow)).toEqual(['arrow_rain', 'opening_shot', 'true_shot', 'iron_stance']);
    // breach (slot 1) and firm_strike (slot 3) are gone: the first takes the first spare ability, the second the next; the one left over goes to the free fourth slot.
    expect(effectiveRotation(bow)).toEqual(['arrow_rain', 'iron_stance', 'opening_shot', 'true_shot']);
    expect(buildCombatStats(bow).rotation).toEqual(['arrow_rain', 'iron_stance', 'opening_shot', 'true_shot']);
    // the same hero WITHOUT the fix would fight with ['iron_stance'] only: the CP shows the difference to the one place that is not combat
    expect(computeCP(bow)).toBeGreaterThan(computeCP(choose(bow, ['iron_stance'])));
  });

  it('the abilities he kept never move: his order survives, even when it is not the definition order', () => {
    const chosen = choose(sword, ['iron_stance', 'breach', 'firm_strike']); // reverse of the definition order for the two that stay
    const leather = wear(chosen, 'armor', LEATHER_CHEST); // plate chest out: iron_stance is dropped, dodge comes in
    expect(equippedAbilities(leather)).toEqual(['firm_strike', 'double_thrust', 'breach', 'dodge']);
    expect(effectiveRotation(leather)).toEqual(['double_thrust', 'breach', 'firm_strike', 'dodge']);
  });

  it('a chestpiece change refills the same way (the rule is about gear, not about the weapon)', () => {
    const chosen = choose(sword, ['firm_strike', 'iron_stance']);
    const cloth = wear(chosen, 'armor', CLOTH_CHEST);
    const rot = effectiveRotation(cloth);
    expect(rot[0]).toBe('firm_strike');
    expect(rot).not.toContain('iron_stance');
    expect(rot.length).toBeGreaterThan(1);
    expect(rot.every((id) => equippedAbilities(cloth).includes(id))).toBe(true);
  });

  it('when the gear grants fewer abilities than there are holes, the holes close up (no gap, nothing invented)', () => {
    expect(fillRotation(['arrow_rain', 'opening_shot', 'true_shot', 'firm_strike'], ['firm_strike'])).toEqual(['firm_strike']);
    expect(fillRotation(['arrow_rain', 'firm_strike'], [])).toEqual([]);
  });

  it('the stored choice is never rewritten: putting the old weapon back gives him his own rotation untouched', () => {
    const chosen = choose(sword, ['breach', 'iron_stance', 'firm_strike']);
    const bow = wear(chosen, 'weapon', SHORT_BOW);
    expect(bow.rotation).toEqual(['breach', 'iron_stance', 'firm_strike']);
    expect(applyRotation(bow, null).rotation).toBeUndefined();
    const back = { ...bow, equipped: chosen.equipped };
    expect(effectiveRotation(back)).toEqual(['breach', 'iron_stance', 'firm_strike']);
  });
});

describe('what the refill must NOT touch', () => {
  it('rotation: [] is cleared on purpose and stays empty after any gear change', () => {
    const cleared = choose(sword, []);
    for (const s of [cleared, wear(cleared, 'weapon', SHORT_BOW), wear(wear(cleared, 'weapon', SHORT_BOW), 'armor', CLOTH_CHEST), wear(cleared, 'armor', LEATHER_CHEST)]) {
      expect(effectiveRotation(s)).toEqual([]);
      expect('rotation' in buildCombatStats(s)).toBe(false);
    }
    expect(fillRotation([], ABILITY_IDS)).toEqual([]);
  });

  it('a rotation ABSENT is still automatic: it follows the gear worn now and the field is never written', () => {
    const bow = wear(sword, 'weapon', SHORT_BOW);
    expect('rotation' in bow).toBe(false);
    expect(effectiveRotation(bow)).toEqual(defaultRotation(equippedAbilities(bow)));
    expect(effectiveRotation(bow)).toEqual(['arrow_rain', 'opening_shot', 'true_shot', 'iron_stance']);
    expect('rotation' in normalizeSave(wire(bow))).toBe(false);
  });

  it('a short list the player picked, on gear that still grants all of it, is NOT padded (only a gear change that dropped something triggers the refill)', () => {
    for (const picked of [['firm_strike'], ['breach', 'firm_strike'], ['iron_stance', 'double_thrust', 'firm_strike']] as AbilityId[][]) {
      expect(effectiveRotation(choose(sword, picked))).toEqual(picked);
      expect(buildCombatStats(choose(sword, picked)).rotation).toEqual(picked);
    }
    // what the Taticas screen stores is exactly the choice, so applying a short list is a choice that stays
    expect(effectiveRotation(applyRotation(sword, ['firm_strike']))).toEqual(['firm_strike']);
    // and once the screen has stored the refilled list, it is his choice: it holds as it is
    const bow = wear(choose(sword, ['breach', 'iron_stance', 'firm_strike']), 'weapon', SHORT_BOW);
    const applied = applyRotation(bow, effectiveRotation(bow));
    expect(applied.rotation).toEqual(effectiveRotation(bow));
    expect(effectiveRotation(applied)).toEqual(effectiveRotation(bow));
  });

  it('an old save loads exactly as before: the refill is on READ only, loading writes nothing and keeps the stored list', () => {
    const chosen = choose(sword, ['breach', 'iron_stance', 'firm_strike']);
    const bow = wear(chosen, 'weapon', SHORT_BOW);
    const loaded = normalizeSave(wire(bow));
    expect(loaded.rotation).toEqual(['breach', 'iron_stance', 'firm_strike']); // not the refilled one
    expect(effectiveRotation(loaded)).toEqual(effectiveRotation(bow));
    expect(normalizeSave(wire(loaded))).toEqual(loaded);
    // an old save whose rotation still matches the gear loads with the very same rotation in force
    const same = normalizeSave(wire(choose(sword, ['firm_strike', 'iron_stance'])));
    expect(same.rotation).toEqual(['firm_strike', 'iron_stance']);
    expect(effectiveRotation(same)).toEqual(['firm_strike', 'iron_stance']);
    // and junk in the stored list is still dropped by loading (known ids, no repeats), as before
    expect(normalizeSave(wire(choose(sword, ['firm_strike', 'bogus', 'firm_strike'] as AbilityId[]))).rotation).toEqual(['firm_strike']);
  });
});

describe('whatever the player chose and whatever he wears, the rotation in force is sound', () => {
  const lines = ['sword', 'axe', 'bow', 'crossbow', 'staff', 'scepter'] as const;
  const weapons = lines.map((line) => firstOf((g) => g.slot === 'weapon' && (line === 'sword' ? !g.line : g.line === line)));
  const chests = [firstOf((g) => g.slot === 'armor' && !g.weight), LEATHER_CHEST, CLOTH_CHEST];
  // every ordered pair, the full list in both directions, a repeat and an unknown id
  const choices: unknown[][] = [];
  for (const a of ABILITY_IDS) for (const b of ABILITY_IDS) if (a !== b) choices.push([a, b]);
  choices.push([...ABILITY_IDS], [...ABILITY_IDS].reverse(), ['firm_strike', 'firm_strike', 'arrow_rain'], ['bogus', 'nova', 3, 'flames']);

  it('never longer than the slots, no repeats, only what the gear grants, kept abilities in their order, and full whenever something was dropped and the gear has spare', () => {
    let checked = 0;
    for (const w of weapons) {
      for (const c of chests) {
        const gearSave = wear(wear(sword, 'weapon', w), 'armor', c);
        const granted = equippedAbilities(gearSave);
        for (const choice of choices) {
          const where = `${w} + ${c} with ${JSON.stringify(choice)}`;
          const rot = effectiveRotation({ ...gearSave, rotation: choice as AbilityId[] });
          expect(rot.length, where).toBeLessThanOrEqual(slots());
          expect(new Set(rot).size, where).toBe(rot.length);
          expect(rot.every((id) => granted.includes(id)), where).toBe(true);
          const stored = (choice as unknown[]).filter((x, i, all): x is AbilityId => typeof x === 'string' && ABILITY_IDS.includes(x as AbilityId) && all.indexOf(x) === i).slice(0, slots());
          const kept = stored.filter((id) => granted.includes(id));
          expect(rot.filter((id) => kept.includes(id)), `${where}: kept order`).toEqual(kept);
          if (kept.length === stored.length) expect(rot, `${where}: nothing dropped, the choice stands`).toEqual(kept);
          else expect(rot.length, `${where}: refilled`).toBe(Math.min(slots(), granted.length));
          checked++;
        }
      }
    }
    expect(checked).toBe(weapons.length * chests.length * choices.length);
  });
});
