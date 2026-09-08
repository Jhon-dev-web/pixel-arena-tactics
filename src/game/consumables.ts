export type ConsumableId = 'small_hp' | 'large_hp' | 'atk_elixir';

export interface ConsumableDef {
  id: ConsumableId;
  nameKey: string;
  descKey: string;
  icon: string;
  iconUrl?: string;
  cost: number;
  sellValue: number;
}

export const CONSUMABLE_STACK = 20;

export const CONSUMABLES: ConsumableDef[] = [
  { id: 'small_hp', nameKey: 'small_hp', descKey: 'small_hp_d', icon: '🧪', iconUrl: '/assets/icons/potion_small_hp.png', cost: 30, sellValue: 12 },
  { id: 'large_hp', nameKey: 'large_hp', descKey: 'large_hp_d', icon: '🧪', iconUrl: '/assets/icons/potion_large_hp.png', cost: 80, sellValue: 32 },
  { id: 'atk_elixir', nameKey: 'atk_elixir', descKey: 'atk_elixir_d', icon: '⚔️', iconUrl: '/assets/icons/potion_atk_elixir.png', cost: 120, sellValue: 48 },
];

export function getConsumable(id: string): ConsumableDef | undefined {
  return CONSUMABLES.find((c) => c.id === id);
}

export function emptyConsumables(): Record<ConsumableId, number> {
  return { small_hp: 0, large_hp: 0, atk_elixir: 0 };
}
