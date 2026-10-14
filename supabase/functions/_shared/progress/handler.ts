import { AuthConfig, getAuthenticatedUserId } from '../auth.ts';
import { json } from '../http.ts';
import { HistoryPoint, Verdict, evaluateSnapshot } from './evaluate.ts';
import { ProgressMetrics, computeScore, extractMetrics, scoreParts } from './metrics.ts';

// submit-progress: the game posts its current save; the function extracts the numbers itself, judges them against the account's SERVER history and stores a snapshot
// stamped with the database clock. The user id comes ONLY from the verified JWT. Nothing in the body is trusted except as the thing being judged.

/** Same number as MAX_SAVE_UPLOAD_BYTES in src/game/saveUpload.ts (a test pins them together): the biggest save the client ever uploads. */
export const MAX_BODY_BYTES = 288 * 1024;

/** One stored snapshot per user per window (any verdict). Calls inside the window get the last verdict back and store nothing. */
export const SNAPSHOT_MIN_INTERVAL_MS = 10 * 60 * 1000;

export interface StoredSnapshot {
  id: string;
  createdAtMs: number;
  verdict: Verdict;
  reasons: string[];
  metrics: ProgressMetrics;
}

export interface NewSnapshot {
  userId: string;
  saveRevision: number;
  schemaVersion: number;
  appVersion: string | null;
  metrics: ProgressMetrics;
  peak: HistoryPoint['peak'];
  metricsHash: string;
  verdict: Verdict;
  reasons: string[];
}

export type SeasonApplyStatus = 'updated' | 'unchanged' | 'flags_recorded' | 'season_not_open' | 'no_pass' | 'email_unconfirmed' | 'disqualified';

/** Persistence used by the handler. The real one (progressDb.ts) talks to PostgREST with the service role; tests use an in-memory fake. */
export interface ProgressStore {
  hasActivePass(userId: string): Promise<boolean>;
  /** characters.created_at / characters.revision of the account (null when it has no character yet). */
  character(userId: string): Promise<{ createdAtMs: number; revision: number } | null>;
  /** The newest snapshot of any verdict (rate limit and the answer for a throttled call). */
  lastSnapshot(userId: string): Promise<StoredSnapshot | null>;
  /** The account's first and latest ACCEPTED (ok or flagged) snapshots as history points. */
  acceptedHistory(userId: string): Promise<{ first: HistoryPoint | null; last: HistoryPoint | null }>;
  /** Inserts the row (created_at = the database clock) and returns its id. */
  insertSnapshot(row: NewSnapshot): Promise<{ id: string }>;
  /** Hands the snapshot to the season ranking (migration 0005). Absent until the ranking is wired. */
  applyToSeason?(args: { userId: string; snapshotId: string; verdict: Verdict; reasons: string[]; score: number }): Promise<SeasonApplyStatus>;
}

export interface ProgressDeps {
  auth: AuthConfig;
  allowedOrigins: string[];
  store: ProgressStore;
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

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Stable JSON (keys sorted) so equal metrics always hash equal. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const smallInt = (v: unknown, max: number): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(Math.floor(v), max) : 0);

function answer(snapshot: { verdict: Verdict; reasons: string[]; metrics: ProgressMetrics }, extra: Record<string, unknown>) {
  const parts = scoreParts(snapshot.metrics);
  return { verdict: snapshot.verdict, reasons: snapshot.reasons, levelTotal: parts.levelTotal, depthScore: parts.depthScore, ...extra };
}

export async function handleSubmitProgress(req: Request, deps: ProgressDeps): Promise<Response> {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin, deps.allowedOrigins);

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);
  if (deps.allowedOrigins.length === 0) return json({ error: 'unavailable' }, 503, cors);
  if (origin && !deps.allowedOrigins.includes(origin)) return json({ error: 'origin_not_allowed' }, 403);

  const userId = await getAuthenticatedUserId(req, deps.auth);
  if (!userId) return json({ error: 'unauthenticated' }, 401, cors);

  // Size limit before parsing anything (Content-Length when present, and the real length of what was read).
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return json({ error: 'too_large' }, 413, cors);
  let text: string;
  try {
    text = await req.text();
  } catch {
    return json({ error: 'bad_request' }, 400, cors);
  }
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return json({ error: 'too_large' }, 413, cors);

  let blob: unknown;
  try {
    blob = JSON.parse(text);
  } catch {
    return json({ error: 'bad_request' }, 400, cors);
  }
  const metrics = extractMetrics(blob);
  if (!metrics) return json({ error: 'bad_request' }, 400, cors);

  try {
    const now = deps.nowMs();

    const last = await deps.store.lastSnapshot(userId);
    if (last && now - last.createdAtMs < SNAPSHOT_MIN_INTERVAL_MS) {
      return json(answer(last, { throttled: true, retryAfterSeconds: Math.ceil((SNAPSHOT_MIN_INTERVAL_MS - (now - last.createdAtMs)) / 1000) }), 200, cors);
    }

    const [entitled, character, history] = await Promise.all([deps.store.hasActivePass(userId), deps.store.character(userId), deps.store.acceptedHistory(userId)]);
    const saveRevision = character?.revision ?? 0;
    const evaluation = evaluateSnapshot(metrics, {
      nowMs: now,
      accountCreatedMs: character?.createdAtMs ?? null,
      entitled,
      saveRevision,
      first: history.first,
      previous: history.last,
    });

    const rec = blob as Record<string, unknown>;
    const stored = await deps.store.insertSnapshot({
      userId,
      saveRevision,
      schemaVersion: smallInt(rec.schemaVersion, 1000),
      appVersion: typeof rec.appVersion === 'string' ? rec.appVersion.slice(0, 32) : null,
      metrics,
      peak: evaluation.peak,
      metricsHash: await sha256Hex(canonicalJson(metrics)),
      verdict: evaluation.verdict,
      reasons: evaluation.reasons,
    });

    const score = computeScore(metrics);
    const season = deps.store.applyToSeason
      ? await deps.store.applyToSeason({ userId, snapshotId: stored.id, verdict: evaluation.verdict, reasons: evaluation.reasons, score })
      : null;

    return json(answer({ verdict: evaluation.verdict, reasons: evaluation.reasons, metrics }, { throttled: false, season }), 200, cors);
  } catch (err) {
    console.error('[submit-progress] failed', err instanceof Error ? err.message : 'unknown'); // message only: never the save, a key or a token
    return json({ error: 'submit_failed' }, 502, cors);
  }
}
