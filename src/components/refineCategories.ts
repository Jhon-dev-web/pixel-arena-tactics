import { RefiningStation } from '../game/refining';

// The 5 tabs of Ofícios. The 'alchemy' tab lists the potion recipes (POTION_RECIPES, not a RefiningRecipe
// station) first and the station's two transmutation recipes below them, as two groups of one list.
export const REFINE_CATEGORIES: { id: RefiningStation; titleKey: string }[] = [
  { id: 'furnace', titleKey: 'furnaceSection' },
  { id: 'tannery', titleKey: 'tannerySection' },
  { id: 'alchemy', titleKey: 'alchemySection' },
  { id: 'carpentry', titleKey: 'carpentrySection' },
  { id: 'dust', titleKey: 'dustSection' },
];
