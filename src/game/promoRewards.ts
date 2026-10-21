import type { SaveData } from './engine';
import { addForced } from './inventory';
import { APPLIED_CREDITS_CAP, CREDIT_ID_RE, sanitizeAppliedCredits } from './appliedCredits';
import { CONSUMABLES, ConsumableId, getConsumable, TRADEABLE_CONSUMABLES } from './consumables';

// Promo code rewards that are NUMBERS in the save (migration 0028): Gold, Éter (shards) and potions. The SERVER keeps a ledger of what it owes the account (arena_private.server_credits); the game CLAIMS
// the rows (public.claim_server_credits) and applies each one to the save exactly once. The Pass is not here: it is an entitlement the Pass check already reads.
//
// HOW "exactly once" works. Every credit has an id (a uuid). The save remembers the ids it applied in `appliedCredits` (the last APPLIED_CREDITS_CAP of them), and applying a credit whose id is already there
// does nothing, so the same list can be applied on every login, every focus and after every redeem. If a claim answer is lost (the tab closed before the save went out) the server still has the row marked claimed and
// public.my_recent_credits(days) hands it back; the ones whose id is not in the save yet are applied then. The ledger is 100 rows at most per call and 30 days at most, the list keeps 400 ids, so an id never
// falls out of the list while the server could still hand it back.
//
// WHERE THE POTIONS GO. A reward is a gift, never refused: the units go into the bag even when it is full (the bag may go over its capacity, which it supports, exactly like the season settlement of the
// Pass track, battlepass.ts `forced`). Nothing is dropped and nothing waits in a pending list; the player just has to make room before the next pick-up.
// Gold and Éter are added to the balances directly. They are NOT added to stats.goldEarned (it is the counter the ranking audit rates by hour); submit-progress is told about the credit instead
// (supabase/functions/_shared/progress/evaluate.ts), so the balance jump never flags the player.

export { APPLIED_CREDITS_CAP, sanitizeAppliedCredits };

export type CreditKind = 'gold' | 'shards' | 'consumable';

/** One thing the server owes the account. `itemId` is the potion for kind 'consumable', null otherwise. */
export interface ServerCredit {
  id: string;
  kind: CreditKind;
  itemId: string | null;
  amount: number;
  /** The promo code that made it (canonical), for the owner's records; the game does not show it. */
  sourceRef: string | null;
}

/** Per code and per account (the database checks the same numbers). */
export const PROMO_CAPS: Readonly<Record<CreditKind, number>> = { gold: 1_000_000, shards: 10_000, consumable: 100 };

/**
 * The potions a promo code may give: every consumable EXCEPT the tradeable ones (Gold Pouches: a code must not mint market goods) and the Pass-track exclusives (Stash Deed, Forge Seal, Refine Catalyst,
 * Expedition Tickets). The SQL list (migration 0028 promo_consumable_ids) is the same; a test pins them together.
 */
export const PROMO_CONSUMABLE_IDS: readonly ConsumableId[] = [
  'small_hp',
  'large_hp',
  'atk_elixir',
  'knowledge_elixir',
  'greater_elixir',
  'strength_elixir',
  'stoneskin_tonic',
  'fortune_tonic',
  'haste_tonic',
  'gatherer_brew',
  'precision_elixir',
  'whetstone_oil',
  'fertilizer',
  'repair_kit',
  'master_repair_kit',
  'sharpening_stone',
  'armor_polish',
  'hunter_lure',
  'prospector_tonic',
];

export const isPromoConsumable = (id: string): id is ConsumableId => (PROMO_CONSUMABLE_IDS as readonly string[]).includes(id) && !!getConsumable(id) && !(TRADEABLE_CONSUMABLES as readonly string[]).includes(id);

/** The server's list of credits -> the ones this game can apply. Anything malformed, unknown, over its cap or a potion that is not on the promo list is dropped (never applied), duplicates by id keep the first. */
export function parseServerCredits(raw: unknown): ServerCredit[] {
  if (!Array.isArray(raw)) return [];
  const out: ServerCredit[] = [];
  const seen = new Set<string>();
  for (const row of raw.slice(0, 200)) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === 'string' && CREDIT_ID_RE.test(r.id) ? r.id.toLowerCase() : null;
    const kind = r.kind === 'gold' || r.kind === 'shards' || r.kind === 'consumable' ? r.kind : null;
    const amount = typeof r.amount === 'number' && Number.isInteger(r.amount) ? r.amount : 0;
    if (!id || !kind || seen.has(id) || amount < 1 || amount > PROMO_CAPS[kind]) continue;
    let itemId: string | null = null;
    if (kind === 'consumable') {
      if (typeof r.item_id !== 'string' || !isPromoConsumable(r.item_id)) continue;
      itemId = r.item_id;
    } else if (r.item_id !== null && r.item_id !== undefined) continue;
    seen.add(id);
    out.push({ id, kind, itemId, amount, sourceRef: typeof r.source_ref === 'string' ? r.source_ref.slice(0, 16) : null });
  }
  return out;
}

export interface ApplyCreditsResult {
  save: SaveData;
  /** The credits that were new to this save (in order). Empty = nothing changed and `save` is the very same object. */
  applied: ServerCredit[];
}

/**
 * Applies every credit whose id the save has not applied yet, once. Pure. Gold and Éter are added to the balances, potions go into the bag even when it is full (see the header). Returns the SAME save object when
 * there is nothing new, so calling it on every login / focus is free and never re-renders.
 */
export function applyServerCredits(save: SaveData, credits: readonly ServerCredit[]): ApplyCreditsResult {
  const known = new Set(save.appliedCredits ?? []);
  const fresh: ServerCredit[] = [];
  for (const c of credits) {
    if (known.has(c.id)) continue;
    known.add(c.id);
    fresh.push(c);
  }
  if (fresh.length === 0) return { save, applied: [] };
  let next: SaveData = save;
  for (const c of fresh) {
    if (c.kind === 'gold') next = { ...next, gold: next.gold + c.amount };
    else if (c.kind === 'shards') next = { ...next, shards: next.shards + c.amount };
    else if (c.itemId && CONSUMABLES.some((d) => d.id === c.itemId)) next = addForced(next, { consumables: { [c.itemId]: c.amount } });
  }
  return { save: { ...next, appliedCredits: [...(save.appliedCredits ?? []), ...fresh.map((c) => c.id)].slice(-APPLIED_CREDITS_CAP) }, applied: fresh };
}
