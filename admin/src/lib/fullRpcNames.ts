// The one function of supabase/migrations/0034_admin_player_full.sql the app calls: the live read of a single account for the player drawer. A read; like the others it starts by asking is_admin() in the database.
export const FULL_RPC_NAMES = ['admin_player_full'] as const;
export type FullRpcName = (typeof FULL_RPC_NAMES)[number];
