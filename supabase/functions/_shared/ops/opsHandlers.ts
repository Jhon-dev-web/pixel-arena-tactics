import { json } from '../http.ts';
import type { AuditorMode, AuditorResult } from './auditor.ts';
import type { WatchdogResult } from './watchdog.ts';

// The HTTP faces of the two operations functions. Both are called by pg_cron (through pg_net) with the shared secret in the header x-ops-secret and are deployed with --no-verify-jwt: that secret IS the
// authentication, so both answer 503 until OPS_CRON_SECRET is set, and 401 for any other value. The watchdog also has ONE public, read-only GET (the health URL for an external uptime monitor) that
// answers {ok, checkedAt} and nothing else.

export const MAX_OPS_BODY_BYTES = 1_024;

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

/** Constant-time comparison of two secrets (both are hashed first, so the length does not leak either). */
export async function secretsMatch(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(given), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export type OpsAuth = 'ok' | 'unconfigured' | 'denied';

export async function authorizeOps(req: Request, secret: string | undefined): Promise<OpsAuth> {
  if (!secret || secret.length < 16) return 'unconfigured';
  const given = req.headers.get('x-ops-secret') ?? '';
  return (await secretsMatch(given, secret)) ? 'ok' : 'denied';
}

async function readSmallBody(req: Request): Promise<Record<string, unknown> | null> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_OPS_BODY_BYTES) return null;
  let text: string;
  try {
    text = await req.text();
  } catch {
    return null;
  }
  if (new TextEncoder().encode(text).length > MAX_OPS_BODY_BYTES) return null;
  if (text.trim() === '') return {};
  try {
    const v: unknown = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export interface AuditorHttpDeps {
  secret: string | undefined;
  run: (mode: AuditorMode) => Promise<AuditorResult>;
}

/** POST { "mode": "hourly" | "daily" } with the shared secret. The answer carries counts and statuses, never the report text or any player data. */
export async function handleAuditorRequest(req: Request, deps: AuditorHttpDeps): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const auth = await authorizeOps(req, deps.secret);
  if (auth === 'unconfigured') return json({ error: 'unavailable' }, 503);
  if (auth === 'denied') return json({ error: 'unauthorized' }, 401);
  const body = await readSmallBody(req);
  if (!body) return json({ error: 'bad_request' }, 400);
  const mode = body.mode === undefined ? 'hourly' : body.mode;
  if (mode !== 'hourly' && mode !== 'daily') return json({ error: 'bad_request' }, 400);
  try {
    const r = await deps.run(mode);
    return json({ ok: true, mode: r.mode, status: r.status, signals: r.signals, severity: r.severity, modelStatus: r.modelStatus, alerted: r.alerted, costUsd: r.costUsd, reportId: r.reportId }, 200);
  } catch (err) {
    console.error('[ai-auditor] failed', err instanceof Error ? err.message : 'unknown'); // message only: never the aggregates, a key or a body
    return json({ error: 'auditor_failed' }, 502);
  }
}

export interface WatchdogHttpDeps {
  secret: string | undefined;
  run: () => Promise<WatchdogResult>;
  /** Resolves when the database answered a trivial query in time. */
  probe: () => Promise<boolean>;
  nowMs?: () => number;
}

/** GET = public health (no secret, cached 15 s). POST with the shared secret = the full set of checks. */
export function createWatchdogHandler(deps: WatchdogHttpDeps): (req: Request) => Promise<Response> {
  const now = deps.nowMs ?? (() => Date.now());
  let cached: { at: number; ok: boolean } | null = null;
  return async (req) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      const t = now();
      if (!cached || t - cached.at > 15_000) {
        const ok = await deps.probe().catch(() => false);
        cached = { at: t, ok };
      }
      return json({ ok: cached.ok, checkedAt: new Date(cached.at).toISOString() }, cached.ok ? 200 : 503);
    }
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    const auth = await authorizeOps(req, deps.secret);
    if (auth === 'unconfigured') return json({ error: 'unavailable' }, 503);
    if (auth === 'denied') return json({ error: 'unauthorized' }, 401);
    try {
      const r = await deps.run();
      return json({ ok: r.ok, checks: r.checks, incidents: r.incidents, pauses: r.pauses, resolved: r.resolved, persisted: r.persisted }, 200);
    } catch (err) {
      console.error('[ops-watchdog] failed', err instanceof Error ? err.message : 'unknown');
      return json({ error: 'watchdog_failed' }, 502);
    }
  };
}
