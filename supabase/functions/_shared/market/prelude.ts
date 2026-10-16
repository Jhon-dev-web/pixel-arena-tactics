import { AuthConfig, getAuthenticatedUserId } from '../auth.ts';
import { json } from '../http.ts';

// The start of every market function: CORS against APP_ORIGIN, POST only, the caller from the verified JWT (and nowhere else), a small JSON body. Same contract as mint-item.
export const MAX_BODY_BYTES = 8 * 1024;

export function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
    'access-control-allow-methods': 'POST, OPTIONS',
    vary: 'Origin',
  };
}

export type Prelude = { ok: true; userId: string; body: Record<string, unknown>; cors: Record<string, string> } | { ok: false; response: Response };

export async function prelude(req: Request, auth: AuthConfig, allowedOrigins: string[]): Promise<Prelude> {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin, allowedOrigins);
  if (req.method === 'OPTIONS') return { ok: false, response: new Response(null, { status: 204, headers: cors }) };
  if (req.method !== 'POST') return { ok: false, response: json({ error: 'method_not_allowed' }, 405, cors) };
  if (allowedOrigins.length === 0) return { ok: false, response: json({ error: 'unavailable' }, 503, cors) };
  if (origin && !allowedOrigins.includes(origin)) return { ok: false, response: json({ error: 'origin_not_allowed' }, 403) };
  const userId = await getAuthenticatedUserId(req, auth);
  if (!userId) return { ok: false, response: json({ error: 'unauthenticated' }, 401, cors) };
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return { ok: false, response: json({ error: 'too_large' }, 413, cors) };
  let text: string;
  try {
    text = await req.text();
  } catch {
    return { ok: false, response: json({ error: 'bad_request' }, 400, cors) };
  }
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return { ok: false, response: json({ error: 'too_large' }, 413, cors) };
  try {
    const body: unknown = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, response: json({ error: 'bad_request' }, 400, cors) };
    return { ok: true, userId, body: body as Record<string, unknown>, cors };
  } catch {
    return { ok: false, response: json({ error: 'bad_request' }, 400, cors) };
  }
}
