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
  // The USDT market and the USDT Pass (docs/MARKET_USDT.md). BSC_RPC_URL may carry the provider's API key: it is read here and used by the chain module only, never logged or returned.
  'BSC_RPC_URL',
  'BSC_CHAIN_ID',
  'BSC_MIN_CONFIRMATIONS',
  'BSC_USDT_CONTRACT',
  'MARKET_FEE_ADDRESS',
  'PASS_RECEIVE_ADDRESS',
  'PASS_PRICE_USDT',
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
