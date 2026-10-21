// The functions of migration 0027 that the dashboard calls with rpc (each admin-only in the database; every one that changes something leaves an audit row). The Edge Function admin-delete-user is not here: it is
// not an rpc (see backend.ts). admin_list_promo_codes only reads.
export const ACTION_RPC_NAMES = ['admin_grant_pass', 'admin_revoke_pass', 'admin_create_promo_codes', 'admin_list_promo_codes', 'admin_disable_promo_code'] as const;
export type ActionRpcName = (typeof ACTION_RPC_NAMES)[number];
