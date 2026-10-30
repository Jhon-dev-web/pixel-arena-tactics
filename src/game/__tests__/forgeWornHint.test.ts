import { describe, expect, it } from 'vitest';
import { defaultSave, SaveData } from '../engine';
import { getGear } from '../gear';
import { applyUnequipSlot, createGearInstance, planForgeIngredients } from '../gearInstances';
import { wornIngredientHints } from '../../components/forgeWornHint';
import en from '../../locales/en.json';
import pt from '../../locales/pt.json';

// The forge skips WORN pieces as ingredients. The note on the recipe row must show exactly when taking the piece off is what makes the forge possible, and never otherwise.

const RECIPE_2 = getGear('iron_short_sword'); // needs 2x bronze_dagger
const RECIPE_1 = getGear('steel_greatsword'); // needs 1x iron_short_sword

function withPieces(templateId: string, ids: string[], wornId: string | null): SaveData {
  const save = defaultSave();
  const gearInstances = { ...save.gearInstances };
  for (const id of ids) gearInstances[id] = createGearInstance(templateId, { id, origin: 'craft', rarity: 'common', substats: [] });
  const slot = getGear(templateId).slot as 'weapon';
  return { ...save, gearInstances, equipped: { ...save.equipped, [slot]: wornId } };
}

describe('wornIngredientHints', () => {
  it('shows the note when the only copy is worn, and taking it off really unblocks the forge', () => {
    const s = withPieces('iron_short_sword', ['a'], 'a');
    expect(wornIngredientHints(s, RECIPE_1).map((h) => h.templateId)).toEqual(['iron_short_sword']);
    expect(planForgeIngredients(s, RECIPE_1)).toBeNull();
    expect(planForgeIngredients(applyUnequipSlot(s, 'weapon'), RECIPE_1)).not.toBeNull();
  });

  it('hides it when a free copy already covers the recipe', () => {
    const s = withPieces('iron_short_sword', ['a', 'b'], 'a');
    expect(wornIngredientHints(s, RECIPE_1)).toEqual([]);
    expect(planForgeIngredients(s, RECIPE_1)).not.toBeNull();
  });

  it('hides it when the hero does not wear the piece (plain shortage)', () => {
    expect(wornIngredientHints(withPieces('iron_short_sword', [], null), RECIPE_1)).toEqual([]);
    expect(wornIngredientHints(withPieces('iron_short_sword', ['a'], null), RECIPE_1)).toEqual([]);
  });

  it('partial copies: 2 asked, 1 free + 1 worn shows it; 2 asked, 0 free + 1 worn does not (taking it off would not be enough)', () => {
    const partial = withPieces('bronze_dagger', ['a', 'b'], 'a');
    expect(wornIngredientHints(partial, RECIPE_2)).toEqual([{ templateId: 'bronze_dagger', need: 2, free: 1, worn: 1 }]);
    expect(planForgeIngredients(partial, RECIPE_2)).toBeNull();
    expect(planForgeIngredients(applyUnequipSlot(partial, 'weapon'), RECIPE_2)).not.toBeNull();
    expect(wornIngredientHints(withPieces('bronze_dagger', ['a'], 'a'), RECIPE_2)).toEqual([]);
  });

  it('has the text in both languages, with the same meaning', () => {
    expect(pt.forge.wornIngredient).toMatch(/vestida.*tire/);
    expect(en.forge.wornIngredient).toMatch(/wear.*take it off/);
  });
});
