import { describe, expect, it } from 'vitest';
import { GEAR } from '../gear';
import { FORGE_CLASS_FILTERS, forgeClassOf, matchesForgeClass } from '../../components/forgeFilter';

// The Forge's class filter (classes reform, phase 7): the class of a piece comes from what it is made of. A missing `weight` is plate, a missing `line` is sword.
const recipes = GEAR.filter((g) => g.recipe && !g.unique);
const byId = (id: string) => GEAR.find((g) => g.id === id)!;

describe('the class of a piece', () => {
  it('plate and sword / axe are the warrior\'s, leather and bow / crossbow the archer\'s, cloth and staff / scepter the mage\'s', () => {
    expect(forgeClassOf(byId('steel_plate'))).toBe('warrior');
    expect(forgeClassOf(byId('iron_helm'))).toBe('warrior');
    expect(forgeClassOf(byId('iron_shield'))).toBe('warrior');
    expect(forgeClassOf(byId('ranger_leather'))).toBe('archer');
    expect(forgeClassOf(byId('hide_quiver'))).toBe('archer');
    expect(forgeClassOf(byId('long_bow'))).toBe('archer');
    expect(forgeClassOf(byId('steel_crossbow'))).toBe('archer');
    expect(forgeClassOf(byId('silk_vestment'))).toBe('mage');
    expect(forgeClassOf(byId('apprentice_tome'))).toBe('mage');
    expect(forgeClassOf(byId('ebony_staff'))).toBe('mage');
    expect(forgeClassOf(byId('silver_scepter'))).toBe('mage');
    for (const g of GEAR.filter((x) => x.slot === 'weapon' && (x.line === undefined || x.line === 'sword' || x.line === 'axe'))) expect(forgeClassOf(g), g.id).toBe('warrior');
  });

  it('rings and relics belong to no class: they show under every filter', () => {
    for (const g of GEAR.filter((x) => x.slot === 'ring' || x.slot === 'relic')) {
      expect(forgeClassOf(g), g.id).toBeNull();
      for (const f of FORGE_CLASS_FILTERS) expect(matchesForgeClass(g, f), `${g.id} ${f}`).toBe(true);
    }
  });
});

describe('the filter is a view: "all" shows every recipe, and the three classes split the weights', () => {
  it('"all" hides nothing', () => {
    for (const g of recipes) expect(matchesForgeClass(g, 'all'), g.id).toBe(true);
  });

  it('every armor-slot and weapon recipe belongs to exactly one class, and the 84 new pieces split 42 / 42', () => {
    const classed = recipes.filter((g) => forgeClassOf(g) !== null);
    for (const g of classed) expect(['warrior', 'archer', 'mage'].filter((c) => matchesForgeClass(g, c as 'warrior' | 'archer' | 'mage')), g.id).toHaveLength(1);
    expect(classed.filter((g) => forgeClassOf(g) === 'archer' && (g.weight || g.line))).toHaveLength(42);
    expect(classed.filter((g) => forgeClassOf(g) === 'mage')).toHaveLength(42);
  });
});
