import { getEdgeEnv } from '../_shared/env.ts';
import { parseAllowedOrigins } from '../_shared/http.ts';
import { handleWaitlistJoin } from '../_shared/waitlist/handler.ts';
import { createWaitlistStore } from '../_shared/waitlist/restStore.ts';

// Supabase Edge Function (Deno): "Avise-me no lançamento" of the public portal.
// Secrets by NAME: PORTAL_ORIGIN (the exact https origin of the portal), WAITLIST_SECRET (a long random string). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
// Deploy with --no-verify-jwt: visitors have no account, so there is no JWT to verify. The protection is the origin check, the honeypot and the rate limits (docs/WAITLIST.md).
Deno.serve((req: Request) => {
  const env = getEdgeEnv();
  return handleWaitlistJoin(req, {
    allowedOrigins: parseAllowedOrigins(env.PORTAL_ORIGIN),
    secret: env.WAITLIST_SECRET ?? '',
    store: env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? createWaitlistStore({ supabaseUrl: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }) : null,
  });
});
