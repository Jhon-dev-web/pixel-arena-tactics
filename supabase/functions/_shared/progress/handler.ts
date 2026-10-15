import { AuthConfig, getAuthenticatedUserId } from '../auth.ts';
import { json } from '../http.ts';
import { HistoryPoint, Verdict, evaluateSnapshot } from './evaluate.ts';
import { ProfessionId, ProgressMetrics, computeScore, extractMetrics, professionScores, scoreParts } from './metrics.ts';

// submit-progress: the game posts its current save; the function extracts the numbers itself, judges them against the account's SERVER history and stores a snapshot
// stamped with the database clock. The user id comes ONLY from the verified JWT. Nothing in the body is trusted except as the thing being judged.

/** Same number as MAX_SAVE_UPLOAD_BYTES in src/game/saveUpload.ts (a test pins them together): the biggest save the client ever uploads. */
export const MAX_BODY_BYTES = 288 * 1024;

/** One stored snapshot per user per window (any verdict). Calls inside the window get the last verdict back and store nothing. */
export const SNAPSHOT_MIN_INTERVAL_MS = 10 * 60 * 1000;

/** What the client is told to wait when its blob is not (yet) the saved game: the game saves on its own rhythm, so a short wait is enough. */
export const SAVE_NOT_SYNCED_RETRY_S = 30;

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

export type SeasonApplyStatus = 'updated' | 'unchanged' | 'flags_recorded' | 'season_not_open' | 'no_pass' | 'email_unconfirmed' | 'disqualified' | 'flagged_history';

/** Persistence used by the handler. The real one (progressDb.ts) talks to PostgREST with the service role; tests use an in-memory fake. */
export interface ProgressStore {
  hasActivePass(userId: string): Promise<boolean>;
  /**
   * characters.revision and characters.save_data of the account, read together (null when it has no character yet). NEVER characters.created_at: the owner of the row can
   * edit that column through RLS, so the account age comes from accountCreatedAtMs.
   */
  character(userId: string): Promise<{ revision: number; saveData: unknown } | null>;
  /** When the ACCOUNT was created, from auth.users (arena_private.account_created_at, service role only). null when unknown. */
  accountCreatedAtMs(userId: string): Promise<number | null>;
  /**
   * Atomically claims this user's snapshot slot: true for exactly one of any number of concurrent callers inside the interval (a single SQL statement,
   * progress_claim_slot). The database clock decides, not this process.
   */
  claimSlot(userId: string, intervalMs: number): Promise<boolean>;
  /** Gives a claimed slot back when nothing was stored after all (best effort). */
  releaseSlot?(userId: string): Promise<void>;
  /** The newest snapshot of any verdict (the answer for a throttled call). */
  lastSnapshot(userId: string): Promise<StoredSnapshot | null>;
  /** The account's first and latest `ok` snapshots as history points. A flagged or rejected snapshot is never a baseline. */
  acceptedHistory(userId: string): Promise<{ first: HistoryPoint | null; last: HistoryPoint | null }>;
  /** Inserts the row (created_at = the database clock) and returns its id. */
  insertSnapshot(row: NewSnapshot): Promise<{ id: string }>;
  /** Hands the snapshot to the season ranking (migration 0005). Absent until the ranking is wired. */
  applyToSeason?(args: { userId: string; snapshotId: string; verdict: Verdict; reasons: string[]; score: number }): Promise<SeasonApplyStatus>;
  /** Hands the profession skill XP to the profession rankings (migration 0006). Absent / failing never blocks the main ranking. */
  applyProfessionsToSeason?(args: { userId: string; snapshotId: string; verdict: Verdict; professions: { profession: ProfessionId; xp: number; level: number }[] }): Promise<ProfessionApplyStatus>;
}

export type ProfessionApplyStatus = 'updated' | 'unchanged' | 'season_not_open' | 'no_pass' | 'email_unconfirmed' | 'disqualified' | 'not_ok' | 'nothing';

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

