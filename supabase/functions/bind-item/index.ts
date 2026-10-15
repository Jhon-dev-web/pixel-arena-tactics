import { getEdgeEnv } from '../_shared/env.ts';
import { parseAllowedOrigins } from '../_shared/http.ts';
import { handleBindItem } from '../_shared/items/handler.ts';
import { createItemStore } from '../_shared/items/itemDb.ts';

// Supabase Edge Function (Deno): bind / void / burn the certificates the caller owns (equipping, refining, salvaging, opening a Gold Pouch). Secrets by NAME: APP_ORIGIN.
// Deploy with JWT verification ON (the default). The user id comes ONLY from the verified JWT, so nobody can touch another account's certificate.
Deno.serve((req: Request) => {
  const env = getEdgeEnv();
  return handleBindItem(req, {
    auth: { supabaseUrl: env.SUPABASE_URL ?? '', anonKey: env.SUPABASE_ANON_KEY ?? '' },
    allowedOrigins: parseAllowedOrigins(env.APP_ORIGIN),
    store: createItemStore({ supabaseUrl: env.SUPABASE_URL ?? '', serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? '' }),
  });
});
