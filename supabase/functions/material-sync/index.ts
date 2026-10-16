import { getEdgeEnv } from '../_shared/env.ts';
import { parseAllowedOrigins } from '../_shared/http.ts';
import { secureRng } from '../_shared/items/roll.ts';
import { handleMaterialSync } from '../_shared/materials/handler.ts';
import { createMaterialStore } from '../_shared/materials/matDb.ts';

// Supabase Edge Function (Deno): the account's tradeable material balances, the burn of units the game spent and the acknowledgement of units delivered into the save.
// Secrets by NAME: APP_ORIGIN. SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by the platform. Deploy with JWT verification ON (the default).
Deno.serve((req: Request) => {
  const env = getEdgeEnv();
  return handleMaterialSync(req, {
    auth: { supabaseUrl: env.SUPABASE_URL ?? '', anonKey: env.SUPABASE_ANON_KEY ?? '' },
    allowedOrigins: parseAllowedOrigins(env.APP_ORIGIN),
    store: createMaterialStore({ supabaseUrl: env.SUPABASE_URL ?? '', serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? '' }),
    nowMs: () => Date.now(),
    rng: secureRng,
  });
});
