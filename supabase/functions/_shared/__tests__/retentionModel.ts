// A TypeScript model of the progress_snapshots compaction rule of migration 0019 (public.retention_run). The rule lives in SQL (the database runs it); this file restates it as one small pure
// function so it can be tested exhaustively without a database. migration0019.test.ts reads the SQL and pins the same predicates and the same defaults, so the two cannot drift apart silently.

export type Verdict = 'ok' | 'flagged' | 'rejected';

export interface Snapshot {
  id: string;
  userId: string;
  atMs: number;
  verdict: Verdict;
  /** Reason codes. An ok snapshot may carry advisory notes (FAST_*) or MANUAL_BASELINE. */
  reasons: string[];
}

export interface Season {
  number: number;
  kind: 'pre' | 'ranked';
  /** null while a ranked season has not started (migration 0006). */
  startsMs: number | null;
  endsMs: number | null;
  status: 'upcoming' | 'open' | 'frozen' | 'closed' | 'paid';
}

/** The defaults of arena_private.retention_config. */
export interface RetentionConfig {
  batchSize: number;
  snapshotFullDays: number;
  snapshotMonthlyAfterDays: number | null;
  snapshotFlagHoldDays: number;
  snapshotParticipantsOnly: boolean;
  snapshotPreSeasonFull: boolean;
}

export const DEFAULT_RETENTION: RetentionConfig = {
  batchSize: 10_000,
  snapshotFullDays: 30,
  snapshotMonthlyAfterDays: 90,
  snapshotFlagHoldDays: 90,
  snapshotParticipantsOnly: true,
  snapshotPreSeasonFull: false,
};

export interface RetentionContext {
  nowMs: number;
  /** arena_private.season_goal.reset_at: the first League's reset (null before it). */
  resetAtMs: number | null;
  seasons: readonly Season[];
  /** season_entries / season_profession_entries rows: who took part in which season. */
  participants: readonly { season: number; userId: string }[];
  /** season_entries.best_snapshot_id / season_profession_entries.best_snapshot_id. */
  pinnedIds: ReadonlySet<string>;
  /** progress_flag_clears.snapshot_id: flagged / rejected snapshots the owner forgave. */
  clearedIds: ReadonlySet<string>;
}

const DAY_MS = 86_400_000;

const dayBucket = (ms: number): number => Math.floor(ms / DAY_MS);
// UTC calendar month number: year * 12 + month.
const monthBucket = (ms: number): number => {
  const d = new Date(ms);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
};

/**
 * The ids of the snapshots one call of public.retention_run(false) deletes (oldest first, at most config.batchSize).
 * Mirrors the SQL step by step: candidates are 'ok' rows only; the bucket is (user, day or month, side of the League reset); a bucket keeps its first and its last ok row; a row is held by an
 * unpaid ranked season window (participants only by default), by an open flag, by a note, by a pinned best_snapshot_id; and it is eligible inside a paid season or when older than the full-history days.
 */
export function snapshotsToDelete(all: readonly Snapshot[], ctx: RetentionContext, cfg: RetentionConfig = DEFAULT_RETENTION): string[] {
  const fullCut = ctx.nowMs - cfg.snapshotFullDays * DAY_MS;
  const monthCut = cfg.snapshotMonthlyAfterDays === null ? null : ctx.nowMs - cfg.snapshotMonthlyAfterDays * DAY_MS;
  const flagCut = ctx.nowMs - cfg.snapshotFlagHoldDays * DAY_MS;

  const within = (s: Season, ms: number): boolean => s.startsMs !== null && s.endsMs !== null && ms >= s.startsMs && ms <= s.endsMs;
  const takesPart = (season: number, userId: string): boolean => ctx.participants.some((p) => p.season === season && p.userId === userId);

  const held = ctx.seasons.filter((s) => (s.kind === 'ranked' && s.status !== 'paid') || (cfg.snapshotPreSeasonFull && s.kind === 'pre' && (s.status === 'open' || s.status === 'frozen')));
  const paid = ctx.seasons.filter((s) => s.kind === 'ranked' && s.status === 'paid');

  const usersWithOpenFlag = new Set(all.filter((s) => s.verdict !== 'ok' && !ctx.clearedIds.has(s.id)).map((s) => s.userId));

  interface Row {
    s: Snapshot;
    inPaid: boolean;
    inHeld: boolean;
    monthly: boolean;
    afterReset: boolean;
    key: string;
  }
  const rows: Row[] = [];
  for (const s of all) {
    if (s.verdict !== 'ok') continue;
    const inPaid = paid.some((p) => within(p, s.atMs));
    if (!(inPaid || s.atMs < fullCut)) continue; // the pre-filter: newer rows are not part of the set
    const inHeld = held.some((h) => within(h, s.atMs) && (!cfg.snapshotParticipantsOnly || takesPart(h.number, s.userId)));
    const monthly = monthCut !== null && s.atMs < monthCut;
    const afterReset = ctx.resetAtMs !== null && s.atMs >= ctx.resetAtMs;
    rows.push({ s, inPaid, inHeld, monthly, afterReset, key: `${s.userId}|${monthly}|${afterReset}|${monthly ? monthBucket(s.atMs) : dayBucket(s.atMs)}` });
  }

  const buckets = new Map<string, Row[]>();
  for (const r of rows) {
    const list = buckets.get(r.key);
    if (list) list.push(r);
    else buckets.set(r.key, [r]);
  }
  const keepers = new Set<string>();
  for (const list of buckets.values()) {
    list.sort((a, b) => a.s.atMs - b.s.atMs || (a.s.id < b.s.id ? -1 : 1));
    keepers.add(list[0].s.id);
    keepers.add(list[list.length - 1].s.id);
  }

  const doomed = rows
    .filter((r) => !keepers.has(r.s.id))
    .filter((r) => !r.inHeld)
    .filter((r) => r.s.reasons.length === 0)
    .filter((r) => !ctx.pinnedIds.has(r.s.id))
    .filter((r) => !(r.s.atMs >= flagCut && usersWithOpenFlag.has(r.s.userId)))
    .sort((a, b) => a.s.atMs - b.s.atMs)
    .slice(0, cfg.batchSize)
    .map((r) => r.s);

  // Belt and braces of the DELETE statement: only an ok row that has a NEWER ok row of the same account.
  return doomed.filter((d) => all.some((n) => n.userId === d.userId && n.verdict === 'ok' && n.atMs > d.atMs)).map((d) => d.id);
}

/** What is left of the table after one call. */
export function applyRetention(all: readonly Snapshot[], ctx: RetentionContext, cfg: RetentionConfig = DEFAULT_RETENTION): Snapshot[] {
  const gone = new Set(snapshotsToDelete(all, ctx, cfg));
  return all.filter((s) => !gone.has(s.id));
}
