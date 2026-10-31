import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { automaticRotation, hero } from '../../../scripts/sim/duel';
import { buildCombatStats, computeCP, defaultSave, effectiveRotation, equippedAbilities, normalizeSave, SaveData } from '../engine';
import { ABILITY_IDS, AbilityId, abilityDef, defaultRotation, grantedAbilities } from '../abilities';
import { GEAR } from '../gear';
import { createGearInstance } from '../gearInstances';
import { SKILL_FX } from '../skillFx';
import { t } from '../../locales';

// Classes reform, phase 5 (2026-10-28): the default rotation is ON, and it is DERIVED, never stored. A save with NO `rotation` field is AUTOMATIC: the rotation in force is the default of the gear worn
// right now (effectiveRotation), so a weapon change changes the abilities at once. Since 2026-10-31 EVERY real hero is automatic: loading drops the field (tacticsAutomatic.test.ts). `rotation: []` and
// `rotation: [...]` only exist on heroes the measuring tools and the guards build, and the engine still reads them (the empty one is the identity with the pre-engine golden file).
// This does NOT loosen the identity test (abilitiesIdentity.test.ts): that one still proves, against the same golden bytes, that a hero with an EMPTY rotation fights exactly as before the engine existed.

const wire = (s: unknown) => JSON.parse(JSON.stringify(s)) as Record<string, unknown>;

// The same hero with another weapon / chestpiece worn (a new instance in the slot).
function wear(base: SaveData, slot: 'weapon' | 'armor', templateId: string): SaveData {
  const inst = createGearInstance(templateId, { id: `gi_test_${templateId}`, origin: 'craft', rarity: 'common', substats: [], upgrade: 0 });
  return { ...base, gearInstances: { ...base.gearInstances, [inst.id]: inst }, equipped: { ...base.equipped, [slot]: inst.id } };
}
const clothChest = GEAR.find((g) => g.slot === 'armor' && g.weight === 'cloth')!.id;
const leatherChest = GEAR.find((g) => g.slot === 'armor' && g.weight === 'leather')!.id;
const SWORD_PLATE = ['firm_strike', 'double_thrust', 'breach', 'iron_stance'];

// The starting club and rags are tier 0: neither a sword nor plate. Before 28/10 the "absent line = sword, absent weight = plate" default (abilities.ts) gave them the sword's and plate's techniques, and the owner
// opened Taticas with the starting gear and saw abilities. Nothing on a green screen would show it coming back (the abilities just work), so this is the guard.
describe('the starting gear grants no ability (tier 0)', () => {
  const fresh = defaultSave();
  it('a new save has no equipped ability, no rotation in force and no ability in combat', () => {
    expect(equippedAbilities(fresh)).toEqual([]);
    expect(effectiveRotation(fresh)).toEqual([]);
    expect(buildCombatStats(fresh).rotation ?? []).toEqual([]);
  });
  it('each slot counts on its own: a tier 1 sword gives the sword techniques and none from the starting rags, and a tier 1 chestpiece gives the body ones and none from the club', () => {
    const swordTier1 = GEAR.find((g) => g.slot === 'weapon' && g.tier === 1 && !g.line)!.id;
    const plateTier1 = GEAR.find((g) => g.slot === 'armor' && g.tier === 1 && !g.weight)!.id;
    expect(equippedAbilities(wear(fresh, 'weapon', swordTier1))).toEqual(['firm_strike', 'double_thrust', 'breach']);
    expect(equippedAbilities(wear(fresh, 'armor', plateTier1))).toEqual(['iron_stance']);
    expect(equippedAbilities(wear(wear(fresh, 'weapon', swordTier1), 'armor', plateTier1))).toEqual(SWORD_PLATE);
  });
});

