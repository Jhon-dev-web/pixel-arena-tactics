import { json } from '../http.ts';
import { MAX_BODY_BYTES, clientIp, corsHeaders, generateReferralCode, generateViewKey, hashKeys, hashViewKey, hmacHex, parseJoinBody, parseStatsBody, systemRandom } from './logic.ts';
import type { RandomBytes } from './logic.ts';
import type { WaitlistStore } from './store.ts';
import { verifyUnsubscribeToken } from './token.ts';

// The two public functions of the waitlist. NO JWT: anyone on the internet can call them, so they are built to be harmless to call:
//   * CORS only for the portal origin(s) in PORTAL_ORIGIN; a request from any other browser origin is refused.
//   * a honeypot field that a person never fills; a filled one gets the same answer as a success and nothing is stored.
//   * rate limits per hashed IP, network and e-mail, counted atomically in the database;
//   * the answer for a NEW address and for one that is ALREADY on the list has the same shape and the same kind of values ({ ok, code, key }): nobody can use the form to find out who is on the list.
//     `code` is the person's PUBLIC share code (a new one, or the existing one: it is printed in every link they post anyway); `key` is the PRIVATE view key for the counters: a new row stores its hash,
//     for an existing address the key is a throw-away one that matches nothing, so typing somebody else's e-mail reveals none of their data;
//   * no answer ever contains another person's data; no log line contains an e-mail address, an IP or a token.

export interface WaitlistDeps {
  allowedOrigins: readonly string[];
  /** WAITLIST_SECRET. Empty = not configured. */
  secret: string;
  /** null when the service role key / URL are missing. */
  store: WaitlistStore | null;
  /** Random bytes for the share code and the view key; tests inject a fixed source. */
  random?: RandomBytes;
}

const OK = { ok: true } as const; // (the unsubscribe answer)

type Gate = { response: Response } | { response: null; cors: Record<string, string> | null; origin: string | null };

/** Everything both handlers check before looking at the body. */
function gate(req: Request, deps: WaitlistDeps): Gate {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin, deps.allowedOrigins);
  const reply = (body: unknown, status: number) => json(body, status, cors ?? {});
  if (deps.allowedOrigins.length === 0 || !deps.secret || !deps.store) return { response: reply({ ok: false, error: 'unavailable' }, 503) };
  if (req.method === 'OPTIONS') return { response: cors ? new Response(null, { status: 204, headers: cors }) : new Response(null, { status: 403 }) };
  if (req.method !== 'POST') return { response: reply({ ok: false, error: 'method_not_allowed' }, 405) };
  // A browser always sends Origin on a cross-origin POST; one that is not the portal is refused. (A script without Origin is not a browser: it meets the same limits and the honeypot.)
  if (origin !== null && !cors) return { response: json({ ok: false, error: 'forbidden_origin' }, 403) };
  return { response: null, cors, origin };
}

async function readJson(req: Request): Promise<{ ok: true; value: unknown } | { ok: false }> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return { ok: false };
  let text: string;
  try {
    text = await req.text();
  } catch {
    return { ok: false };
  }
  if (text.length > MAX_BODY_BYTES) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

export async function handleWaitlistJoin(req: Request, deps: WaitlistDeps): Promise<Response> {
  const g = gate(req, deps);
  if (g.response) return g.response;
  const reply = (body: unknown, status = 200) => json(body, status, g.cors ?? {});
  const random = deps.random ?? systemRandom;
  const body = await readJson(req);
  if (!body.ok) return reply({ ok: false, error: 'bad_request' }, 400);
  const parsed = parseJoinBody(body.value);
  if (parsed.kind === 'honeypot') return reply({ ok: true, code: generateReferralCode(random), key: generateViewKey(random) }); // looks like a success; nothing is stored
  if (parsed.kind === 'invalid') return reply({ ok: false, error: parsed.reason }, 400);
  try {
    const keys = await hashKeys(deps.secret, parsed.input.email, clientIp(req.headers));
    for (let attempt = 0; attempt < 4; attempt++) {
      const key = generateViewKey(random);
      const result = await deps.store!.join({ ...parsed.input, ...keys, newCode: generateReferralCode(random), viewKeyHash: await hashViewKey(deps.secret, key) });
      if (result.status === 'code_taken') continue; // the random public code collided (about 1 in 10^15): try another
      if (result.status === 'rate_limited') return reply({ ok: false, error: 'rate_limited' }, 429);
      if (!result.code) throw new Error('no_code');
      return reply({ ok: true, code: result.code, key }); // 'joined' and 'exists' are indistinguishable on purpose
    }
    throw new Error('code_collisions');
  } catch {
    console.error('waitlist_join_failed'); // no details: an error text could carry the address
    return reply({ ok: false, error: 'unavailable' }, 503);
  }
}

/**
 * waitlist-referrals: the two counters (qualified, paying) for the person who holds BOTH the public code and the private view key. There is no lookup by e-mail, ever: a wrong key, a
 * made-up key and an unknown code all get zeros, exactly like a right key on a brand-new sign-up, so the answer never says whether a code or an address exists.
 */
export async function handleWaitlistReferrals(req: Request, deps: WaitlistDeps): Promise<Response> {
  const g = gate(req, deps);
  if (g.response) return g.response;
  const reply = (body: unknown, status = 200) => json(body, status, g.cors ?? {});
  const body = await readJson(req);
  if (!body.ok) return reply({ ok: false, error: 'bad_request' }, 400);
  const parsed = parseStatsBody(body.value);
  if (parsed.kind === 'invalid') return reply({ ok: false, error: 'bad_request' }, 400);
  try {
    const ip = clientIp(req.headers);
    const result = await deps.store!.referralStats(parsed.code, await hashViewKey(deps.secret, parsed.key), ip ? await hmacHex(deps.secret, `ip:${ip}`) : null);
    if (result.status === 'rate_limited') return reply({ ok: false, error: 'rate_limited' }, 429);
    return reply({ ok: true, qualified: result.stats.qualified, paying: result.stats.paying, passGoal: result.stats.passGoal });
  } catch {
    console.error('waitlist_referrals_failed');
    return reply({ ok: false, error: 'unavailable' }, 503);
  }
}

export async function handleWaitlistUnsubscribe(req: Request, deps: WaitlistDeps): Promise<Response> {
  const g = gate(req, deps);
  if (g.response) return g.response;
  const reply = (body: unknown, status = 200) => json(body, status, g.cors ?? {});
  const body = await readJson(req);
  if (!body.ok || !body.value || typeof body.value !== 'object') return reply({ ok: false, error: 'bad_request' }, 400);
  const id = await verifyUnsubscribeToken(deps.secret, (body.value as Record<string, unknown>).token);
  if (!id) return reply({ ok: false, error: 'bad_token' }, 400);
  try {
    const ip = clientIp(req.headers);
    const result = await deps.store!.unsubscribe(id, ip ? await hmacHex(deps.secret, `ip:${ip}`) : null);
    if (result.status === 'rate_limited') return reply({ ok: false, error: 'rate_limited' }, 429);
    return reply(OK);
  } catch {
    console.error('waitlist_unsubscribe_failed');
    return reply({ ok: false, error: 'unavailable' }, 503);
  }
}
