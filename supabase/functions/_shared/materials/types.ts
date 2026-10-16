// The wire format of material-claim / material-sync, shared by the Edge Functions and the game (the client imports this file for its types; no Deno API is used here).
// Tradeable materials: docs/MARKET_FOUNDATION.md ("Materiais negociaveis"). The server creates them, keeps one balance per account and material, and burns units the game spends.

export type ClaimActivity = 'hunt' | 'mining' | 'woodcutting' | 'garden';

/** What the game reports about a claim it has just made. Nothing here is a result: the server validates it and rolls the dice itself. */
export interface MaterialClaimBody {
  requestId: string;
  activity: ClaimActivity;
  /** hunt: the zone id. mining / woodcutting: the tier (the ore or wood id). garden: empty. */
  place: string;
  /** hunt only: shallow | dense | deep (informational: the ceilings already use the best depth) */
  depth?: string;
  /** the time the claim covers, in ms (garden: the plot time of the harvested plants added up) */
  durationMs: number;
  /** the units that went into the bag, by material id */
  units: Record<string, number>;
}

export type MaterialRefusal = 'bad_request' | 'unknown_place' | 'too_early' | 'unavailable';

export type MaterialClaimResult =
  | {
      ok: true;
      /** how many units of each material are tradeable (only materials with at least one) */
      tradeable: Record<string, number>;
    }
  | { ok: false; reason: MaterialRefusal; retryAfterSeconds?: number };

/** One account's balance of one material. `qty` = every tradeable unit the account owns (in the save, waiting to be collected, but NOT in an escrowed listing); `pending` = the part of it the save does not hold yet (a purchase, a cancelled listing) and `seq` counts those deliveries. */
export interface MaterialBalance {
  qty: number;
  pending: number;
  seq: number;
}

export type MaterialBalances = Record<string, MaterialBalance>;

export type MaterialSyncBody =
  | { action: 'balances' }
  /** The game spent these tradeable units: lower the balance (never below zero). Idempotent by requestId. */
  | { action: 'burn'; requestId: string; units: Record<string, number> }
  /** The game put these delivered units into its save: lower `pending`. Idempotent by requestId. */
  | { action: 'ack'; requestId: string; units: Record<string, number> };

export type MaterialSyncResult = { ok: true; balances: MaterialBalances; applied?: Record<string, number> } | { ok: false; reason: 'bad_request' | 'unavailable' };

export const MATERIAL_ID_RE = /^[a-z][a-z_]{1,39}$/;
