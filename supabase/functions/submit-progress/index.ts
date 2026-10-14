import { getEdgeEnv } from '../_shared/env.ts';
import { parseAllowedOrigins } from '../_shared/http.ts';
import { handleSubmitProgress } from '../_shared/progress/handler.ts';
import { createProgressStore } from '../_shared/progress/progressDb.ts';

// Supabase Edge Function (Deno). Secrets by NAME: APP_ORIGIN. SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
// Deploy with JWT verification ON (the default): the player's session token is the only way in. Unlike stripe-webhook, no --no-verify-jwt.
Deno.serve((req: Request) => {
  const env = getEdgeEnv();
  return handleSubmitProgress(req, {
    auth: { supabaseUrl: env.SUPABASE_URL ?? '', anonKey: env.SUPABASE_ANON_KEY ?? '' },
    allowedOrigins: parseAllowedOrigins(env.APP_ORIGIN),
    store: createProgressStore({ supabaseUrl: env.SUPABASE_URL ?? '', serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? '' }),
    nowMs: () => Date.now(),
  });
});
