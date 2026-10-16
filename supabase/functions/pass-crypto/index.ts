import { getEdgeEnv } from '../_shared/env.ts';
import { parseAllowedOrigins } from '../_shared/http.ts';
import { createPassCryptoStore } from '../_shared/market/marketDb.ts';
import { handlePassCrypto, loadPassCrypto } from '../_shared/market/passCrypto.ts';

// Supabase Edge Function (Deno): the Adventurer Pass paid in USDT (BEP-20, BNB Smart Chain). { action: 'start' } says what to pay and to whom; { action: 'submit', txHash } verifies the transfer on chain
// and grants the entitlement (source crypto_bsc). Secrets by NAME: APP_ORIGIN, BSC_RPC_URL, BSC_CHAIN_ID, BSC_MIN_CONFIRMATIONS, BSC_USDT_CONTRACT, PASS_PRICE_USDT, PASS_RECEIVE_ADDRESS (or MARKET_FEE_ADDRESS).
// Deploy with JWT verification ON (the default): the player's session token is the only way in, and the user id comes from it and from nowhere else.
Deno.serve((req: Request) => {
  const env = getEdgeEnv();
  return handlePassCrypto(req, {
    auth: { supabaseUrl: env.SUPABASE_URL ?? '', anonKey: env.SUPABASE_ANON_KEY ?? '' },
    allowedOrigins: parseAllowedOrigins(env.APP_ORIGIN),
    store: createPassCryptoStore({ supabaseUrl: env.SUPABASE_URL ?? '', serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? '' }),
    nowMs: () => Date.now(),
    pass: () => loadPassCrypto(env),
  });
});
