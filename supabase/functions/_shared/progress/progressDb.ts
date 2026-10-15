import type { HistoryPoint, Verdict } from './evaluate.ts';
import type { NewSnapshot, ProfessionApplyStatus, ProgressStore, SeasonApplyStatus, StoredSnapshot } from './handler.ts';
import { Peak, ProgressMetrics, peakOf } from './metrics.ts';

// The real ProgressStore: PostgREST over fetch with the SERVICE ROLE key (injected by the Supabase Edge runtime; never logged, never returned).
// Values go through URLSearchParams / JSON, never concatenated into a filter by hand. Errors carry the status only (bodies can echo data).
export interface ProgressDbConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetchFn?: typeof fetch;
}

interface SnapshotRow {
  id: string;
  created_at: string;
  save_revision: number;
  verdict: Verdict;
  reasons: string[];
  metrics: ProgressMetrics & { _peak?: Peak };
}

const SNAPSHOT_COLUMNS = 'id,created_at,save_revision,verdict,reasons,metrics';

export function createProgressStore(cfg: ProgressDbConfig): ProgressStore {
  const doFetch = cfg.fetchFn ?? fetch;
  const base = `${cfg.supabaseUrl.replace(/\/$/, '')}/rest/v1`;
  const headers = (extra: Record<string, string> = {}) => ({
    apikey: cfg.serviceRoleKey,
    authorization: `Bearer ${cfg.serviceRoleKey}`,
    'content-type': 'application/json',
    ...extra,
  });
  const failure = (what: string, res: Response): Error => new Error(`${what}_${res.status}`);

  const getRows = async <T>(path: string, params: URLSearchParams, what: string): Promise<T[]> => {
    const res = await doFetch(`${base}/${path}?${params}`, { headers: headers() });
    if (!res.ok) throw failure(what, res);
    return (await res.json()) as T[];
  };

  const rpc = async <T>(fn: string, args: Record<string, unknown>, what: string): Promise<T> => {
    const res = await doFetch(`${base}/rpc/${fn}`, { method: 'POST', headers: headers(), body: JSON.stringify(args) });
    if (!res.ok) throw failure(what, res);
    return (await res.json()) as T;
  };

  // Only an `ok` snapshot is ever a baseline (first / last) and raises the peak: a flagged or rejected one never does, so re-sending the same inflated save later is judged
  // against the last clean history again instead of against itself.
  const snapshotRows = (userId: string, order: 'asc' | 'desc', acceptedOnly: boolean): Promise<SnapshotRow[]> => {
    const q = new URLSearchParams({ select: SNAPSHOT_COLUMNS, user_id: `eq.${userId}`, order: `created_at.${order}`, limit: '1' });
    if (acceptedOnly) q.set('verdict', 'eq.ok');
    return getRows<SnapshotRow>('progress_snapshots', q, 'snapshot_read');
  };

  const toMetrics = (row: SnapshotRow): ProgressMetrics => {
    const { _peak: _ignored, ...metrics } = row.metrics;
    void _ignored;
    return metrics as ProgressMetrics;
  };
  const toStored = (row: SnapshotRow): StoredSnapshot => ({ id: row.id, createdAtMs: Date.parse(row.created_at), verdict: row.verdict, reasons: row.reasons ?? [], metrics: toMetrics(row) });
  const toPoint = (row: SnapshotRow): HistoryPoint => {
    const metrics = toMetrics(row);
    return { atMs: Date.parse(row.created_at), metrics, peak: row.metrics._peak ?? peakOf(metrics), saveRevision: row.save_revision };
  };

  return {
    async hasActivePass(userId: string) {
      const q = new URLSearchParams({ select: 'id', user_id: `eq.${userId}`, kind: 'eq.adventurer_pass', status: 'eq.active', limit: '1' });
      return (await getRows<unknown>('entitlements', q, 'entitlement_read')).length > 0;
    },

    // revision + save_data in ONE read, so the hash compared with the posted blob belongs to the revision the snapshot records. Never created_at (the owner can edit it).
    async character(userId: string) {
      const q = new URLSearchParams({ select: 'revision,save_data', user_id: `eq.${userId}`, limit: '1' });
      const rows = await getRows<{ revision: number; save_data: unknown }>('characters', q, 'character_read');
      return rows[0] ? { revision: rows[0].revision, saveData: rows[0].save_data } : null;
    },

    // The account age: auth.users.created_at through a service-role-only function (migration 0007), not a column the player can write.
    async accountCreatedAtMs(userId: string) {
      const at = await rpc<string | null>('progress_account_created_at', { p_user_id: userId }, 'account_age_read');
      const ms = typeof at === 'string' ? Date.parse(at) : Number.NaN;
      return Number.isFinite(ms) ? ms : null;
    },

    async claimSlot(userId: string, intervalMs: number) {
      return (await rpc<unknown>('progress_claim_slot', { p_user_id: userId, p_interval_seconds: Math.ceil(intervalMs / 1000) }, 'slot_claim')) === true;
    },

    async releaseSlot(userId: string) {
      await rpc<unknown>('progress_release_slot', { p_user_id: userId }, 'slot_release');
    },

    async lastSnapshot(userId: string) {
      const rows = await snapshotRows(userId, 'desc', false);
      return rows[0] ? toStored(rows[0]) : null;
    },

    async acceptedHistory(userId: string) {
      const [first, last] = await Promise.all([snapshotRows(userId, 'asc', true), snapshotRows(userId, 'desc', true)]);
      return { first: first[0] ? toPoint(first[0]) : null, last: last[0] ? toPoint(last[0]) : null };
    },

    async insertSnapshot(row: NewSnapshot) {
      const res = await doFetch(`${base}/progress_snapshots?select=id`, {
        method: 'POST',
        headers: headers({ prefer: 'return=representation' }),
        body: JSON.stringify({
          user_id: row.userId,
          save_revision: row.saveRevision,
          schema_version: row.schemaVersion,
          app_version: row.appVersion,
          metrics: { ...row.metrics, _peak: row.peak },
          metrics_hash: row.metricsHash,
          verdict: row.verdict,
          reasons: row.reasons,
        }),
      });
      if (!res.ok) throw failure('snapshot_write', res);
      const rows = (await res.json()) as { id: string }[];
      if (!rows[0]?.id) throw new Error('snapshot_write_empty');
      return { id: rows[0].id };
    },

    async applyProfessionsToSeason(args) {
      const res = await doFetch(`${base}/rpc/season_apply_professions`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ p_user_id: args.userId, p_snapshot_id: args.snapshotId, p_verdict: args.verdict, p_professions: args.professions }),
      });
      if (!res.ok) throw failure('season_apply_professions', res);
      return (await res.json()) as ProfessionApplyStatus;
    },

    async applyToSeason(args) {
      const res = await doFetch(`${base}/rpc/season_apply_snapshot`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ p_user_id: args.userId, p_snapshot_id: args.snapshotId, p_verdict: args.verdict, p_reasons: args.reasons, p_score: args.score }),
      });
      if (!res.ok) throw failure('season_apply', res);
      return (await res.json()) as SeasonApplyStatus;
    },
  };
}
