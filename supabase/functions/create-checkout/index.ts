import { getEdgeEnv } from '../_shared/env.ts';
import { handleCreateCheckout } from '../_shared/checkout.ts';
import { createRestStore } from '../_shared/db.ts';
import { parseAllowedOrigins } from '../_shared/http.ts';
import { createStripeProvider } from '../_shared/providers/stripe.ts';

// Supabase Edge Function (Deno). Secrets by NAME: STRIPE_SECRET_KEY, STRIPE_PRICE_ADVENTURER_PASS, STRIPE_WEBHOOK_SECRET, APP_ORIGIN.
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
Deno.serve((req: Request) => {
  const env = getEdgeEnv();
  const provider =
    env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_ADVENTURER_PASS && env.STRIPE_WEBHOOK_SECRET
      ? createStripeProvider({ secretKey: env.STRIPE_SECRET_KEY, priceId: env.STRIPE_PRICE_ADVENTURER_PASS, webhookSecret: env.STRIPE_WEBHOOK_SECRET })
      : null;
  return handleCreateCheckout(req, {
    auth: { supabaseUrl: env.SUPABASE_URL ?? '', anonKey: env.SUPABASE_ANON_KEY ?? '' },
    allowedOrigins: parseAllowedOrigins(env.APP_ORIGIN),
    provider,
    store: createRestStore({ supabaseUrl: env.SUPABASE_URL ?? '', serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? '' }),
    nowMs: () => Date.now(),
  });
});
