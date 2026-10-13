import { UUID_RE } from './http.ts';

// Resolves the caller from his Supabase JWT by asking the Auth server (GET /auth/v1/user), which checks signature, expiry and revocation.
// The user id used anywhere else in these functions comes ONLY from here, never from a request body, query or header other than Authorization.
export interface AuthConfig {
  supabaseUrl: string;
  anonKey: string;
  fetchFn?: typeof fetch;
}

export async function getAuthenticatedUserId(req: Request, cfg: AuthConfig): Promise<string | null> {
  const header = req.headers.get('authorization') ?? '';
  const match = /^Bearer\s+([A-Za-z0-9._~+/=-]{20,4096})$/.exec(header);
  if (!match) return null;
  const doFetch = cfg.fetchFn ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${cfg.supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, { headers: { apikey: cfg.anonKey, authorization: `Bearer ${match[1]}` } });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  try {
    const body = (await res.json()) as { id?: unknown };
    return typeof body.id === 'string' && UUID_RE.test(body.id) ? body.id.toLowerCase() : null;
  } catch {
    return null;
  }
}
