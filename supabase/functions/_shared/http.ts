// Small HTTP helpers shared by the functions.

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra } });
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parses APP_ORIGIN: one or more comma-separated origins. Only https (or http on localhost, for local tests) is accepted; anything else is dropped. */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    try {
      const u = new URL(trimmed);
      const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
      if (u.protocol === 'https:' || (u.protocol === 'http:' && local)) out.push(u.origin);
    } catch {
      /* not a URL: ignored */
    }
  }
  return out;
}
