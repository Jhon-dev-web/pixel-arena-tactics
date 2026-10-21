// The functions of migration 0027 that WRITE (each admin-only in the database, each leaves an audit row). The Edge Function admin-delete-user is not here: it is not an rpc (see backend.ts).
export const ACTION_RPC_NAMES = ['admin_grant_pass', 'admin_revoke_pass'] as const;
export type ActionRpcName = (typeof ACTION_RPC_NAMES)[number];
