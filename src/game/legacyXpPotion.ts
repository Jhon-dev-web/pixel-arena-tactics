import T from './tunables';

// The old "Potion of Knowledge" (id xp_potion, +150 XP instantly) is gone since the League (docs/BALANCE_CHANGES.md, Rodada 20): the hero earns XP only from Hunting, and the
// Knowledge Elixir (knowledge_elixir, a Hunting XP buff) took its place. A save from before still holds the old potion in its bag and in the camp stash; loading turns each one
// into T.consumables.legacyXpPotionGold Gold (about what one cost to make: 3 Energy Herbs and 30 Gold) and the key disappears, so it can never be converted twice.

export const LEGACY_XP_POTION_ID = 'xp_potion';

const count = (rec: unknown): number => {
  const n = rec && typeof rec === 'object' ? (rec as Record<string, unknown>)[LEGACY_XP_POTION_ID] : 0;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 1e6) : 0;
};

// How many old potions a raw (parsed, not yet sanitized) save holds, in the bag and in the stash.
export function legacyXpPotionCount(parsed: { consumables?: unknown; stash?: { consumables?: unknown } | null }): number {
  return count(parsed.consumables) + count(parsed.stash?.consumables);
}

export const legacyXpPotionGold = (potions: number): number => potions * T.consumables.legacyXpPotionGold;

// The consumables record without the old id.
export function withoutLegacyXpPotion<R extends Record<string, number>>(consumables: R): R {
  const { [LEGACY_XP_POTION_ID]: _gone, ...rest } = consumables as Record<string, number>;
  void _gone;
  return rest as R;
}
