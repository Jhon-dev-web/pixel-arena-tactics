// The one function of supabase/migrations/0037_admin_top_level.sql: the "Top 25 por nível" of the playtest prize. A read; like the others it starts by asking is_admin() in the database.
export const TOP_RPC_NAMES = ['admin_top_level'] as const;
export type TopRpcName = (typeof TOP_RPC_NAMES)[number];
