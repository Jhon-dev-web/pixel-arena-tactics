import { ConsumableId } from './consumables';
import { HUNTING_ZONES, isZoneOpen } from './huntingZones';
import { MaterialId } from './materials';

export interface PotionRecipe {
  id: ConsumableId; // what it makes
  // The recipe's own name when one item has several recipes (the Knowledge Elixir has one per Hunting zone tier); absent = the id.
  key?: string;
  input: Partial<Record<MaterialId, number>>;
  cost: number;
  requiredLevel: number;
  // Knowledge Elixir only: the recipe of THIS Hunting zone tier (1 = Clareira dos Demônios .. 4 = Abismo de Sangue). It can be made, and is listed, only while that zone is the best one
  // the hero has unlocked, so the recipe always asks for the rare drop of the zone the hero hunts and stays relevant as the hero climbs.
  zoneTier?: number;
}

export const potionRecipeKey = (r: PotionRecipe): string => r.key ?? r.id;

// The Knowledge Elixir has one recipe per zone of the first four; zone 5 (phase 7 of the classes reform) has none of its own, so a hero there keeps making the tier-4 recipe instead of losing the elixir.
// The count is limited ON PURPOSE to the first four zones: the elixir has recipes only up to T4 (see POTION recipes below). Do not widen it without adding the T5 recipe (knowledgeElixir.test.ts guards it).
const KNOWLEDGE_ELIXIR_TIERS = 4;

// The best Hunting zone the hero has opened (Dungeon floor AND hero level), 1..4 (the order of HUNTING_ZONES is the order they unlock in; a fifth zone counts as the fourth here).
export function bestZoneTier(highestDungeonFloor: number, heroLevel: number): number {
  let tier = 1;
  HUNTING_ZONES.slice(0, KNOWLEDGE_ELIXIR_TIERS).forEach((z, i) => {
    if (isZoneOpen(z, highestDungeonFloor, heroLevel)) tier = i + 1;
  });
  return tier;
}

// Can the hero make this recipe now as far as the zone tier goes? (Every recipe without a tier always can.)
export const potionRecipeInTier = (r: PotionRecipe, highestDungeonFloor: number, heroLevel: number): boolean => r.zoneTier === undefined || r.zoneTier === bestZoneTier(highestDungeonFloor, heroLevel);

