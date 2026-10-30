import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import ForgeView from '../../components/ForgeModal';
import { earlierRecipeIds, forgeableRecipes } from '../../components/forgeFold';
import { defaultForgeClass, forgeClassOf } from '../../components/forgeFilter';
import { setLocale, t } from '../../locales';
import { defaultSave, SaveData, xpToReachLevel } from '../engine';
import { getGear, GearSlot, isInstancedSlot } from '../gear';
import { createGearInstance } from '../gearInstances';

// The Forge list folds the recipes the hero has moved past into "Anteriores (n)". It is a view, and the one way it can go wrong without any sign on the screen is hiding a piece the hero still needs: the previous tier is
// an INGREDIENT of the next recipe, and a hero changing class starts a whole other line from tier 1. These guards pin that.

const all = forgeableRecipes();
const LEVELS = [1, 10, 25, 40, 50, 70, 90, 100];

function holding(templateIds: string[], worn: string[] = []): Pick<SaveData, 'gearInstances' | 'equipped' | 'stats'> {
  const base = defaultSave();
  const gearInstances: SaveData['gearInstances'] = {};
  const equipped = { ...base.equipped, weapon: null, armor: null, helmet: null, gloves: null, boots: null, shield: null, ring: null, relic: null } as SaveData['equipped'];
  templateIds.forEach((tpl, i) => {
    const id = `gi_${tpl}_${i}`;
    gearInstances[id] = createGearInstance(tpl, { id, origin: 'craft', rarity: 'common', substats: [] });
    if (worn.includes(tpl)) (equipped as unknown as Record<GearSlot, string | null>)[getGear(tpl).slot] = id;
  });
  return { gearInstances, equipped, stats: base.stats };
}

describe('the fold hides nothing from a hero with nothing in hand', () => {
  it('at every level, an empty-handed hero has no recipe behind the fold (every tier of every line, so a class change shows the whole other line)', () => {
    for (const level of LEVELS) expect([...earlierRecipeIds(holding([]), level)], `level ${level}`).toEqual([]);
  });
});

describe('what the fold keeps for a hero who climbs a chain', () => {
  // sword chain: bronze_dagger (x2) -> iron_short_sword -> steel_greatsword (level 25) -> gilded_warblade (level 50)
  it('holding the ingredient keeps it and the target, and folds only the tier before it', () => {
    const earlier = earlierRecipeIds(holding(['iron_short_sword']), 40);
    expect(earlier.has('bronze_dagger')).toBe(true);
    expect(earlier.has('iron_short_sword')).toBe(false);
    expect(earlier.has('steel_greatsword')).toBe(false);
  });

  it('holding only ONE of the TWO daggers the next recipe asks for keeps the dagger: the hero still has to forge it', () => {
    const earlier = earlierRecipeIds(holding(['bronze_dagger']), 15); // level 15: iron_short_sword (level 10) is the top of the chain and takes 2 daggers
    expect(earlier.has('bronze_dagger')).toBe(false);
  });

  it('a WORN ingredient counts as held (the Forge tells the hero to take it off), so the tier before it folds', () => {
    const earlier = earlierRecipeIds(holding(['iron_short_sword'], ['iron_short_sword']), 40);
    expect(earlier.has('iron_short_sword')).toBe(false);
    expect(earlier.has('bronze_dagger')).toBe(true);
  });

  it('a hero who owns the top recipe of his level folds the two tiers below it and never a tier his level has not opened', () => {
    const earlier = earlierRecipeIds(holding(['steel_greatsword'], ['steel_greatsword']), 40);
    expect([...earlier].filter((id) => getGear(id).line === undefined && getGear(id).slot === 'weapon').sort()).toEqual(['bronze_dagger', 'iron_short_sword']);
    for (const id of earlier) expect(getGear(id).recipe?.requiredLevel ?? 0, id).toBeLessThanOrEqual(40);
    for (const id of ['gilded_warblade', 'dragon_flameblade', 'voidsteel_blade', 'abyssal_greatblade']) expect(earlier.has(id), id).toBe(false);
  });

  it('never folds the top recipe of a chain the level opens, and never a recipe the level has not opened', () => {
    for (const level of LEVELS) {
      for (const owned of [[], ['steel_greatsword'], ['steel_plate', 'steel_helm', 'steel_gauntlets', 'steel_greaves', 'steel_kite_shield']]) {
        const earlier = earlierRecipeIds(holding(owned), level);
        for (const id of earlier) expect(getGear(id).recipe?.requiredLevel ?? 0, `${id} at ${level}`).toBeLessThanOrEqual(level);
        const takenByOpen = new Set(all.filter((g) => (g.recipe?.requiredLevel ?? 0) <= level).flatMap((g) => Object.keys(g.recipe?.items ?? {})));
        for (const g of all) if ((g.recipe?.requiredLevel ?? 0) <= level && !takenByOpen.has(g.id)) expect(earlier.has(g.id), `${g.id} at ${level}`).toBe(false);
      }
    }
  });
});

