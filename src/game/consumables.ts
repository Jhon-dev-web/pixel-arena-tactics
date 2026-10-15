export type ConsumableId =
  | 'small_hp'
  | 'large_hp'
  | 'atk_elixir'
  | 'refine_catalyst'
  | 'expedition_ticket_1h'
  | 'expedition_ticket_2h'
  | 'expedition_ticket_4h'
  | 'knowledge_elixir'
  | 'greater_elixir'
  | 'strength_elixir'
  | 'stoneskin_tonic'
  | 'fortune_tonic'
  | 'haste_tonic'
  | 'gatherer_brew'
  | 'precision_elixir'
  | 'whetstone_oil'
  | 'fertilizer'
  | 'repair_kit'
  | 'master_repair_kit'
  | 'sharpening_stone'
  | 'armor_polish'
  | 'hunter_lure'
  | 'prospector_tonic'
  | 'forge_seal'
  | 'stash_deed'
  | 'gold_pouch_s'
  | 'gold_pouch_m'
  | 'gold_pouch_l';

export interface ConsumableDef {
  id: ConsumableId;
  nameKey: string;
  descKey: string;
  icon: string;
  iconUrl?: string;
  cost: number;
  sellValue: number;
  // Shop-purchasable consumables are the everyday gold sink; Battle Pass premium consumables
  // (catalysts, expedition tickets) are reward-only — buying them would undercut the pass as the
  // deflationary/exclusive-value vector, so they're excluded from the Shop listing and unsellable.
  purchasable: boolean;
}

export const CONSUMABLE_STACK = 20;

// Skip amount applied to an active Expedition's remaining time when a ticket is used.
export const EXPEDITION_TICKET_SKIP_MS: Partial<Record<ConsumableId, number>> = {
  expedition_ticket_1h: 1 * 60 * 60 * 1000,
  expedition_ticket_2h: 2 * 60 * 60 * 1000,
  expedition_ticket_4h: 4 * 60 * 60 * 1000,
};