// Alchemy consumables — Garden herbs are the primary ingredient, tying the two systems together
// (see garden.ts). Unlike Shop potions (flat gold, always available), these scale with how much
// Garden/Hunting effort the player has put in, matching the "Loja = básico, Forja = melhor" split.
//
// Garden 2.0: every Garden material has a consumer here. Herbs feed the cheap potions (Medicinal Herb -> small HP, Energy
// Herb -> the Haste Tonic), roots / mushrooms the healing ones, the flower the timed buff. The two health potions can also be
// bought in the Shop; crafting them is the slower, cheaper route (gold cost ~60% of the Shop price, plus the plants), so
// nothing here is a Gold faucet (consumables cannot be sold) and Shop stays the instant, unlimited option.
export const POTION_RECIPES: PotionRecipe[] = [
  { id: 'small_hp', input: { common_herb: 3 }, cost: 18, requiredLevel: 1 },
  { id: 'greater_elixir', input: { uncommon_root: 2 }, cost: 100, requiredLevel: 15 },
  { id: 'large_hp', input: { crimson_mushroom: 2 }, cost: 48, requiredLevel: 25 },
  { id: 'strength_elixir', input: { rare_flower: 1, demon_claw: 2 }, cost: 250, requiredLevel: 35 },
  // Garden 3.0 (buffs.ts / elixirs.ts / gardenActions.ts): every new plant has a tonic or a gear recipe; none of these is in the Shop.
  { id: 'fertilizer', input: { bone_fragment: 3, common_herb: 2 }, cost: 25, requiredLevel: 1 },
  { id: 'stoneskin_tonic', input: { iron_thistle: 3, bone_fragment: 2 }, cost: 60, requiredLevel: 10 },
  { id: 'whetstone_oil', input: { iron_thistle: 2, leather_scrap: 2 }, cost: 40, requiredLevel: 10 },
  { id: 'gatherer_brew', input: { swift_grass: 2, common_herb: 3 }, cost: 50, requiredLevel: 1 },
  { id: 'fortune_tonic', input: { gold_blossom: 2, common_herb: 2 }, cost: 80, requiredLevel: 20 },
  { id: 'haste_tonic', input: { swift_grass: 3, energy_herb: 2 }, cost: 90, requiredLevel: 30 },
  { id: 'precision_elixir', input: { moon_lily: 1, corrupted_crystal: 1 }, cost: 220, requiredLevel: 45 },
  // Round 12 (docs/BALANCE_CHANGES.md, Rodada 12): a recurring sink for the materials that pile up (iron, silver, the woods, bone, blood, crystal, the garden produce) and a use for every
  // ingredient that had only one. The three plants of Gardening 50 / 60 / 70 (silver_sage, dusk_orchid, elder_root) are needed by the late recipes. Gold stays small: the cost is the materials.
  { id: 'repair_kit', input: { iron: 4, common_wood: 4, bone_fragment: 2 }, cost: 40, requiredLevel: 10 },
  { id: 'prospector_tonic', input: { silver: 1, oak_wood: 2, iron_thistle: 2, gold_blossom: 1 }, cost: 60, requiredLevel: 1 },
  { id: 'hunter_lure', input: { concentrated_blood: 3, swift_grass: 2, uncommon_root: 1 }, cost: 90, requiredLevel: 30 },
  { id: 'sharpening_stone', input: { gold_ore: 1, iron: 3, silver_sage: 1, corrupted_crystal: 1 }, cost: 80, requiredLevel: 45 },
  { id: 'master_repair_kit', input: { silver: 3, ebony_wood: 3, concentrated_blood: 3, elder_root: 1, moon_lily: 1 }, cost: 120, requiredLevel: 60 },
  { id: 'armor_polish', input: { obsidian: 1, elven_wood: 1, ancient_wood: 1, dusk_orchid: 1, rare_flower: 1, corrupted_crystal: 2 }, cost: 150, requiredLevel: 65 },
  // Rodada 22: Gold was worth almost nothing at the end of the League (an owner held 25,000 to 40,000 Gold at day 60 with nothing to buy), so the Knowledge Elixir asks real Gold now: 77 / 135 / 192 / 250
  // (it was 20 / 35 / 50 / 65, the last tier's 65 scaled by 250 / 65 for the others). An owner who keeps it up makes 40 to 60 of them in the season: 9,000 to 15,000 Gold (it was 2,700 to 3,800).
  // Rodada 20: the Knowledge Elixir (+25% Hunting XP for 4 h, one at a time). One recipe per Hunting zone tier, only the one of the best open zone is listed; each asks for ~20 plot-hours
  // of the late Garden plants (Gardening 45 to 60: the moon lily, silver sage and dusk orchid), a rare drop of that zone (never the Fiend Horn / Blood Heart: the tier 5 and 6 gear needs them) and Gold. Never in the Shop, never on
  // the Pass. docs/BALANCE_CHANGES.md Rodada 20 has the cost of keeping it up all day.
  { id: 'knowledge_elixir', key: 'knowledge_elixir_t1', zoneTier: 1, input: { moon_lily: 2, demon_core: 1 }, cost: 77, requiredLevel: 30 },
  { id: 'knowledge_elixir', key: 'knowledge_elixir_t2', zoneTier: 2, input: { moon_lily: 1, silver_sage: 3, corrupted_crystal: 1 }, cost: 135, requiredLevel: 40 },
  { id: 'knowledge_elixir', key: 'knowledge_elixir_t3', zoneTier: 3, input: { dusk_orchid: 1, silver_sage: 2, demon_core: 2 }, cost: 192, requiredLevel: 50 },
  { id: 'knowledge_elixir', key: 'knowledge_elixir_t4', zoneTier: 4, input: { dusk_orchid: 2, corrupted_crystal: 2 }, cost: 250, requiredLevel: 60 },
];

// By recipe key (the id for every recipe that has only one).
export function getPotionRecipe(key: string): PotionRecipe | undefined {
  return POTION_RECIPES.find((r) => potionRecipeKey(r) === key);
}
