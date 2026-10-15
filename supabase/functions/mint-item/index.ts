import { getEdgeEnv } from '../_shared/env.ts';
import { parseAllowedOrigins } from '../_shared/http.ts';
import { handleMintItem } from '../_shared/items/handler.ts';
import { createItemStore } from '../_shared/items/itemDb.ts';
import { secureRng } from '../_shared/items/roll.ts';

// Supabase Edge Function (Deno). Secrets by NAME: APP_ORIGIN. SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
// Deploy with JWT verification ON (the default): the player's session token is the only way in, and the user id comes from it and from nowhere else. Unlike stripe-webhook, no --no-verify-jwt.
Deno.serve((req: Request) => {
  const env = getEdgeEnv();
  return handleMintItem(req, {
    auth: { supabaseUrl: env.SUPABASE_URL ?? '', anonKey: env.SUPABASE_ANON_KEY ?? '' },
    allowedOrigins: parseAllowedOrigins(env.APP_ORIGIN),
    store: createItemStore({ supabaseUrl: env.SUPABASE_URL ?? '', serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? '' }),
    nowMs: () => Date.now(),
    rng: secureRng,
  });
});
