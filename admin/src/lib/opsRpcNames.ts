// The AI-operations functions (supabase/migrations/0021_ai_ops.sql). Three read the state; two WRITE, and they are the only writes the whole app can make: switch a flag on or off (with a mandatory note) and mark an AI
// report as read. Every one of them starts by asking is_admin() in the database, like the ten read-only functions of 0020 (rpcNames.ts).
export const OPS_READ_RPC_NAMES = ['admin_ops_overview', 'admin_ai_reports', 'admin_ai_cost'] as const;
export const OPS_WRITE_RPC_NAMES = ['admin_set_ops_flag', 'admin_ack_report'] as const;
export type OpsRpcName = (typeof OPS_READ_RPC_NAMES)[number] | (typeof OPS_WRITE_RPC_NAMES)[number];
