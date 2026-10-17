import { describe, expect, it } from 'vitest';
import { DEFAULT_RETENTION, RetentionConfig, RetentionContext, Season, Snapshot, Verdict, applyRetention, snapshotsToDelete } from './retentionModel';

// The compaction rule of migration 0019, restated in retentionModel.ts. The SQL itself is pinned by migration0019.test.ts.

const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = Date.UTC(2027, 0, 31, 12, 0, 0);
const at = (daysAgo: number, hour = 10, minute = 0): number => {
  const d = new Date(NOW - daysAgo * DAY);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, minute);
};

let seq = 0;
const snap = (userId: string, atMs: number, verdict: Verdict = 'ok', reasons: string[] = []): Snapshot => ({ id: `s${++seq}`, userId, atMs, verdict, reasons });

const ctx = (over: Partial<RetentionContext> = {}): RetentionContext => ({ nowMs: NOW, resetAtMs: null, seasons: [], participants: [], pinnedIds: new Set(), clearedIds: new Set(), ...over });
const cfg = (over: Partial<RetentionConfig> = {}): RetentionConfig => ({ ...DEFAULT_RETENTION, ...over });
const ids = (rows: Snapshot[]): string[] => rows.map((r) => r.id);

/** Four ok snapshots of one UTC day. */
const dayOf = (userId: string, daysAgo: number): Snapshot[] => [0, 1, 2, 3].map((h) => snap(userId, at(daysAgo, 9 + h)));

const ranked = (number: number, status: Season['status'], startDaysAgo: number, endDaysAgo: number): Season => ({ number, kind: 'ranked', startsMs: NOW - startDaysAgo * DAY, endsMs: NOW - endDaysAgo * DAY, status });

describe('compaction to one first and one last row per user per day', () => {
  it('keeps the first and the last ok snapshot of an old day and deletes the middle ones', () => {
    const day = dayOf('u', 60);
    const left = applyRetention(day, ctx());
    expect(ids(left)).toEqual([day[0].id, day[3].id]);
  });

  it('a day with one or two snapshots loses nothing', () => {
    const rows = [snap('u', at(60, 10)), snap('u', at(59, 10)), snap('u', at(59, 11))];
    expect(snapshotsToDelete(rows, ctx())).toEqual([]);
  });

  it('days and users are compacted separately', () => {
    const rows = [...dayOf('a', 60), ...dayOf('a', 55), ...dayOf('b', 60)];
    const left = applyRetention(rows, ctx());
    expect(left).toHaveLength(6);
    for (const user of ['a', 'b']) expect(left.filter((r) => r.userId === user).length).toBe(user === 'a' ? 4 : 2);
  });

  it('is idempotent: a second pass over what is left deletes nothing', () => {
    const rows = [...dayOf('a', 60), ...dayOf('a', 40), ...dayOf('b', 70), snap('a', at(1))];
    const once = applyRetention(rows, ctx());
    expect(snapshotsToDelete(once, ctx())).toEqual([]);
  });

  it('snapshots younger than the full-history days are never touched (outside a paid season)', () => {
    const rows = dayOf('u', 10);
    expect(snapshotsToDelete(rows, ctx())).toEqual([]);
    expect(snapshotsToDelete(rows, ctx(), cfg({ snapshotFullDays: 7 }))).toHaveLength(2);
  });

  it('the day that straddles the cut keeps its true first and last rows and settles on the next run', () => {
    // a day 30 days ago: its morning rows are older than the cut, its evening rows younger
    const morning = [snap('u', at(30, 1)), snap('u', at(30, 2)), snap('u', at(30, 3))];
    const evening = [snap('u', at(30, 20)), snap('u', at(30, 21))];
    const rows = [...morning, ...evening];
    const left = applyRetention(rows, ctx());
    expect(ids(left)).toEqual([morning[0].id, morning[2].id, evening[0].id, evening[1].id]);
    const later = applyRetention(left, { ...ctx(), nowMs: NOW + 2 * DAY });
    expect(ids(later)).toEqual([morning[0].id, evening[1].id]);
  });
});

