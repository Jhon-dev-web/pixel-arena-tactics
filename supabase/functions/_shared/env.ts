// The only place the Edge Functions read environment variables, and only by NAME. Values are never logged or returned.
// `Deno` is declared by the runtime (see supabase/functions/deno-shim.d.ts for the repo's type-check).
export const EDGE_ENV_NAMES = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_PRICE_ADVENTURER_PASS',
  'STRIPE_WEBHOOK_SECRET',
  'APP_ORIGIN',
  // The Solana market and the USDC Pass (docs/MARKET_SOLANA.md). SOLANA_RPC_URL may carry the provider's API key: it is read here and used by the chain module only, never logged or returned.
  'SOLANA_RPC_URL',
  'SOLANA_CLUSTER',
  'SOLANA_USDC_MINT',
  'MARKET_FEE_ADDRESS',
  'PASS_RECEIVE_ADDRESS',
  'PASS_PRICE_USDC',
  'SOL_USD_PRICE_URL',
] as const;

export type EdgeEnv = Partial<Record<(typeof EDGE_ENV_NAMES)[number], string>>;

export function getEdgeEnv(): EdgeEnv {
  const out: EdgeEnv = {};
  for (const name of EDGE_ENV_NAMES) {
    const v = Deno.env.get(name);
    if (v) out[name] = v;
  }
  return out;
}
