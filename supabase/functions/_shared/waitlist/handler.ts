import { json } from '../http.ts';
import { MAX_BODY_BYTES, clientIp, corsHeaders, hashKeys, hmacHex, parseJoinBody } from './logic.ts';
import type { WaitlistStore } from './store.ts';
import { verifyUnsubscribeToken } from './token.ts';

// The two public functions of the waitlist. NO JWT: anyone on the internet can call them, so they are built to be harmless to call:
//   * CORS only for the portal origin(s) in PORTAL_ORIGIN; a request from any other browser origin is refused.
//   * a honeypot field that a person never fills; a filled one gets the same answer as a success and nothing is stored.
//   * rate limits per hashed IP, network and e-mail, counted atomically in the database;
//   * the answer for a NEW address and for one that is ALREADY on the list is byte for byte the same: nobody can use the form to find out who is on the list;
//   * no answer ever contains another person's data; no log line contains an e-mail address, an IP or a token.

export interface WaitlistDeps {
  allowedOrigins: readonly string[];
  /** WAITLIST_SECRET. Empty = not configured. */
  secret: string;
  /** null when the service role key / URL are missing. */
  store: WaitlistStore | null;
}

const OK = { ok: true } as const;

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
  const body = await readJson(req);
  if (!body.ok) return reply({ ok: false, error: 'bad_request' }, 400);
  const parsed = parseJoinBody(body.value);
  if (parsed.kind === 'honeypot') return reply(OK); // looks like a success; nothing is stored
  if (parsed.kind === 'invalid') return reply({ ok: false, error: parsed.reason }, 400);
  try {
    const keys = await hashKeys(deps.secret, parsed.input.email, clientIp(req.headers));
    const result = await deps.store!.join({ ...parsed.input, ...keys });
    if (result.status === 'rate_limited') return reply({ ok: false, error: 'rate_limited' }, 429);
    return reply(OK); // 'joined' and 'exists' are indistinguishable on purpose
  } catch {
    console.error('waitlist_join_failed'); // no details: an error text could carry the address
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
