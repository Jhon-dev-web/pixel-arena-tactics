import { getEdgeEnv } from '../_shared/env.ts';
import { parseAllowedOrigins } from '../_shared/http.ts';
import { handleWaitlistReferrals } from '../_shared/waitlist/handler.ts';
import { createWaitlistStore } from '../_shared/waitlist/restStore.ts';

// Supabase Edge Function (Deno): the invite counters (qualified invitations, invitations that bought the Pass) shown to a person right after they signed up, in the same browser.
// It takes the public share code AND the private view key that only that browser holds; there is no lookup by e-mail (docs/WAITLIST.md explains why).
// Secrets by NAME: PORTAL_ORIGIN, WAITLIST_SECRET (the same as waitlist-join). Deploy with --no-verify-jwt: the view key is the credential.
Deno.serve((req: Request) => {
  const env = getEdgeEnv();
  return handleWaitlistReferrals(req, {
    allowedOrigins: parseAllowedOrigins(env.PORTAL_ORIGIN),
    secret: env.WAITLIST_SECRET ?? '',
    store: env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? createWaitlistStore({ supabaseUrl: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }) : null,
  });
});
