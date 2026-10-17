import { getEdgeEnv } from '../_shared/env.ts';
import { withOpsMonitor } from '../_shared/ops/monitor.ts';
import { opsWiring } from '../_shared/ops/wiring.ts';
import { parseAllowedOrigins } from '../_shared/http.ts';
import { solUsdReaderFor } from '../_shared/market/solPrice.ts';
import { loadMarketChain } from '../_shared/market/chainEnv.ts';
import { handleMarketBuy } from '../_shared/market/handler.ts';
import { createMarketStore } from '../_shared/market/marketDb.ts';

// Supabase Edge Function (Deno): reserve a listing, get a blockhash, submit the signature of the ONE SOL payment, deliver the item.
// Secrets by NAME: APP_ORIGIN, SOLANA_RPC_URL, SOLANA_CLUSTER, SOLANA_USDC_MINT, MARKET_FEE_ADDRESS, SOL_USD_PRICE_URL (docs/MARKET_SOLANA.md). SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
// Deploy with JWT verification ON (the default): the player's session token is the only way in, and the user id comes from it and from nowhere else.
// The operations layer (docs/AI_OPS.md): 5xx answers are counted for the watchdog, and the pause flags are honoured.
const ops = opsWiring(getEdgeEnv());
Deno.serve(withOpsMonitor('market-buy', (req: Request) => {
  const env = getEdgeEnv();
  return handleMarketBuy(req, {
    auth: { supabaseUrl: env.SUPABASE_URL ?? '', anonKey: env.SUPABASE_ANON_KEY ?? '' },
    allowedOrigins: parseAllowedOrigins(env.APP_ORIGIN),
    store: createMarketStore({ supabaseUrl: env.SUPABASE_URL ?? '', serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? '' }),
    nowMs: () => Date.now(),
    opsFlags: ops.flags,
    chain: () => loadMarketChain(env),
    solUsd: solUsdReaderFor(env.SOL_USD_PRICE_URL),
    nonce: () => {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    },
  });
}, ops.report));