export const CONSUMABLES: ConsumableDef[] = [
  { id: 'small_hp', nameKey: 'small_hp', descKey: 'small_hp_d', icon: '🧪', iconUrl: '/assets/icons/potion_small_hp.png', cost: 30, sellValue: 12, purchasable: true },
  { id: 'large_hp', nameKey: 'large_hp', descKey: 'large_hp_d', icon: '🧪', iconUrl: '/assets/icons/potion_large_hp.png', cost: 80, sellValue: 32, purchasable: true },
  { id: 'atk_elixir', nameKey: 'atk_elixir', descKey: 'atk_elixir_d', icon: '⚔️', iconUrl: '/assets/icons/potion_atk_elixir.png', cost: 120, sellValue: 48, purchasable: true },
  { id: 'refine_catalyst', nameKey: 'refine_catalyst', descKey: 'refine_catalyst_d', icon: '⚗️', iconUrl: '/assets/icons/refine_catalyst.png', cost: 0, sellValue: 0, purchasable: false },
  { id: 'expedition_ticket_1h', nameKey: 'expedition_ticket_1h', descKey: 'expedition_ticket_1h_d', icon: '⏱️', iconUrl: '/assets/icons/expedition_ticket_1h.png', cost: 0, sellValue: 0, purchasable: false },
  { id: 'expedition_ticket_2h', nameKey: 'expedition_ticket_2h', descKey: 'expedition_ticket_2h_d', icon: '⏱️', iconUrl: '/assets/icons/expedition_ticket_2h.png', cost: 0, sellValue: 0, purchasable: false },
  { id: 'expedition_ticket_4h', nameKey: 'expedition_ticket_4h', descKey: 'expedition_ticket_4h_d', icon: '⏱️', iconUrl: '/assets/icons/expedition_ticket_4h.png', cost: 0, sellValue: 0, purchasable: false },
  // Alchemy-only (Forja > Refino > Alquimia) — never sold in the Shop, craft-tier consumables that
  // scale with player effort (Garden growing time) instead of flat gold like the Shop potions.
  // The Knowledge Elixir (Rodada 20): +25% Hunting XP for 4 h, crafted from high-level Garden plants + the rare drop of the best open zone + a lot of Gold (potions.ts). Never in the
  // Shop, never on the Pass track, and the merchants do not buy it (sellValue 0): it is an XP buff, not a source of Gold.
  { id: 'knowledge_elixir', nameKey: 'knowledge_elixir', descKey: 'knowledge_elixir_d', icon: '📘', iconUrl: '/assets/icons/xp_potion.png', cost: 0, sellValue: 0, purchasable: false },
  { id: 'greater_elixir', nameKey: 'greater_elixir', descKey: 'greater_elixir_d', icon: '💚', iconUrl: '/assets/icons/greater_elixir.png', cost: 0, sellValue: 60, purchasable: false },
  { id: 'strength_elixir', nameKey: 'strength_elixir', descKey: 'strength_elixir_d', icon: '🔥', iconUrl: '/assets/icons/strength_elixir.png', cost: 0, sellValue: 120, purchasable: false },
  // Garden 3.0 (potions.ts recipes, buffs.ts effects): Alchemy-only like the ones above, never in the Shop.
  { id: 'stoneskin_tonic', nameKey: 'stoneskin_tonic', descKey: 'stoneskin_tonic_d', icon: '🪨', iconUrl: '/assets/icons/stoneskin_tonic.png', cost: 0, sellValue: 25, purchasable: false },
  { id: 'fortune_tonic', nameKey: 'fortune_tonic', descKey: 'fortune_tonic_d', icon: '💰', iconUrl: '/assets/icons/fortune_tonic.png', cost: 0, sellValue: 30, purchasable: false },
  { id: 'haste_tonic', nameKey: 'haste_tonic', descKey: 'haste_tonic_d', icon: '💨', iconUrl: '/assets/icons/haste_tonic.png', cost: 0, sellValue: 35, purchasable: false },
  { id: 'gatherer_brew', nameKey: 'gatherer_brew', descKey: 'gatherer_brew_d', icon: '🍵', iconUrl: '/assets/icons/gatherer_brew.png', cost: 0, sellValue: 20, purchasable: false },
  { id: 'precision_elixir', nameKey: 'precision_elixir', descKey: 'precision_elixir_d', icon: '🎯', iconUrl: '/assets/icons/precision_elixir.png', cost: 0, sellValue: 80, purchasable: false },
  { id: 'whetstone_oil', nameKey: 'whetstone_oil', descKey: 'whetstone_oil_d', icon: '🛢️', iconUrl: '/assets/icons/whetstone_oil.png', cost: 0, sellValue: 15, purchasable: false },
  { id: 'fertilizer', nameKey: 'fertilizer', descKey: 'fertilizer_d', icon: '🌱', iconUrl: '/assets/icons/fertilizer.png', cost: 0, sellValue: 8, purchasable: false },
  // Round 12 (potions.ts recipes, buffs.ts / elixirs.ts effects, T.consumables): Alchemy-only, never in the Shop. Their art is pending (iconPending.ts).
  { id: 'repair_kit', nameKey: 'repair_kit', descKey: 'repair_kit_d', icon: '🧰', iconUrl: '/assets/icons/repair_kit.png', cost: 0, sellValue: 20, purchasable: false },
  { id: 'master_repair_kit', nameKey: 'master_repair_kit', descKey: 'master_repair_kit_d', icon: '🛠️', iconUrl: '/assets/icons/master_repair_kit.png', cost: 0, sellValue: 60, purchasable: false },
  { id: 'sharpening_stone', nameKey: 'sharpening_stone', descKey: 'sharpening_stone_d', icon: '🗡️', iconUrl: '/assets/icons/sharpening_stone.png', cost: 0, sellValue: 40, purchasable: false },
  { id: 'armor_polish', nameKey: 'armor_polish', descKey: 'armor_polish_d', icon: '✨', iconUrl: '/assets/icons/armor_polish.png', cost: 0, sellValue: 70, purchasable: false },
  { id: 'hunter_lure', nameKey: 'hunter_lure', descKey: 'hunter_lure_d', icon: '🪤', iconUrl: '/assets/icons/hunter_lure.png', cost: 0, sellValue: 25, purchasable: false },
  { id: 'prospector_tonic', nameKey: 'prospector_tonic', descKey: 'prospector_tonic_d', icon: '⛏️', iconUrl: '/assets/icons/prospector_tonic.png', cost: 0, sellValue: 25, purchasable: false },
  // Adventurer Pass track rewards (seasonItems.ts): reward-only, never bought and never sold (sellValue 0 keeps the merchant out).
  { id: 'forge_seal', nameKey: 'forge_seal', descKey: 'forge_seal_d', icon: '🔨', iconUrl: '/assets/icons/forge_seal.png', cost: 0, sellValue: 0, purchasable: false },
  { id: 'stash_deed', nameKey: 'stash_deed', descKey: 'stash_deed_d', icon: '📜', iconUrl: '/assets/icons/camp_stash.png', cost: 0, sellValue: 0, purchasable: false },
  // Round 18 (goldPouch.ts): Gold turned into a tradeable item. Made by the Pass owner in the Shop, opened by anyone for exactly its face value (T.goldPouch). Never sold to the
  // merchants (sellValue 0): they are for other players. The face value is NOT in this table, goldPouch.ts reads it from the tunables.
  { id: 'gold_pouch_s', nameKey: 'gold_pouch_s', descKey: 'gold_pouch_d', icon: '👛', iconUrl: '/assets/icons/gold_pouch.png', cost: 0, sellValue: 0, purchasable: false },
  { id: 'gold_pouch_m', nameKey: 'gold_pouch_m', descKey: 'gold_pouch_d', icon: '👛', iconUrl: '/assets/icons/gold_pouch.png', cost: 0, sellValue: 0, purchasable: false },
  { id: 'gold_pouch_l', nameKey: 'gold_pouch_l', descKey: 'gold_pouch_d', icon: '👛', iconUrl: '/assets/icons/gold_pouch.png', cost: 0, sellValue: 0, purchasable: false },
];