describe('a save with no rotation is automatic', () => {
  // hero() is GEAR-ONLY (an empty rotation, for the balance tools): the player who never opened the screen is automaticRotation()
  const sword = automaticRotation(hero('2', 3, { level: 15 }));

  it('the rotation in force is the default of the worn gear, in combat stats too, and loading writes nothing', () => {
    expect('rotation' in sword).toBe(false);
    expect(effectiveRotation(sword)).toEqual(SWORD_PLATE);
    expect(effectiveRotation(sword)).toEqual(defaultRotation(grantedAbilities(undefined, undefined)));
    expect(buildCombatStats(sword).rotation).toEqual(SWORD_PLATE);
    const loaded = normalizeSave(wire(sword));
    expect('rotation' in loaded).toBe(false);
    expect(buildCombatStats(loaded).rotation).toEqual(SWORD_PLATE);
    expect(normalizeSave(wire(loaded))).toEqual(loaded);
  });

  it('it respects the equipment worn: a bow, a staff with a cloth chest, a crossbow with a leather one', () => {
    expect(effectiveRotation(automaticRotation(hero('2', 3, { level: 15, weapon: 'hunting_bow' })))).toEqual(['arrow_rain', 'opening_shot', 'true_shot', 'iron_stance']);
    expect(effectiveRotation(wear(wear(sword, 'weapon', 'oak_staff'), 'armor', clothChest))).toEqual(['arcane_burst', 'flames', 'nova', 'arcane_breath']);
    expect(effectiveRotation(wear(wear(sword, 'weapon', 'short_bow'), 'armor', leatherChest))).toEqual(['arrow_rain', 'opening_shot', 'true_shot', 'dodge']);
  });

  it('CHANGING WEAPON REPLACES THE ABILITIES AT ONCE (no reload, no field written): sword to bow to staff', () => {
    const bow = wear(sword, 'weapon', 'short_bow');
    expect(buildCombatStats(bow).rotation).toEqual(['arrow_rain', 'opening_shot', 'true_shot', 'iron_stance']);
    const staff = wear(bow, 'weapon', 'oak_staff');
    expect(buildCombatStats(staff).rotation).toEqual(['arcane_burst', 'flames', 'nova', 'iron_stance']);
    expect('rotation' in bow).toBe(false);
    expect('rotation' in staff).toBe(false);
  });

  // The order he chose is his and the gear never reshuffles it; what a gear change empties is refilled from the gear he now wears (fillRotation, 2026-10-29), instead of leaving him fighting with fewer
  // abilities than his gear grants. The stored field is untouched, so putting the old weapon back brings his own list straight back.
  it('a list a tool built keeps its order, and the places a gear change empties are refilled (a loaded save never has one)', () => {
    const chosen = { ...sword, rotation: ['iron_stance', 'firm_strike'] as AbilityId[] };
    expect(effectiveRotation(chosen)).toEqual(['iron_stance', 'firm_strike']); // nothing was cut: a short list stays short
    expect(effectiveRotation(wear(chosen, 'weapon', 'short_bow'))).toEqual(['iron_stance', 'arrow_rain', 'opening_shot', 'true_shot']);
    expect('rotation' in normalizeSave(wire({ ...sword, rotation: ['arrow_rain', 'breach', 'bogus', 'breach'] }))).toBe(false);
  });

  it('unusable stored values are dropped and the hero is automatic again', () => {
    for (const rotation of ['x', null, 3, { 0: 'firm_strike' }]) {
      const s = normalizeSave(wire({ ...sword, rotation }));
      expect('rotation' in s, JSON.stringify(rotation)).toBe(false);
      expect(effectiveRotation(s)).toEqual(SWORD_PLATE);
    }
  });

  it('an EMPTY rotation stays empty in memory (the gear-only heroes of the audits: the basic attack only), but a LOADED save with one is automatic', () => {
    const cleared = { ...sword, rotation: [] as AbilityId[] };
    expect(effectiveRotation(cleared)).toEqual([]);
    expect('rotation' in buildCombatStats(cleared)).toBe(false);
    const loaded = normalizeSave(wire(cleared));
    expect('rotation' in loaded).toBe(false);
    expect(effectiveRotation(loaded)).toEqual(SWORD_PLATE);
  });

  it('the automatic default raises the Combat Power over the same hero with an empty rotation', () => {
    expect(computeCP(sword)).toBeGreaterThan(computeCP({ ...sword, rotation: [] }));
  });
});

describe('the 21 abilities are complete and tell the truth', () => {
  it('each has a name and a callout in both languages, a flash of one of the eight looks defined in App.css, and a sane cooldown', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../App.css'), 'utf8');
    const looks = new Set<string>();
    for (const id of ABILITY_IDS) {
      const def = abilityDef(id)!;
      expect(def.effects.length, id).toBeGreaterThan(0);
      expect(def.cooldownMs, id).toBeGreaterThanOrEqual(1000);
      expect(t(`tactics.names.${id}`), id).not.toBe('');
      expect(t(`heroSkills.fx.ab_${id}`), id).not.toBe('');
      const entry = SKILL_FX[def.fx].fx;
      expect(entry.kind).toBe('css');
      if (entry.kind === 'css') {
        const look = /skfx-ab-(\w+)/.exec(entry.className)![1];
        expect(def.effects.map((e) => e.kind), `${id} flash`).toContain(look);
        expect(css, look).toContain(`.skfx-ab-${look} {`);
        looks.add(look);
      }
    }
    expect(looks.size).toBe(8);
  });

  it('each declares an icon and the file exists in public/assets/icons', () => {
    for (const id of ABILITY_IDS) {
      const icon = abilityDef(id)!.icon;
      expect(icon, id).toBe(`/assets/icons/ab_${id}.png`);
      expect(fs.existsSync(path.resolve(__dirname, '../../../public', icon.slice(1))), icon).toBe(true);
    }
  });

  it('no text promises a guaranteed critical hit: the bow and crossbow strikes are described as the heavy swings they are', () => {
    for (const lang of ['pt', 'en']) {
      const raw = fs.readFileSync(path.resolve(__dirname, `../../locales/${lang}.json`), 'utf8');
      const text = JSON.stringify((JSON.parse(raw) as { tactics: unknown }).tactics).toLowerCase();
      expect(text, lang).not.toMatch(/cr[ií]tic|crit|certeiro|always|sempre/);
    }
    for (const id of ['true_shot', 'fatal_shot'] as const) expect(abilityDef(id)!.effects.map((e) => e.kind)).toEqual(['strike']);
  });
});