// The property that would break silently: a recipe the hero still has to forge (open, not folded, none in hand) must show every piece it takes. Checked for a hero holding any single piece of the game, at every level.
describe('a piece that is an ingredient of a recipe the hero still has to forge stays reachable', () => {
  it('for any single piece held and any level, no direct ingredient of an unforged, unfolded, open recipe is folded', () => {
    let checked = 0;
    for (const level of LEVELS) {
      for (const held of [null, ...all.filter((g) => isInstancedSlot(g.slot)).map((g) => g.id)]) {
        const save = holding(held ? [held] : []);
        const earlier = earlierRecipeIds(save, level);
        for (const r of all) {
          if ((r.recipe?.requiredLevel ?? 0) > level || earlier.has(r.id) || r.id === held) continue;
          for (const ing of Object.keys(r.recipe?.items ?? {})) {
            if (!all.some((g) => g.id === ing)) continue;
            checked++;
            expect(earlier.has(ing), `${ing} (ingredient of ${r.id}) at level ${level} holding ${held}`).toBe(false);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1000); // the loop above really exercised the rule
  });

  it('a warrior who holds only warrior gear never has a piece of the archer or mage lines folded', () => {
    const warriorGear = all.filter((g) => forgeClassOf(g) === 'warrior' && ['weapon', 'armor', 'helmet', 'gloves', 'boots', 'shield'].includes(g.slot)).map((g) => g.id);
    for (const level of LEVELS) {
      const earlier = earlierRecipeIds(holding(warriorGear), level);
      for (const id of earlier) expect(forgeClassOf(getGear(id)), `${id} at ${level}`).not.toBe('archer');
      for (const id of earlier) expect(forgeClassOf(getGear(id)), `${id} at ${level}`).not.toBe('mage');
    }
  });
});

describe('the class the Forge opens on', () => {
  it('a hero in a full set of one weight opens on that class, and a fresh or mixed hero opens on All', () => {
    expect(defaultForgeClass(holding(['steel_plate', 'steel_helm', 'steel_gauntlets', 'steel_greaves', 'steel_kite_shield'], ['steel_plate', 'steel_helm', 'steel_gauntlets', 'steel_greaves', 'steel_kite_shield']))).toBe('warrior');
    const mage = all.filter((g) => forgeClassOf(g) === 'mage' && g.slot !== 'weapon' && g.slot !== 'ring' && g.slot !== 'relic' && g.tier === 1).map((g) => g.id);
    expect(mage.length).toBeGreaterThanOrEqual(3);
    expect(defaultForgeClass(holding(mage, mage))).toBe('mage');
    expect(defaultForgeClass(defaultSave())).toBe('all');
    expect(defaultForgeClass(holding([]))).toBe('all');
  });
});

describe('the list on the screen', () => {
  beforeEach(() => setLocale('pt'));
  const noop = () => undefined;
  const render = (save: SaveData, focusItemId?: string): string =>
    renderToStaticMarkup(h(ForgeView, { save, onForge: noop, onUpgrade: noop, onUpgradeWithCatalyst: noop, onRepair: noop, onSocket: noop, onUnsocket: noop, focusItemId }));
  const steelHero = (): SaveData => {
    const pieces = ['steel_greatsword', 'steel_plate', 'steel_helm', 'steel_gauntlets', 'steel_greaves', 'steel_kite_shield'];
    const held = holding(pieces, pieces);
    return { ...defaultSave(), xp: xpToReachLevel(40), gearInstances: held.gearInstances, equipped: held.equipped };
  };

  it('opens on the hero\'s class with the tiers he moved past behind "Anteriores (2)", and says how many', () => {
    const html = render(steelHero());
    expect(html).toContain(t('forge.earlier', { n: 2 }));
    expect(html).toContain('data-recipe-id="steel_greatsword"');
    expect(html).not.toContain('data-recipe-id="bronze_dagger"');
    expect(html).not.toContain('data-recipe-id="short_bow"'); // the archer line is one tap away, not on the first screen
    expect(html).toContain('aria-pressed="true"'); // the class chip carries the choice
  });

  it('a recipe brought in by "Usar em..." is on screen even when it sits in the fold, and the other lines are on offer', () => {
    const html = render(steelHero(), 'bronze_dagger');
    expect(html).toContain('data-recipe-id="bronze_dagger"');
  });

  it('a hero with nothing in hand sees the whole first tier on the list, no fold', () => {
    const html = render({ ...defaultSave(), xp: xpToReachLevel(40) });
    expect(html).not.toContain('fg-earlier');
    expect(html).toContain('data-recipe-id="bronze_dagger"');
  });

  it('has the fold label in both languages', () => {
    for (const lang of ['pt', 'en'] as const) {
      setLocale(lang);
      expect(t('forge.earlier', { n: 3 })).toContain('3');
      expect(t('forge.earlier', { n: 3 })).not.toBe('forge.earlier');
    }
  });
});
