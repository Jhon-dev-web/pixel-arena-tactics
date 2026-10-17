import { getEdgeEnv } from '../_shared/env.ts';
import { withOpsMonitor } from '../_shared/ops/monitor.ts';
import { opsWiring } from '../_shared/ops/wiring.ts';
import { parseAllowedOrigins } from '../_shared/http.ts';
import { createPassCryptoStore } from '../_shared/market/marketDb.ts';
import { handlePassCrypto, loadPassCrypto } from '../_shared/market/passCrypto.ts';

// Supabase Edge Function (Deno): the Adventurer Pass paid in USDC on Solana. { action: 'start' } says what to pay and to whom; { action: 'submit', signature } verifies the transfer on chain
// and grants the entitlement (source crypto_sol). Needs the npm import map in this folder (deno.json: the associated token account is derived with @noble). Secrets by NAME: APP_ORIGIN, SOLANA_RPC_URL, SOLANA_CLUSTER, SOLANA_USDC_MINT, PASS_PRICE_USDC, PASS_RECEIVE_ADDRESS (or MARKET_FEE_ADDRESS).
// Deploy with JWT verification ON (the default): the player's session token is the only way in, and the user id comes from it and from nowhere else.
// The operations layer (docs/AI_OPS.md): 5xx answers are counted for the watchdog, and the pause flags are honoured.
const ops = opsWiring(getEdgeEnv());
Deno.serve(withOpsMonitor('pass-crypto', (req: Request) => {
  const env = getEdgeEnv();
  return handlePassCrypto(req, {
    auth: { supabaseUrl: env.SUPABASE_URL ?? '', anonKey: env.SUPABASE_ANON_KEY ?? '' },
    allowedOrigins: parseAllowedOrigins(env.APP_ORIGIN),
    store: createPassCryptoStore({ supabaseUrl: env.SUPABASE_URL ?? '', serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? '' }),
    nowMs: () => Date.now(),
    opsFlags: ops.flags,
    pass: () => loadPassCrypto(env),
  });
}, ops.report));
