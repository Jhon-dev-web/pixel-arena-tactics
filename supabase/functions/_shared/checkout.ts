import { AuthConfig, getAuthenticatedUserId } from './auth.ts';
import { json } from './http.ts';
import type { PaymentProvider, Store } from './types.ts';

export const CHECKOUT_RATE_LIMIT = { max: 5, windowMs: 10 * 60 * 1000 };

export interface CheckoutDeps {
  auth: AuthConfig;
  /** Parsed APP_ORIGIN (see parseAllowedOrigins). Empty = the function is not configured. */
  allowedOrigins: string[];
  /** null when the provider secrets are not set: the function answers 503 instead of failing half way. */
  provider: PaymentProvider | null;
  store: Store;
  nowMs: () => number;
}

function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
    'access-control-allow-methods': 'POST, OPTIONS',
    vary: 'Origin',
  };
}

/**
 * create-checkout. The user id comes from the verified JWT only; the request body is never read. The redirect URLs are built from the
 * allow-listed APP_ORIGIN (the request's Origin if it is on the list, otherwise the first entry), never from anything the client sends.
 */
export async function handleCreateCheckout(req: Request, deps: CheckoutDeps): Promise<Response> {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin, deps.allowedOrigins);

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);
  if (deps.allowedOrigins.length === 0 || !deps.provider) return json({ error: 'unavailable' }, 503, cors);
  if (origin && !deps.allowedOrigins.includes(origin)) return json({ error: 'origin_not_allowed' }, 403);

  const userId = await getAuthenticatedUserId(req, deps.auth);
  if (!userId) return json({ error: 'unauthenticated' }, 401, cors);

  try {
    if (await deps.store.hasActiveEntitlement(userId, 'adventurer_pass')) return json({ error: 'already_owned' }, 409, cors);

    const now = deps.nowMs();
    const recent = await deps.store.countCheckoutAttemptsSince(userId, now - CHECKOUT_RATE_LIMIT.windowMs);
    if (recent >= CHECKOUT_RATE_LIMIT.max) return json({ error: 'rate_limited' }, 429, { ...cors, 'retry-after': String(Math.ceil(CHECKOUT_RATE_LIMIT.windowMs / 1000)) });
    await deps.store.recordCheckoutAttempt(userId);

    const base = origin && deps.allowedOrigins.includes(origin) ? origin : deps.allowedOrigins[0];
    const session = await deps.provider.createCheckout({ userId, successUrl: `${base}/?pass=success`, cancelUrl: `${base}/?pass=cancel` });
    return json({ url: session.url }, 200, cors);
  } catch (err) {
    console.error('[create-checkout] failed', err instanceof Error ? err.message : 'unknown'); // message only: never the request, a key or a payload
    return json({ error: 'checkout_failed' }, 502, cors);
  }
}
