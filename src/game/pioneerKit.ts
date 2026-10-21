import type { ServerCredit } from './promoRewards';

// The Pioneer kit's starter chest (migration 0033_pioneer_kit.sql): a thank-you for the players of the open pre-season, delivered through the server credit ledger (migration 0028) when the first League
// opens. The SERVER decides who qualifies and inserts the credits; the reset hero claims them like any promo credit (promoRewards.ts). These numbers mirror arena_private.pioneer_kit() in the migration
// (the one place on the server); a test pins the two together. About one hour of early-game Gold (~27 from Hunting + ~33 from a delivery order) and 4 basic healing potions.

export const PIONEER_KIT = {
  /** Hero level the account reached in the pre-season (an accepted server snapshot) to qualify. */
  minLevel: 10,
  gold: 500,
  potionId: 'small_hp',
  potionAmount: 10,
} as const;

/** The source_ref values the server writes for the chest (arena_private.server_credits, source 'pioneer'). */
export const PIONEER_SOURCE_REFS: readonly string[] = ['pioneer-gold', 'pioneer-potion'];

export const isPioneerCredit = (c: Pick<ServerCredit, 'sourceRef'>): boolean => c.sourceRef !== null && PIONEER_SOURCE_REFS.includes(c.sourceRef);
