import { describe, expect, it } from 'vitest';
import { REFINE_CATEGORIES } from '../../components/refineCategories';
import { POTION_RECIPES } from '../potions';
import { refiningRecipesForStation } from '../refining';
import en from '../../locales/en.json';
import pt from '../../locales/pt.json';

describe('Ofícios: Poções merged into Alquimia', () => {
  it('has no separate potions tab; Alquimia is one of the station tabs', () => {
    const ids: string[] = REFINE_CATEGORIES.map((c) => c.id);
    expect(ids).not.toContain('potions');
    expect(ids).toContain('alchemy');
  });

  it('the alchemy tab still has both potion recipes and the two transmutations', () => {
    expect(POTION_RECIPES.length).toBeGreaterThan(0);
    expect(refiningRecipesForStation('alchemy').map((r) => r.id).sort()).toEqual(['synth_dragon_scales', 'synth_essence']);
  });

  it('has the two sub-heading texts in pt and en', () => {
    expect(pt.oficios.groupPotions).toBe('Poções');
    expect(pt.oficios.groupTransmutation).toBe('Transmutação');
    expect(en.oficios.groupPotions).toBe('Potions');
    expect(en.oficios.groupTransmutation).toBe('Transmutation');
  });
});
