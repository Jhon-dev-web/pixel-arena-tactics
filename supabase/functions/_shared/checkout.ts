import { AuthConfig, getAuthenticatedUserId } from './auth.ts';
import { json } from './http.ts';
import { isPaused, pausedResponse, type OpsFlagReader } from './ops/flags.ts';
import type { PaymentProvider, Store } from './types.ts';

export const CHECKOUT_RATE_LIMIT = { max: 5, windowMs: 10 * 60 * 1000 };
/** An attempt that has no session yet blocks a parallel request this long (then it is treated as a crashed request). */
export const CHECKOUT_PENDING_MS = 60 * 1000;
/** A stored session is offered again only if it still has this much life left and was created within the reuse age. */
export const CHECKOUT_REUSE_MIN_REMAINING_MS = 5 * 60 * 1000;
export const CHECKOUT_REUSE_MAX_AGE_MS = 2 * 60 * 60 * 1000;

export interface AttemptRow {
  createdAtMs: number;
  sessionUrl: string | null;
  sessionExpiresAtMs: number | null;
  completed: boolean;
}

/**
 * THE decision of the atomic claim, as a pure function. The SQL function checkout_claim (migration 0007) takes a per-user lock and applies exactly these rules in this order;
 * the test store uses this function, and a static test pins the SQL to the same constants.
 */
export function decideCheckoutClaim(
  attempts: AttemptRow[],
  nowMs: number,
  limits = CHECKOUT_RATE_LIMIT,
): { outcome: 'reuse'; url: string } | { outcome: 'in_progress' } | { outcome: 'rate_limited' } | { outcome: 'create' } {
  const open = attempts
    .filter((a) => a.sessionUrl && !a.completed && a.sessionExpiresAtMs !== null && a.sessionExpiresAtMs - nowMs >= CHECKOUT_REUSE_MIN_REMAINING_MS && nowMs - a.createdAtMs <= CHECKOUT_REUSE_MAX_AGE_MS)
    .sort((a, b) => b.createdAtMs - a.createdAtMs)[0];
  if (open) return { outcome: 'reuse', url: open.sessionUrl as string };
  if (attempts.some((a) => !a.sessionUrl && nowMs - a.createdAtMs < CHECKOUT_PENDING_MS)) return { outcome: 'in_progress' };
  if (attempts.filter((a) => nowMs - a.createdAtMs < limits.windowMs).length >= limits.max) return { outcome: 'rate_limited' };
  return { outcome: 'create' };
}

export interface CheckoutDeps {
  auth: AuthConfig;
  /** Parsed APP_ORIGIN (see parseAllowedOrigins). Empty = the function is not configured. */
  allowedOrigins: string[];
  /** null when the provider secrets are not set: the function answers 503 instead of failing half way. */
  provider: PaymentProvider | null;
  store: Store;
  nowMs: () => number;
  /** The operations flags (migration 0021). `pass_sales_paused` makes this function answer 503 before it touches the provider. The webhook is NEVER paused: money already taken must still be recorded. */
  opsFlags?: OpsFlagReader;
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
    if (await isPaused(deps.opsFlags, 'pass_sales_paused')) return pausedResponse('pass_sales_paused', cors);
    if (await deps.store.hasActiveEntitlement(userId, 'adventurer_pass')) return json({ error: 'already_owned' }, 409, cors);

    // One atomic step: reuse the user's open session, or wait for the request that is creating one, or hit the limit, or get permission to create.
    const claim = await deps.store.claimCheckout(userId);
    if (claim.outcome === 'reuse') return json({ url: claim.url }, 200, cors);
    if (claim.outcome === 'in_progress') return json({ error: 'checkout_in_progress' }, 429, { ...cors, 'retry-after': '5' });
    if (claim.outcome === 'rate_limited') return json({ error: 'rate_limited' }, 429, { ...cors, 'retry-after': String(Math.ceil(CHECKOUT_RATE_LIMIT.windowMs / 1000)) });

    const base = origin && deps.allowedOrigins.includes(origin) ? origin : deps.allowedOrigins[0];
    let session;
    try {
      session = await deps.provider.createCheckout({ userId, successUrl: `${base}/?pass=success`, cancelUrl: `${base}/?pass=cancel` });
    } catch (err) {
      await deps.store.abandonCheckoutAttempt(claim.attemptId).catch(() => undefined); // do not block the user's next try for our provider failure
      throw err;
    }
    await deps.store.attachCheckoutSession(claim.attemptId, session).catch(() => undefined); // only an optimisation: the user still gets his url
    return json({ url: session.url }, 200, cors);
  } catch (err) {
    console.error('[create-checkout] failed', err instanceof Error ? err.message : 'unknown'); // message only: never the request, a key or a payload
    return json({ error: 'checkout_failed' }, 502, cors);
  }
}
