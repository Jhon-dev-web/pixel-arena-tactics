import { getEdgeEnv } from '../_shared/env.ts';
import { parseAllowedOrigins } from '../_shared/http.ts';
import { secureRng } from '../_shared/items/roll.ts';
import { handleMaterialClaim } from '../_shared/materials/handler.ts';
import { createMaterialStore } from '../_shared/materials/matDb.ts';

// Supabase Edge Function (Deno): a claimed Hunting reward / Mining / Woodcutting session / Garden harvest is reported here and the SERVER rolls which of its units are the tradeable variant
// (docs/MARKET_FOUNDATION.md, "Materiais negociaveis"). Secrets by NAME: APP_ORIGIN. SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
// Deploy with JWT verification ON (the default): the player's session token is the only way in, and the user id comes from it and from nowhere else.
Deno.serve((req: Request) => {
  const env = getEdgeEnv();
  return handleMaterialClaim(req, {
    auth: { supabaseUrl: env.SUPABASE_URL ?? '', anonKey: env.SUPABASE_ANON_KEY ?? '' },
    allowedOrigins: parseAllowedOrigins(env.APP_ORIGIN),
    store: createMaterialStore({ supabaseUrl: env.SUPABASE_URL ?? '', serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? '' }),
    nowMs: () => Date.now(),
    rng: secureRng,
  });
});
