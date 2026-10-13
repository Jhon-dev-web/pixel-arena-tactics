import { getEdgeEnv } from '../_shared/env.ts';
import { createRestStore } from '../_shared/db.ts';
import { createStripeProvider } from '../_shared/providers/stripe.ts';
import { handleWebhook } from '../_shared/webhook.ts';
import { json } from '../_shared/http.ts';

// Supabase Edge Function (Deno), deployed with --no-verify-jwt: Stripe does not send a Supabase JWT; the Stripe signature is the authentication.
Deno.serve((req: Request) => {
  const env = getEdgeEnv();
  if (!env.STRIPE_WEBHOOK_SECRET || !env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_ADVENTURER_PASS) return json({ error: 'unavailable' }, 503);
  return handleWebhook(req, {
    provider: createStripeProvider({ secretKey: env.STRIPE_SECRET_KEY, priceId: env.STRIPE_PRICE_ADVENTURER_PASS, webhookSecret: env.STRIPE_WEBHOOK_SECRET }),
    store: createRestStore({ supabaseUrl: env.SUPABASE_URL ?? '', serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? '' }),
    nowMs: () => Date.now(),
  });
});
