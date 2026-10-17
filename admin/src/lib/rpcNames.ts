// The ten read-only functions the app calls (supabase/migrations/0020_admin.sql). `is_admin` is separate: it is the access check.
export const RPC_NAMES = [
  'admin_overview',
  'admin_players',
  'admin_player_detail',
  'admin_legendaries',
  'admin_market',
  'admin_economy',
  'admin_economy_series',
  'admin_flags',
  'admin_league',
  'admin_waitlist',
] as const;

export type RpcName = (typeof RPC_NAMES)[number];
