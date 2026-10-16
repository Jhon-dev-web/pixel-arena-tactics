import { getEdgeEnv } from '../_shared/env.ts';
import { parseAllowedOrigins } from '../_shared/http.ts';
import { loadMarketChain } from '../_shared/market/chainEnv.ts';
import { handleMarketMy } from '../_shared/market/handler.ts';
import { createMarketStore } from '../_shared/market/marketDb.ts';

// Supabase Edge Function (Deno): my wallet, listings, reservation, history, and the items waiting to be collected into the save.
// Secrets by NAME: APP_ORIGIN, BSC_RPC_URL, BSC_CHAIN_ID, BSC_MIN_CONFIRMATIONS, BSC_USDT_CONTRACT, MARKET_FEE_ADDRESS (docs/MARKET_USDT.md). SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
// Deploy with JWT verification ON (the default): the player's session token is the only way in, and the user id comes from it and from nowhere else.
Deno.serve((req: Request) => {
  const env = getEdgeEnv();
  return handleMarketMy(req, {
    auth: { supabaseUrl: env.SUPABASE_URL ?? '', anonKey: env.SUPABASE_ANON_KEY ?? '' },
    allowedOrigins: parseAllowedOrigins(env.APP_ORIGIN),
    store: createMarketStore({ supabaseUrl: env.SUPABASE_URL ?? '', serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? '' }),
    nowMs: () => Date.now(),
    chain: () => loadMarketChain(env),
    nonce: () => {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    },
  });
});
