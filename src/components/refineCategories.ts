import { RefiningStation } from '../game/refining';

// The 6 processing categories shown as their own section in ForgeModal's "Refino" tab (mobile,
// unchanged), and as their own tab in OficiosModal (desktop). 'potions' isn't a RefiningRecipe
// station — it has its own POTION_RECIPES list — but is shown alongside the others either way.
export const REFINE_CATEGORIES: { id: RefiningStation | 'potions'; titleKey: string }[] = [
  { id: 'furnace', titleKey: 'furnaceSection' },
  { id: 'tannery', titleKey: 'tannerySection' },
  { id: 'alchemy', titleKey: 'alchemySection' },
  { id: 'carpentry', titleKey: 'carpentrySection' },
  { id: 'dust', titleKey: 'dustSection' },
  { id: 'potions', titleKey: 'potionsSection' },
];