/** Stable JSON (keys sorted) so equal values always hash equal. Used for the metrics hash AND for comparing the posted save with the stored one. */
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

  let slotClaimed = false;
  try {
    const now = deps.nowMs();

    // Fast path for the common throttled call: no big read at all.
    const last = await deps.store.lastSnapshot(userId);
    if (last && now - last.createdAtMs < SNAPSHOT_MIN_INTERVAL_MS) {
      return json(answer(last, { throttled: true, retryAfterSeconds: Math.ceil((SNAPSHOT_MIN_INTERVAL_MS - (now - last.createdAtMs)) / 1000) }), 200, cors);
    }

    // The blob must BE the saved game: same canonical hash as characters.save_data, read together with the revision it belongs to. If the game saved in between (or has not
    // saved yet) this is a retryable 409, never a flag: nothing is stored and the rate-limit slot is not spent.
    const character = await deps.store.character(userId);
    if (!character || (await sha256Hex(canonicalJson(blob))) !== (await sha256Hex(canonicalJson(character.saveData)))) {
      return json({ error: 'save_not_synced', retryable: true, retryAfterSeconds: SAVE_NOT_SYNCED_RETRY_S }, 409, { ...cors, 'retry-after': String(SAVE_NOT_SYNCED_RETRY_S) });
    }

    // The atomic limit: of two parallel calls exactly one gets the slot.
    slotClaimed = await deps.store.claimSlot(userId, SNAPSHOT_MIN_INTERVAL_MS);
    if (!slotClaimed) {
      const again = await deps.store.lastSnapshot(userId);
      if (again) return json(answer(again, { throttled: true, retryAfterSeconds: Math.ceil(SNAPSHOT_MIN_INTERVAL_MS / 1000) }), 200, cors);
      return json({ error: 'busy', retryAfterSeconds: 5 }, 429, { ...cors, 'retry-after': '5' }); // the winner has not stored its snapshot yet
    }

    const [entitled, accountCreatedMs, history] = await Promise.all([deps.store.hasActivePass(userId), deps.store.accountCreatedAtMs(userId), deps.store.acceptedHistory(userId)]);
    const saveRevision = character.revision;
    const evaluation = evaluateSnapshot(metrics, {
      nowMs: now,
      accountCreatedMs,
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
    slotClaimed = false; // spent for real: a snapshot exists

    const score = computeScore(metrics);
    const season = deps.store.applyToSeason
      ? await deps.store.applyToSeason({ userId, snapshotId: stored.id, verdict: evaluation.verdict, reasons: evaluation.reasons, score })
      : null;

    // The profession rankings follow the main one: only when the main ranking just accepted an ok snapshot of an eligible player ('updated' or 'unchanged'), and a failure here
    // (migration 0006 not applied yet, a network error) never turns a stored snapshot into an error.
    let professions: ProfessionApplyStatus | null = null;
    if (deps.store.applyProfessionsToSeason && (season === 'updated' || season === 'unchanged') && evaluation.verdict === 'ok') {
      try {
        professions = await deps.store.applyProfessionsToSeason({ userId, snapshotId: stored.id, verdict: evaluation.verdict, professions: professionScores(metrics) });
      } catch (err) {
        console.error('[submit-progress] professions failed', err instanceof Error ? err.message : 'unknown');
      }
    }

    return json(answer({ verdict: evaluation.verdict, reasons: evaluation.reasons, metrics }, { throttled: false, season, professions }), 200, cors);
  } catch (err) {
    if (slotClaimed && deps.store.releaseSlot) await deps.store.releaseSlot(userId).catch(() => undefined); // nothing was stored: do not make the player wait 10 minutes for our failure
    console.error('[submit-progress] failed', err instanceof Error ? err.message : 'unknown'); // message only: never the save, a key or a token
    return json({ error: 'submit_failed' }, 502, cors);
  }
}
