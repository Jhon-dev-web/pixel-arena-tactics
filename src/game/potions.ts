import { ConsumableId } from './consumables';
import { MaterialId } from './materials';

export interface PotionRecipe {
  id: ConsumableId;
  input: Partial<Record<MaterialId, number>>;
  cost: number;
  requiredLevel: number;
}

// Alchemy consumables — Garden herbs are the primary ingredient, tying the two systems together
// (see garden.ts). Unlike Shop potions (flat gold, always available), these scale with how much
// Garden/Hunting effort the player has put in, matching the "Loja = básico, Forja = melhor" split.
//
// Garden 2.0: every Garden material has a consumer here. Herbs feed the cheap potions (Medicinal Herb -> small HP, Energy
// Herb -> Knowledge), roots / mushrooms the healing ones, the flower the timed buff. The two health potions can also be
// bought in the Shop; crafting them is the slower, cheaper route (gold cost ~60% of the Shop price, plus the plants), so
// nothing here is a Gold faucet (consumables cannot be sold) and Shop stays the instant, unlimited option.
export const POTION_RECIPES: PotionRecipe[] = [
  { id: 'xp_potion', input: { energy_herb: 3 }, cost: 30, requiredLevel: 1 },
  { id: 'small_hp', input: { common_herb: 3 }, cost: 18, requiredLevel: 1 },
  { id: 'greater_elixir', input: { uncommon_root: 2 }, cost: 100, requiredLevel: 15 },
  { id: 'large_hp', input: { crimson_mushroom: 2 }, cost: 48, requiredLevel: 25 },
  { id: 'strength_elixir', input: { rare_flower: 1, demon_claw: 2 }, cost: 250, requiredLevel: 35 },
  // Garden 3.0 (buffs.ts / elixirs.ts / gardenActions.ts): every new plant has a tonic or a gear recipe; none of these is in the Shop.
  { id: 'fertilizer', input: { bone_fragment: 3, common_herb: 2 }, cost: 25, requiredLevel: 5 },
  { id: 'stoneskin_tonic', input: { iron_thistle: 3, bone_fragment: 2 }, cost: 60, requiredLevel: 10 },
  { id: 'whetstone_oil', input: { iron_thistle: 2, leather_scrap: 2 }, cost: 40, requiredLevel: 10 },
  { id: 'gatherer_brew', input: { swift_grass: 2, common_herb: 3 }, cost: 50, requiredLevel: 15 },
  { id: 'fortune_tonic', input: { gold_blossom: 2, common_herb: 2 }, cost: 80, requiredLevel: 20 },
  { id: 'haste_tonic', input: { swift_grass: 3, energy_herb: 2 }, cost: 90, requiredLevel: 30 },
  { id: 'precision_elixir', input: { moon_lily: 1, corrupted_crystal: 1 }, cost: 220, requiredLevel: 45 },
  // Round 12 (docs/BALANCE_CHANGES.md, Rodada 12): a recurring sink for the materials that pile up (iron, silver, the woods, bone, blood, crystal, the garden produce) and a use for every
  // ingredient that had only one. The three plants of Gardening 50 / 60 / 70 (silver_sage, dusk_orchid, elder_root) are needed by the late recipes. Gold stays small: the cost is the materials.
  { id: 'repair_kit', input: { iron: 4, common_wood: 4, bone_fragment: 2 }, cost: 40, requiredLevel: 10 },
  { id: 'prospector_tonic', input: { silver: 1, oak_wood: 2, iron_thistle: 2, gold_blossom: 1 }, cost: 60, requiredLevel: 20 },
  { id: 'hunter_lure', input: { concentrated_blood: 3, swift_grass: 2, uncommon_root: 1 }, cost: 90, requiredLevel: 30 },
  { id: 'sharpening_stone', input: { gold_ore: 1, iron: 3, silver_sage: 1, corrupted_crystal: 1 }, cost: 80, requiredLevel: 45 },
  { id: 'master_repair_kit', input: { silver: 3, ebony_wood: 3, concentrated_blood: 3, elder_root: 1, moon_lily: 1 }, cost: 120, requiredLevel: 60 },
  { id: 'armor_polish', input: { obsidian: 1, elven_wood: 1, ancient_wood: 1, dusk_orchid: 1, rare_flower: 1, corrupted_crystal: 2 }, cost: 150, requiredLevel: 65 },
];

export function getPotionRecipe(id: string): PotionRecipe | undefined {
  return POTION_RECIPES.find((r) => r.id === id);
}
