// The one function of supabase/migrations/0022_payment_fixes.sql the app calls: the queue of payments that reached the game but could not be matched. A read. Like the others it starts by asking is_admin() in the database.
// Resolving a payment is NOT an app action: the owner runs two SQL functions by hand (docs/MARKET_SOLANA.md, "Pagamentos que deram errado").
export const PAYMENT_RPC_NAMES = ['admin_payment_exceptions'] as const;
export type PaymentRpcName = (typeof PAYMENT_RPC_NAMES)[number];
