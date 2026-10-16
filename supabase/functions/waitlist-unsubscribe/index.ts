import { parseAllowedOrigins } from '../_shared/http.ts';
import { getWaitlistEnv } from '../_shared/waitlist/env.ts';
import { handleWaitlistUnsubscribe } from '../_shared/waitlist/handler.ts';
import { createWaitlistStore } from '../_shared/waitlist/restStore.ts';

// Supabase Edge Function (Deno): unsubscribe from the launch list with a signed token (HMAC, secret WAITLIST_SECRET). The portal's /unsubscribe page posts the token from the e-mail link.
// Secrets by NAME: PORTAL_ORIGIN, WAITLIST_SECRET (the same as waitlist-join). Deploy with --no-verify-jwt: the signed token is the authentication.
Deno.serve((req: Request) => {
  const env = getWaitlistEnv();
  return handleWaitlistUnsubscribe(req, {
    allowedOrigins: parseAllowedOrigins(env.PORTAL_ORIGIN),
    secret: env.WAITLIST_SECRET ?? '',
    store: env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? createWaitlistStore({ supabaseUrl: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }) : null,
  });
});