describe('what is never deleted', () => {
  it('a flagged or rejected snapshot, whatever else is true (cleared, old, in a paid season)', () => {
    const bad: Snapshot[] = [snap('u', at(80, 10), 'flagged', ['PACE']), snap('u', at(80, 11), 'rejected', ['R']), snap('u', at(80, 12), 'flagged', ['PACE'])];
    const rows = [snap('u', at(80, 9)), ...bad, snap('u', at(80, 13)), snap('u', at(80, 14))];
    const paid: Season = ranked(1, 'paid', 100, 40);
    for (const c of [ctx(), ctx({ seasons: [paid] }), ctx({ clearedIds: new Set(bad.map((b) => b.id)) })]) {
      const left = ids(applyRetention(rows, c, cfg({ snapshotFullDays: 1 })));
      for (const b of bad) expect(left).toContain(b.id);
    }
  });

  it('the latest ok snapshot of every account, even when it is old and its day is full', () => {
    const rows = [...dayOf('a', 200), ...dayOf('b', 400), ...dayOf('c', 40)];
    const left = applyRetention(rows, ctx(), cfg({ snapshotFullDays: 1 }));
    for (const user of ['a', 'b', 'c']) {
      const mine = rows.filter((r) => r.userId === user);
      expect(ids(left)).toContain(mine[mine.length - 1].id);
    }
  });

  it('the first ok snapshot of every account (the account-age baseline)', () => {
    const rows = [...dayOf('a', 200), ...dayOf('a', 100), ...dayOf('a', 45)];
    const left = ids(applyRetention(rows, ctx(), cfg({ snapshotFullDays: 1 })));
    expect(left).toContain(rows[0].id);
  });

  it('the first ok snapshot at or after the League reset, and the last one before it, when a day (or month) holds both', () => {
    const reset = at(60, 12);
    const rows = [snap('u', at(60, 9)), snap('u', at(60, 10)), snap('u', at(60, 11)), snap('u', at(60, 13)), snap('u', at(60, 14)), snap('u', at(60, 15))];
    const left = ids(applyRetention(rows, ctx({ resetAtMs: reset })));
    expect(left).toContain(rows[0].id); // first before
    expect(left).toContain(rows[2].id); // last before the reset
    expect(left).toContain(rows[3].id); // first after the reset (what the next submit-progress reads as its first accepted)
    expect(left).toContain(rows[5].id);
    expect(left).toEqual([rows[0].id, rows[2].id, rows[3].id, rows[5].id]);
  });

  it('the same holds for the month tier', () => {
    const reset = at(200, 12);
    const rows = [snap('u', at(200, 8)), snap('u', at(201, 8)), snap('u', at(199, 8)), snap('u', at(198, 8))];
    const left = ids(applyRetention(rows, ctx({ resetAtMs: reset })));
    const sorted = [...rows].sort((a, b) => a.atMs - b.atMs);
    const firstAfter = sorted.find((r) => r.atMs >= reset);
    expect(left).toContain(firstAfter?.id);
  });

  it('a snapshot with advisory notes, and the snapshot a ranking entry points at', () => {
    const day = dayOf('u', 60);
    const noted = snap('u', at(60, 9, 30), 'ok', ['FAST_LEVEL_PACE']);
    const rows = [day[0], noted, day[1], day[2], day[3]];
    const left = ids(applyRetention(rows, ctx({ pinnedIds: new Set([day[2].id]) })));
    expect(left).toContain(noted.id);
    expect(left).toContain(day[2].id);
    expect(left).not.toContain(day[1].id);
  });

  it('an open flag keeps the account\'s recent ok snapshots in full; clearing it releases them; old ones are compacted anyway', () => {
    const recent = dayOf('u', 50);
    const old = dayOf('u', 200);
    const flag = snap('u', at(48, 10), 'flagged', ['PACE']);
    const rows = [...old, ...recent, flag];
    const held = ids(applyRetention(rows, ctx()));
    for (const r of recent) expect(held).toContain(r.id);
    expect(held).not.toContain(old[1].id);
    const released = ids(applyRetention(rows, ctx({ clearedIds: new Set([flag.id]) })));
    expect(released).not.toContain(recent[1].id);
    expect(released).toContain(flag.id);
  });
});

