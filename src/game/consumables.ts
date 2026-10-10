export type ConsumableId =
  | 'small_hp'
  | 'large_hp'
  | 'atk_elixir'
  | 'refine_catalyst'
  | 'expedition_ticket_1h'
  | 'expedition_ticket_2h'
  | 'expedition_ticket_4h'
  | 'xp_potion'
  | 'greater_elixir'
  | 'strength_elixir'
  | 'stoneskin_tonic'
  | 'fortune_tonic'
  | 'haste_tonic'
  | 'gatherer_brew'
  | 'precision_elixir'
  | 'whetstone_oil'
  | 'fertilizer';

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
  { id: 'xp_potion', nameKey: 'xp_potion', descKey: 'xp_potion_d', icon: '📘', iconUrl: '/assets/icons/xp_potion.png', cost: 0, sellValue: 15, purchasable: false },
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
];

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
    xp_potion: 0,
    greater_elixir: 0,
    strength_elixir: 0,
    stoneskin_tonic: 0,
    fortune_tonic: 0,
    haste_tonic: 0,
    gatherer_brew: 0,
    precision_elixir: 0,
    whetstone_oil: 0,
    fertilizer: 0,
  };
}
