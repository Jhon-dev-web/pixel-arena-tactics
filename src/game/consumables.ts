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
  | 'strength_elixir';

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
  };
}