describe('seasons', () => {
  it('everything inside an unpaid ranked season is kept for the PARTICIPANTS, even when older than 30 days', () => {
    const season = ranked(1, 'open', 70, -20);
    const part = dayOf('p', 60);
    const other = dayOf('x', 60);
    const c = ctx({ seasons: [season], participants: [{ season: 1, userId: 'p' }] });
    const left = ids(applyRetention([...part, ...other], c));
    for (const r of part) expect(left).toContain(r.id);
    expect(left).not.toContain(other[1].id);
    // the literal reading: every account is held
    const all = ids(applyRetention([...part, ...other], c, cfg({ snapshotParticipantsOnly: false })));
    expect(all).toHaveLength(8);
  });

  it('frozen and closed seasons are held too, upcoming ones have no dates and hold nothing', () => {
    const rows = dayOf('p', 60);
    for (const status of ['open', 'frozen', 'closed'] as const) {
      const c = ctx({ seasons: [ranked(1, status, 70, 20)], participants: [{ season: 1, userId: 'p' }] });
      expect(snapshotsToDelete(rows, c)).toEqual([]);
    }
    const upcoming: Season = { number: 2, kind: 'ranked', startsMs: null, endsMs: null, status: 'upcoming' };
    expect(snapshotsToDelete(rows, ctx({ seasons: [upcoming], participants: [{ season: 2, userId: 'p' }] }))).toHaveLength(2);
  });

  it('a PAID season is compacted at once, even for rows younger than 30 days and for participants', () => {
    const rows = dayOf('p', 5);
    const c = ctx({ seasons: [ranked(1, 'paid', 65, -1)], participants: [{ season: 1, userId: 'p' }] });
    expect(snapshotsToDelete(rows, c)).toHaveLength(2);
    expect(snapshotsToDelete(rows, ctx())).toEqual([]); // outside any season the same rows are too young
  });

  it('the pre-season counts as seasonless unless asked, and is then held only while open / frozen', () => {
    const rows = dayOf('p', 60);
    const pre: Season = { number: 0, kind: 'pre', startsMs: NOW - 100 * DAY, endsMs: Date.UTC(2099, 11, 31), status: 'open' };
    const c = ctx({ seasons: [pre], participants: [{ season: 0, userId: 'p' }] });
    expect(snapshotsToDelete(rows, c)).toHaveLength(2);
    expect(snapshotsToDelete(rows, c, cfg({ snapshotPreSeasonFull: true }))).toEqual([]);
    expect(snapshotsToDelete(rows, ctx({ seasons: [{ ...pre, status: 'closed' }], participants: c.participants }), cfg({ snapshotPreSeasonFull: true }))).toHaveLength(2);
  });
});

describe('the month tier and the batch', () => {
  it('older than the monthly cut only the first and the last ok row of a month remain', () => {
    // 100 to 105 days before 2027-01-31 are all in October 2026
    const all = [105, 104, 103, 102, 101, 100].map((d) => snap('m', at(d, 10)));
    const left = applyRetention(all, ctx());
    expect(ids(left)).toEqual([all[0].id, all[5].id]);
  });

  it('turning the month tier off (null) keeps one pair per day', () => {
    const all = [100, 101, 102].flatMap((d) => dayOf('m', d));
    expect(applyRetention(all, ctx(), cfg({ snapshotMonthlyAfterDays: null }))).toHaveLength(6);
  });

  it('one call deletes at most batchSize rows, oldest first, and repeated calls converge', () => {
    const rows = [60, 61, 62, 63, 64, 65].flatMap((d) => dayOf('u', d));
    const small = cfg({ batchSize: 3 });
    const first = snapshotsToDelete(rows, ctx(), small);
    expect(first).toHaveLength(3);
    let left: Snapshot[] = rows;
    let calls = 0;
    for (; calls < 20; calls++) {
      const gone = snapshotsToDelete(left, ctx(), small);
      if (gone.length === 0) break;
      expect(gone.length).toBeLessThanOrEqual(3);
      left = left.filter((r) => !gone.includes(r.id));
    }
    expect(left).toHaveLength(12);
    expect(calls).toBe(4);
  });
});

describe('invariants on random histories', () => {
  const rng = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  it('never deletes a non-ok row, the first ok row or the latest ok row of an account, and a second pass is a no-op', () => {
    const rand = rng(20261017);
    const rows: Snapshot[] = [];
    for (const user of ['a', 'b', 'c', 'd', 'e']) {
      for (let i = 0; i < 400; i++) {
        const atMs = NOW - Math.floor(rand() * 400 * DAY) - Math.floor(rand() * 24) * HOUR + i;
        const r = rand();
        rows.push(snap(user, atMs, r < 0.03 ? 'flagged' : r < 0.05 ? 'rejected' : 'ok', r > 0.98 ? ['FAST_LEVEL_PACE'] : []));
      }
    }
    const seasons = [ranked(1, 'paid', 300, 240), ranked(2, 'open', 100, -20)];
    const c = ctx({ seasons, participants: [{ season: 2, userId: 'a' }], resetAtMs: NOW - 350 * DAY, clearedIds: new Set(rows.filter((r) => r.verdict !== 'ok' && r.atMs % 2 === 0).map((r) => r.id)) });
    const left = applyRetention(rows, c);
    const leftIds = new Set(ids(left));
    for (const r of rows.filter((x) => x.verdict !== 'ok')) expect(leftIds.has(r.id)).toBe(true);
    for (const user of ['a', 'b', 'c', 'd', 'e']) {
      const ok = rows.filter((r) => r.userId === user && r.verdict === 'ok').sort((x, y) => x.atMs - y.atMs);
      expect(leftIds.has(ok[0].id)).toBe(true);
      expect(leftIds.has(ok[ok.length - 1].id)).toBe(true);
      const afterReset = ok.find((r) => r.atMs >= (c.resetAtMs ?? 0));
      if (afterReset) expect(leftIds.has(afterReset.id)).toBe(true);
    }
    expect(left.length).toBeLessThan(rows.length);
    expect(snapshotsToDelete(left, c)).toEqual([]);
  });
});