// The consumables that can be listed on the player market: the Gold Pouches (goldPouch.ts), which are unbound by nature. THE one list isTradeable (gearInstances.ts) reads;
// every other consumable, and every material, is never tradeable (standing decision of the owner: only forged gear of high rarity, unique drops and Gold in a pouch).
export const TRADEABLE_CONSUMABLES: readonly ConsumableId[] = ['gold_pouch_s', 'gold_pouch_m', 'gold_pouch_l'];

export function getConsumable(id: string): ConsumableDef | undefined {
  return CONSUMABLES.find((c) => c.id === id);
}

export function emptyConsumables(): Record<ConsumableId, number> {
  return {
    small_hp: 0,
    large_hp: 0,
    atk_elixir: 0,
    refine_catalyst: 0,
    expedition_ticket_1h: 0,
    expedition_ticket_2h: 0,
    expedition_ticket_4h: 0,
    knowledge_elixir: 0,
    greater_elixir: 0,
    strength_elixir: 0,
    stoneskin_tonic: 0,
    fortune_tonic: 0,
    haste_tonic: 0,
    gatherer_brew: 0,
    precision_elixir: 0,
    whetstone_oil: 0,
    fertilizer: 0,
    repair_kit: 0,
    master_repair_kit: 0,
    sharpening_stone: 0,
    armor_polish: 0,
    hunter_lure: 0,
    prospector_tonic: 0,
    forge_seal: 0,
    stash_deed: 0,
    gold_pouch_s: 0,
    gold_pouch_m: 0,
    gold_pouch_l: 0,
  };
}
