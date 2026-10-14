import { describe, expect, it } from 'vitest';
import { BOUNDS, daysAtFloor, daysAtLevel, professionBurstXp, professionXpPerHour } from '../progress/bounds.ts';
import { EvalInput, HistoryPoint, evaluateSnapshot } from '../progress/evaluate.ts';
import { createProgressStore } from '../progress/progressDb.ts';
import { MAX_BODY_BYTES, NewSnapshot, ProfessionApplyStatus, ProgressStore, SNAPSHOT_MIN_INTERVAL_MS, SeasonApplyStatus, StoredSnapshot, canonicalJson, handleSubmitProgress } from '../progress/handler.ts';
import { ProgressMetrics, computeScore, extractMetrics, levelFromXp, levelPosition, paragonFromXp, peakOf, professionLevelFromXp, professionScores, splitScore } from '../progress/metrics.ts';
import { PROFESSION_XP_TO_LEVEL, XP_TO_LEVEL } from '../progress/tables.ts';

// Pure tests of the plausibility audit with SYNTHETIC histories. No Deno, no Supabase: the same modules the Edge Function imports.

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 5);
const USER = '11111111-1111-4111-8111-111111111111';

// ---- helpers ----------------------------------------------------------------------------------------------------------------------------------

/** The day the fastest simulated seed stood at `pos` is daysAtLevel(pos); this is its inverse (the honest fast player of the tests lives on that curve). */
function inverse(table: readonly (readonly [number, number])[], day: number): number {
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i];
    if (day <= y1) {
      const [x0, y0] = table[i - 1];
      return x0 + ((x1 - x0) * (day - y0)) / (y1 - y0);
    }
  }
  const [xa, ya] = table[table.length - 2];
  const [xb, yb] = table[table.length - 1];
  return xb + ((xb - xa) / (yb - ya)) * (day - yb);
}

function xpAtPosition(pos: number): number {
  const level = Math.min(XP_TO_LEVEL.length, Math.max(1, Math.floor(pos)));
  const from = XP_TO_LEVEL[level - 1];
  if (level >= XP_TO_LEVEL.length) return from + Math.round((pos - level) * 456_913); // a paragon level costs about 457k at the start
  return Math.floor(from + (pos - level) * (XP_TO_LEVEL[level] - from));
}

interface Overrides {
  xp?: number;
  floor?: number;
  depth?: number;
  kills?: number;
  gold?: number;
  seconds?: number;
  bosses?: number;
  runs?: number;
  floors?: number;
  uniques?: number;
  achievements?: number;
  mining?: number;
  woodcutting?: number;
  gardening?: number;
  hasBattlePass?: boolean;
  premium?: number[];
  stashBonusSlots?: number;
  templates?: { templateId: string; rarity?: string }[];
}

function blob(o: Overrides = {}) {
  return {
    xp: o.xp ?? 0,
    highestDungeonFloor: o.floor ?? 0,
    stats: {
      deepestDepth: o.depth ?? 0,
      kills: o.kills ?? 0,
      goldEarned: o.gold ?? 0,
      secondsPlayed: o.seconds ?? 0,
      bossesKilled: o.bosses ?? 0,
      dungeonRuns: o.runs ?? 0,
      dungeonFloors: o.floors ?? 0,
      uniquesFound: o.uniques ?? 0,
    },
    skillXp: { mining: o.mining ?? 0, woodcutting: o.woodcutting ?? 0, gardening: o.gardening ?? 0 },
    quests: { claimed: Array.from({ length: o.achievements ?? 0 }, (_, i) => `ACH_${i}`) },
    hasBattlePass: o.hasBattlePass ?? false,
    claimedPassRewards: { free: [], premium: o.premium ?? [] },
    stashBonusSlots: o.stashBonusSlots ?? 0,
    gearInstances: Object.fromEntries((o.templates ?? []).map((t, i) => [`gi_${i}`, { id: `gi_${i}`, templateId: t.templateId, rarity: t.rarity ?? 'common' }])),
    schemaVersion: 2,
    appVersion: '0.1.0',
  };
}

const m = (o: Overrides = {}): ProgressMetrics => extractMetrics(blob(o)) as ProgressMetrics;

function point(atMs: number, metrics: ProgressMetrics, revision = 1, peak = peakOf(metrics)): HistoryPoint {
  return { atMs, metrics, peak, saveRevision: revision };
}

/** Plays a history through the evaluator, one snapshot per entry, exactly like the function does (first = first accepted, previous = last accepted). */
function play(steps: { atMs: number; o: Overrides; revision?: number; entitled?: boolean }[], accountCreatedMs = T0 - 365 * DAY) {
  let first: HistoryPoint | null = null;
  let previous: HistoryPoint | null = null;
  const out: { verdict: string; reasons: string[] }[] = [];
  steps.forEach((s, i) => {
    const metrics = m(s.o);
    const input: EvalInput = { nowMs: s.atMs, accountCreatedMs, entitled: s.entitled ?? true, saveRevision: s.revision ?? i + 1, first, previous };
    const ev = evaluateSnapshot(metrics, input);
    out.push({ verdict: ev.verdict, reasons: ev.reasons });
    if (ev.verdict !== 'rejected') {
      const p = point(s.atMs, metrics, s.revision ?? i + 1, ev.peak);
      first = first ?? p;
      previous = p;
    }
  });
  return out;
}

/** A history on the fastest-seed curve, one snapshot every `everyHours`, for `days` days. `speed` 1 = exactly the fastest seed. */
function honestHistory(days: number, everyHours: number, speed = 1) {
  const steps: { atMs: number; o: Overrides }[] = [];
  for (let h = 0; h <= days * 24; h += everyHours) {
    const day = (h / 24) * speed;
    const pos = inverse(BOUNDS.levelPace, day);
    const floor = Math.floor(inverse(BOUNDS.floorPace, day));
    const depth = floor >= 100 ? Math.min(44, Math.floor(BOUNDS.depthPerDayFastest * (day - BOUNDS.floorPace[BOUNDS.floorPace.length - 1][1]))) : 0;
    steps.push({
      atMs: T0 + h * 3_600_000,
      o: {
        xp: xpAtPosition(pos),
        floor,
        depth: Math.max(0, depth),
        kills: Math.floor(day * 2500),
        gold: Math.floor(day * 30_000),
        seconds: Math.floor(day * 86_400 * 0.4),
        bosses: Math.floor(day * 3),
        runs: Math.floor(day * 10),
        floors: Math.floor(day * 400),
        uniques: Math.floor(day / 4),
        achievements: Math.min(100, Math.floor(day)),
      },
    });
  }
  return steps;
}

// ---- metrics ----------------------------------------------------------------------------------------------------------------------------------

describe('extractMetrics', () => {
  it('reads the numbers defensively: garbage, negatives, NaN and giants never throw and never escape their clamps', () => {
    expect(extractMetrics(null)).toBeNull();
    expect(extractMetrics([])).toBeNull();
    expect(extractMetrics('x')).toBeNull();
    const dirty = extractMetrics({ xp: -5, highestDungeonFloor: 5000, stats: { kills: Number.NaN, deepestDepth: 1e30, goldEarned: '9' }, gearInstances: 3, quests: null }) as ProgressMetrics;
    expect(dirty.xp).toBe(0);
    expect(dirty.highestFloor).toBe(100);
    expect(dirty.kills).toBe(0);
    expect(dirty.deepestDepth).toBe(99_999);
    expect(dirty.goldEarned).toBe(0);
    expect(dirty.achievements).toBe(0);
    expect(dirty.heroLevel).toBe(1);
  });

  it('counts gear by rarity and names the pieces that exist below their gate', () => {
    const ok = m({ xp: XP_TO_LEVEL[89], templates: [{ templateId: 'abyssal_greatblade', rarity: 'legendary' }, { templateId: 'wooden_club' }] });
    expect(ok.items.legendary).toBe(1);
    expect(ok.items.common).toBe(1);
    expect(ok.gateViolations).toEqual([]);
    const bad = m({ xp: XP_TO_LEVEL[29], templates: [{ templateId: 'abyssal_greatblade' }, { templateId: 'abyssal_greatblade' }] });
    expect(bad.gateViolations).toEqual(['abyssal_greatblade']);
  });

  it('level and paragon follow the XP table', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(XP_TO_LEVEL[49])).toBe(50);
    expect(levelFromXp(XP_TO_LEVEL[49] - 1)).toBe(49);
    const p = paragonFromXp(XP_TO_LEVEL[99] + 456_913 * 3);
    expect(p.level).toBeGreaterThanOrEqual(2);
    expect(m({ xp: XP_TO_LEVEL[99] + 456_913 * 3 }).levelTotal).toBe(100 + p.level);
    expect(levelPosition(XP_TO_LEVEL[49])).toBeCloseTo(50, 6);
  });
});

describe('score', () => {
  it('orders by level (paragon included), then depth; the parts come back out', () => {
    const a = computeScore(m({ xp: XP_TO_LEVEL[59], floor: 40 }));
    const b = computeScore(m({ xp: XP_TO_LEVEL[59], floor: 41 }));
    const c = computeScore(m({ xp: XP_TO_LEVEL[60], floor: 1 }));
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b); // a higher level beats any depth
    expect(splitScore(a)).toEqual({ levelTotal: 60, depthScore: 40 });
    const deep = m({ xp: XP_TO_LEVEL[99] + 456_913 * 5, floor: 100, depth: 30 });
    expect(splitScore(computeScore(deep))).toEqual({ levelTotal: deep.levelTotal, depthScore: 130 });
    expect(computeScore(deep)).toBeGreaterThan(computeScore(m({ xp: XP_TO_LEVEL[99], floor: 100, depth: 300 })));
  });
});

// ---- the audit --------------------------------------------------------------------------------------------------------------------------------

describe('evaluateSnapshot: an honest player', () => {
  it('the fastest simulated seed (and a human 20% faster) is ok at every snapshot over 150 days, snapshots every 12 h', () => {
    for (const speed of [1, 1.2]) {
      const result = play(honestHistory(150, 12, speed));
      const bad = result.map((r, i) => ({ ...r, i })).filter((r) => r.verdict !== 'ok');
      expect(bad).toEqual([]);
    }
  });

  it('snapshots every 10 minutes for 10 days stay ok too (the cumulative bound has no hidden drift)', () => {
    const result = play(honestHistory(10, 1 / 6, 1));
    expect(result.filter((r) => r.verdict !== 'ok')).toEqual([]);
  });

  it('a pace 2.5x the fastest seed is flagged (not ranked) and 3.5x is rejected', () => {
    const flagged = play(honestHistory(40, 12, 2.5));
    expect(flagged.some((r) => r.verdict === 'flagged')).toBe(true);
    expect(flagged.some((r) => r.verdict === 'rejected')).toBe(false);
    const rejected = play(honestHistory(40, 12, 3.5));
    expect(rejected.some((r) => r.verdict === 'rejected')).toBe(true);
  });

  it('a late claim is fine: an offline Hunt of 8 h in the best zone plus a finished order arrives in one snapshot', () => {
    const base = XP_TO_LEVEL[74];
    const r = play([
      { atMs: T0, o: { xp: base, floor: 80, seconds: 3600 } },
      { atMs: T0 + 3_600_000, o: { xp: base + 8 * 13_000 * 1.5, floor: 80, seconds: 7200 } },
    ]);
    expect(r.map((x) => x.verdict)).toEqual(['ok', 'ok']);
  });
});

describe('evaluateSnapshot: cheating', () => {
  const honestStart = { atMs: T0, o: { xp: xpAtPosition(5), floor: 3, seconds: 4000, kills: 200 } };

  it('an edited level: level 80 ten minutes after level 5 is rejected', () => {
    const r = play([honestStart, { atMs: T0 + 10 * 60_000, o: { xp: XP_TO_LEVEL[79], floor: 3, seconds: 4600, kills: 260 } }]);
    expect(r[0].verdict).toBe('ok');
    expect(r[1].verdict).toBe('rejected');
    expect(r[1].reasons).toEqual(expect.arrayContaining(['LEVEL_PACE', 'LEVEL_PACE_TOTAL', 'XP_RATE']));
  });

  it('an edited floor and depth are rejected (depth without floor 100, floor jump)', () => {
    const r = play([honestStart, { atMs: T0 + 3_600_000, o: { xp: honestStart.o.xp, floor: 3, depth: 25, seconds: 7000 } }]);
    expect(r[1].verdict).toBe('rejected');
    expect(r[1].reasons).toContain('DEPTH_WITHOUT_FLOOR_100');
    const jump = play([honestStart, { atMs: T0 + 3_600_000, o: { xp: honestStart.o.xp, floor: 90, seconds: 7000 } }]);
    expect(jump[1].verdict).toBe('rejected');
    expect(jump[1].reasons).toEqual(expect.arrayContaining(['FLOOR_PACE', 'FLOOR_ABOVE_LEVEL_CAP']));
  });

  it('a clock jump (8 h of hunting claimed every 10 minutes) is caught by the cumulative bound against the SERVER time since the first snapshot', () => {
    const steps = [{ atMs: T0, o: { xp: 0, seconds: 0 } }];
    for (let i = 1; i <= 40; i++) steps.push({ atMs: T0 + i * 10 * 60_000, o: { xp: i * 8 * 2300, seconds: i * 600 } }); // 8 h of the first zone each time
    const r = play(steps);
    expect(r.some((x) => x.reasons.includes('XP_RATE_TOTAL') || x.reasons.includes('LEVEL_PACE_TOTAL'))).toBe(true);
    expect(r[r.length - 1].verdict).toBe('rejected');
    // the first jumps still fit the single-burst allowance: the cheater is not caught by anything that would also catch an honest long claim
    expect(r[1].verdict).not.toBe('rejected');
  });

  it('a play time that outruns the server clock is rejected', () => {
    const r = play([honestStart, { atMs: T0 + 600_000, o: { ...honestStart.o, seconds: 4000 + 6 * 3600 } }]);
    expect(r[1].verdict).toBe('rejected');
    expect(r[1].reasons).toContain('SECONDS_PLAYED_EXCEEDS_CLOCK');
  });

  it('a restored older save (counters go down) is flagged, and the high-water mark is kept', () => {
    const r = play([
      { atMs: T0, o: { xp: xpAtPosition(20), floor: 10, kills: 5000, seconds: 20_000 } },
      { atMs: T0 + DAY, o: { xp: xpAtPosition(21), floor: 11, kills: 6000, seconds: 40_000 } },
      { atMs: T0 + 2 * DAY, o: { xp: xpAtPosition(20), floor: 10, kills: 5000, seconds: 20_000 } },
      { atMs: T0 + 3 * DAY, o: { xp: xpAtPosition(21.5), floor: 11, kills: 6100, seconds: 41_000 } },
    ]);
    expect(r.map((x) => x.verdict)).toEqual(['ok', 'ok', 'flagged', 'ok']);
    expect(r[2].reasons).toContain('RESTORED_OLDER_SAVE');
    // back above every earlier high-water mark: ranked again (the flag stays in the account's history)
    expect(r[3].reasons).toEqual([]);
  });

  it('a single counter going down (kills) is enough to flag; a save revision going backwards too', () => {
    const r = play([
      { atMs: T0, o: { xp: 1000, kills: 900 }, revision: 5 },
      { atMs: T0 + DAY, o: { xp: 1200, kills: 100 }, revision: 6 },
      { atMs: T0 + 2 * DAY, o: { xp: 1300, kills: 1000 }, revision: 3 },
    ]);
    expect(r[1].verdict).toBe('flagged');
    expect(r[1].reasons).toEqual(['RESTORED_OLDER_SAVE']);
    expect(r[2].reasons).toContain('SAVE_REVISION_BACKWARDS');
  });

  it('tier 6 gear on a low-level hero is rejected; the same piece on a level 90 hero is fine', () => {
    const low = play([{ atMs: T0, o: { xp: XP_TO_LEVEL[29], templates: [{ templateId: 'abyssal_greatblade', rarity: 'legendary' }] } }], T0 - 30 * DAY);
    expect(low[0].verdict).toBe('rejected');
    expect(low[0].reasons).toContain('GEAR_BELOW_GATE');
    const high = play([{ atMs: T0, o: { xp: XP_TO_LEVEL[89], floor: 90, templates: [{ templateId: 'abyssal_greatblade', rarity: 'legendary' }] } }], T0 - 200 * DAY);
    expect(high[0].reasons).not.toContain('GEAR_BELOW_GATE');
  });

  it('Pass-only features without a server entitlement: premium claims and Pass stash slots rejected, the bare flag flagged; with the entitlement all fine', () => {
    const base = { xp: XP_TO_LEVEL[29], floor: 20 };
    const age = T0 - 30 * DAY;
    expect(play([{ atMs: T0, o: { ...base, premium: [1, 2] }, entitled: false }], age)[0]).toMatchObject({ verdict: 'rejected', reasons: ['PASS_FEATURES_WITHOUT_ENTITLEMENT'] });
    expect(play([{ atMs: T0, o: { ...base, stashBonusSlots: 10 }, entitled: false }], age)[0].verdict).toBe('rejected');
    expect(play([{ atMs: T0, o: { ...base, hasBattlePass: true }, entitled: false }], age)[0]).toMatchObject({ verdict: 'flagged', reasons: ['PASS_FLAG_WITHOUT_ENTITLEMENT'] });
    expect(play([{ atMs: T0, o: { ...base, hasBattlePass: true, premium: [1], stashBonusSlots: 10 }, entitled: true }], age)[0].verdict).toBe('ok');
  });

  it('the first snapshot is a baseline: far ahead of the account age it is only flagged, never rejected', () => {
    const r = play([{ atMs: T0, o: { xp: XP_TO_LEVEL[79], floor: 70, seconds: 3_000_000 } }], T0 - 2 * DAY);
    expect(r[0].verdict).toBe('flagged');
    expect(r[0].reasons).toEqual(['BASELINE_AHEAD_OF_ACCOUNT_AGE']);
    const old = play([{ atMs: T0, o: { xp: XP_TO_LEVEL[79], floor: 70, seconds: 3_000_000 } }], T0 - 400 * DAY);
    expect(old[0].verdict).toBe('ok');
  });

  it('a rejected snapshot does not become the baseline: the next honest one is judged against the last accepted', () => {
    const r = play([
      { atMs: T0, o: { xp: xpAtPosition(5), seconds: 100 } },
      { atMs: T0 + 600_000, o: { xp: XP_TO_LEVEL[89], seconds: 700 } },
      { atMs: T0 + 1_200_000, o: { xp: xpAtPosition(5) + 50, seconds: 1300 } },
    ]);
    expect(r.map((x) => x.verdict)).toEqual(['ok', 'rejected', 'ok']);
  });
});

describe('bounds table', () => {
  it('the pace tables are increasing and the helpers interpolate', () => {
    for (const t of [BOUNDS.levelPace, BOUNDS.floorPace]) for (let i = 1; i < t.length; i++) expect(t[i][1]).toBeGreaterThan(t[i - 1][1]);
    expect(daysAtLevel(50)).toBe(9);
    expect(daysAtLevel(55)).toBeCloseTo(9 + (14 * 5) / 10, 6);
    expect(daysAtFloor(100)).toBe(75);
    expect(daysAtLevel(0.5)).toBe(0);
  });
});

// ---- the handler ------------------------------------------------------------------------------------------------------------------------------

class MemoryProgressStore implements ProgressStore {
  rows: (NewSnapshot & { id: string; createdAtMs: number })[] = [];
  pass = true;
  character_: { createdAtMs: number; revision: number } | null = { createdAtMs: T0 - DAY * 400, revision: 7 };
  seasonCalls: { userId: string; snapshotId: string; verdict: string; reasons: string[]; score: number }[] = [];
  seasonStatus: SeasonApplyStatus = 'updated';
  professionCalls: { userId: string; snapshotId: string; verdict: string; professions: { profession: string; xp: number; level: number }[] }[] = [];
  professionFails = false;
  async applyProfessionsToSeason(args: { userId: string; snapshotId: string; verdict: 'ok' | 'flagged' | 'rejected'; professions: { profession: string; xp: number; level: number }[] }): Promise<ProfessionApplyStatus> {
    if (this.professionFails) throw new Error('season_apply_professions_404');
    this.professionCalls.push(args);
    return 'updated';
  }
  now = T0;
  async hasActivePass() {
    return this.pass;
  }
  async character() {
    return this.character_;
  }
  private toStored(r: (typeof this.rows)[number]): StoredSnapshot {
    return { id: r.id, createdAtMs: r.createdAtMs, verdict: r.verdict, reasons: r.reasons, metrics: r.metrics };
  }
  async lastSnapshot(userId: string) {
    const mine = this.rows.filter((r) => r.userId === userId);
    return mine.length ? this.toStored(mine[mine.length - 1]) : null;
  }
  async acceptedHistory(userId: string) {
    const ok = this.rows.filter((r) => r.userId === userId && r.verdict !== 'rejected');
    const pt = (r: (typeof ok)[number]): HistoryPoint => ({ atMs: r.createdAtMs, metrics: r.metrics, peak: r.peak, saveRevision: r.saveRevision });
    return { first: ok[0] ? pt(ok[0]) : null, last: ok.length ? pt(ok[ok.length - 1]) : null };
  }
  async insertSnapshot(row: NewSnapshot) {
    const id = `snap-${this.rows.length + 1}`;
    this.rows.push({ ...row, id, createdAtMs: this.now });
    return { id };
  }
  async applyToSeason(args: { userId: string; snapshotId: string; verdict: 'ok' | 'flagged' | 'rejected'; reasons: string[]; score: number }) {
    this.seasonCalls.push(args);
    return this.seasonStatus;
  }
}

const ORIGIN = 'https://game.example.test';
const TOKEN = 'a'.repeat(40);

function fetchAs(id: string | null): typeof fetch {
  return (async () => (id ? new Response(JSON.stringify({ id }), { status: 200 }) : new Response('{}', { status: 401 }))) as typeof fetch;
}

function request(body: unknown, init: { token?: string | null; method?: string; origin?: string } = {}): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json', origin: init.origin ?? ORIGIN };
  if (init.token !== null) headers.authorization = `Bearer ${init.token ?? TOKEN}`;
  return new Request('https://x.test/functions/v1/submit-progress', { method: init.method ?? 'POST', headers, body: init.method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
}

function deps(store: MemoryProgressStore, userId: string | null = USER) {
  return {
    auth: { supabaseUrl: 'https://p.test', anonKey: 'anon-key-not-real', fetchFn: fetchAs(userId) },
    allowedOrigins: [ORIGIN],
    store,
    nowMs: () => store.now,
  };
}

describe('handleSubmitProgress', () => {
  it('refuses without a valid JWT, from a foreign origin, with a wrong method, and an oversized body', async () => {
    const store = new MemoryProgressStore();
    expect((await handleSubmitProgress(request(blob(), { token: null }), deps(store))).status).toBe(401);
    expect((await handleSubmitProgress(request(blob()), deps(store, null))).status).toBe(401);
    expect((await handleSubmitProgress(request(blob(), { origin: 'https://evil.test' }), deps(store))).status).toBe(403);
    expect((await handleSubmitProgress(request(blob(), { method: 'GET' }), deps(store))).status).toBe(405);
    expect((await handleSubmitProgress(request('x'.repeat(MAX_BODY_BYTES + 10)), deps(store))).status).toBe(413);
    expect((await handleSubmitProgress(request('{not json'), deps(store))).status).toBe(400);
    expect((await handleSubmitProgress(request('[1,2]'), deps(store))).status).toBe(400);
    expect(store.rows).toHaveLength(0);
  });

  it('derives the metrics on the server: a body that carries its own "metrics", "verdict" or "user_id" changes nothing', async () => {
    const store = new MemoryProgressStore();
    const res = await handleSubmitProgress(
      request({ ...blob({ xp: xpAtPosition(10), floor: 5 }), metrics: { levelTotal: 9999 }, verdict: 'ok', user_id: '22222222-2222-4222-8222-222222222222', userId: 'x' }),
      deps(store),
    );
    expect(res.status).toBe(200);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].userId).toBe(USER);
    expect(store.rows[0].metrics.levelTotal).toBe(10);
    expect(store.rows[0].saveRevision).toBe(7); // the characters row, not anything in the body
    expect(store.rows[0].metricsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(store.seasonCalls[0]).toMatchObject({ userId: USER, snapshotId: 'snap-1', verdict: 'ok', score: computeScore(store.rows[0].metrics) });
  });

  it('rate limit: a second call inside 10 minutes stores nothing and returns the last verdict; after the window it is judged again', async () => {
    const store = new MemoryProgressStore();
    await handleSubmitProgress(request(blob({ xp: 5000 })), deps(store));
    store.now = T0 + SNAPSHOT_MIN_INTERVAL_MS - 1000;
    const second = await (await handleSubmitProgress(request(blob({ xp: 6000 })), deps(store))).json();
    expect(second).toMatchObject({ throttled: true, verdict: 'ok' });
    expect(store.rows).toHaveLength(1);
    expect(store.seasonCalls).toHaveLength(1);
    store.now = T0 + SNAPSHOT_MIN_INTERVAL_MS + 1000;
    const third = await (await handleSubmitProgress(request(blob({ xp: 6000 })), deps(store))).json();
    expect(third.throttled).toBe(false);
    expect(store.rows).toHaveLength(2);
  });

  it('a rejected snapshot is stored (the owner sees it), carries the reasons, does not raise the peak, and is handed to the ranking as not ok', async () => {
    const store = new MemoryProgressStore();
    await handleSubmitProgress(request(blob({ xp: xpAtPosition(5), seconds: 100 })), deps(store));
    store.now = T0 + 11 * 60_000;
    const body = await (await handleSubmitProgress(request(blob({ xp: XP_TO_LEVEL[89], seconds: 760 })), deps(store))).json();
    expect(body.verdict).toBe('rejected');
    expect(body.reasons).toContain('LEVEL_PACE');
    expect(store.rows[1].verdict).toBe('rejected');
    expect(store.rows[1].peak.xp).toBe(store.rows[0].peak.xp);
    expect(store.seasonCalls[1].verdict).toBe('rejected');
  });

  it('the Pass check uses the server (store), never the save flag', async () => {
    const store = new MemoryProgressStore();
    store.pass = false;
    const body = await (await handleSubmitProgress(request(blob({ xp: xpAtPosition(5), hasBattlePass: true, premium: [1] })), deps(store))).json();
    expect(body.verdict).toBe('rejected');
    expect(body.reasons).toContain('PASS_FEATURES_WITHOUT_ENTITLEMENT');
  });

  it('works without the ranking wired (applyToSeason absent) and survives a store failure with a 502 that leaks nothing', async () => {
    const store = new MemoryProgressStore();
    (store as { applyToSeason?: unknown }).applyToSeason = undefined;
    const ok = await handleSubmitProgress(request(blob({ xp: 10 })), deps(store));
    expect(ok.status).toBe(200);
    expect((await ok.json()).season).toBeNull();
    store.now += SNAPSHOT_MIN_INTERVAL_MS * 2;
    store.insertSnapshot = async () => {
      throw new Error('snapshot_write_500');
    };
    const bad = await handleSubmitProgress(request(blob({ xp: 20 })), deps(store));
    expect(bad.status).toBe(502);
    expect(await bad.json()).toEqual({ error: 'submit_failed' });
  });

  it('canonicalJson is key-order independent', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(canonicalJson({ a: [2, { c: 2, d: 1 }], b: 1 }));
  });
});

// ---- profession rankings ----------------------------------------------------------------------------------------------------------------------

describe('profession metrics', () => {
  it('reads skill XP and the level the table gives; garbage and a missing skillXp become 0 / level 1', () => {
    const p = m({ mining: PROFESSION_XP_TO_LEVEL.mining[29] + 5, woodcutting: PROFESSION_XP_TO_LEVEL.woodcutting[74], gardening: 12 });
    expect(p.miningLevel).toBe(30);
    expect(p.woodcuttingLevel).toBe(75);
    expect(p.gardeningLevel).toBe(professionLevelFromXp('gardening', 12));
    const dirty = extractMetrics({ xp: 1, skillXp: { mining: -3, woodcutting: Number.NaN, gardening: 1e30 } }) as ProgressMetrics;
    expect([dirty.miningXp, dirty.woodcuttingXp, dirty.gardeningXp]).toEqual([0, 0, 1e12]);
    expect(dirty.miningLevel).toBe(1);
    expect((extractMetrics({ xp: 1 }) as ProgressMetrics).gardeningXp).toBe(0);
    expect((extractMetrics({ xp: 1, skillXp: 'x' }) as ProgressMetrics).miningXp).toBe(0);
  });

  it('professionScores lists only professions with XP, score = total XP', () => {
    expect(professionScores(m({}))).toEqual([]);
    expect(professionScores(m({ mining: 500, gardening: 40 })).map((x) => [x.profession, x.xp])).toEqual([['mining', 500], ['gardening', 40]]);
  });

  it('score order and tiebreak: more XP first; on equal XP the one who got there earlier (the SQL orders by score desc, tiebreak_at asc)', () => {
    const rows = [
      { id: 'a', score: 900, at: 5 },
      { id: 'b', score: 1200, at: 9 },
      { id: 'c', score: 900, at: 2 },
    ];
    const ranked = [...rows].sort((x, y) => y.score - x.score || x.at - y.at).map((r) => r.id);
    expect(ranked).toEqual(['b', 'c', 'a']);
  });
});

describe('profession XP bounds', () => {
  const START = 5 * DAY; // the account is old enough for the baseline not to matter

  /** An honest gatherer at the very best settings gains XP at exactly the theoretical rate, snapshot by snapshot. */
  function gatherer(profession: 'mining' | 'woodcutting' | 'gardening', everyHours: number, days: number) {
    const steps: { atMs: number; o: Overrides }[] = [];
    let xp = profession === 'gardening' ? 100 : 1000;
    for (let h = 0; h <= days * 24; h += everyHours) {
      if (h > 0) {
        const level = professionLevelFromXp(profession, xp);
        xp += Math.floor(professionXpPerHour(profession, level) * everyHours);
      }
      steps.push({ atMs: T0 + h * 3_600_000, o: { xp: xpAtPosition(40), floor: 40, seconds: h * 3600 * 0.9, [profession]: xp } });
    }
    return steps;
  }

  it('an honest fast gatherer at the theoretical maximum is ok: every profession, snapshots every 10 minutes, 1 hour, 12 hours', () => {
    for (const profession of ['mining', 'woodcutting', 'gardening'] as const) {
      for (const every of [1 / 6, 1, 12]) {
        const r = play(gatherer(profession, every, 6), T0 - START);
        expect(r.filter((x) => x.verdict !== 'ok')).toEqual([]);
      }
    }
  });

  it('a late claim is fine: 8 hours of a full session arrive in one snapshot', () => {
    const level = 50;
    const base = PROFESSION_XP_TO_LEVEL.mining[level - 1];
    const gain = Math.floor(professionXpPerHour('mining', level) * 8);
    const r = play(
      [
        { atMs: T0, o: { xp: xpAtPosition(40), floor: 40, seconds: 100, mining: base } },
        { atMs: T0 + 600_000, o: { xp: xpAtPosition(40), floor: 40, seconds: 700, mining: base + gain } },
      ],
      T0 - START,
    );
    expect(r.map((x) => x.verdict)).toEqual(['ok', 'ok']);
  });

  it('edited profession XP is caught: +100k XP ten minutes later is rejected with its own code (and the _TOTAL one)', () => {
    for (const [profession, code] of [
      ['mining', 'MINING_XP_RATE'],
      ['woodcutting', 'WOODCUTTING_XP_RATE'],
      ['gardening', 'GARDENING_XP_RATE'],
    ] as const) {
      const r = play(
        [
          { atMs: T0, o: { xp: xpAtPosition(40), floor: 40, seconds: 100, [profession]: 2000 } },
          { atMs: T0 + 600_000, o: { xp: xpAtPosition(40), floor: 40, seconds: 700, [profession]: 102_000 } },
        ],
        T0 - START,
      );
      expect(r[1].verdict).toBe('rejected');
      expect(r[1].reasons).toEqual(expect.arrayContaining([code, code + '_TOTAL']));
    }
  });

  it('between the flag value and twice it the snapshot is only flagged (not ranked)', () => {
    const allowed = professionXpPerHour('mining', 20) * (1 / 6) + professionBurstXp('mining', 20);
    const base = PROFESSION_XP_TO_LEVEL.mining[19];
    const r = play(
      [
        { atMs: T0, o: { xp: xpAtPosition(40), floor: 40, seconds: 100, mining: base } },
        { atMs: T0 + 600_000, o: { xp: xpAtPosition(40), floor: 40, seconds: 700, mining: base + Math.floor(allowed * 1.5) } },
      ],
      T0 - START,
    );
    expect(r[1].verdict).toBe('flagged');
    expect(r[1].reasons).toContain('MINING_XP_RATE');
  });

  it('a history from before metrics v2 (no profession XP in the peak) is never judged against a zero baseline', () => {
    const old = m({ xp: xpAtPosition(40), floor: 40, seconds: 1000 });
    const legacy: Record<string, unknown> = { ...old };
    const legacyPeak: Record<string, unknown> = { ...peakOf(old) };
    for (const k of ['miningXp', 'woodcuttingXp', 'gardeningXp']) {
      delete legacy[k];
      delete legacyPeak[k];
    }
    const pt = point(T0, legacy as unknown as ProgressMetrics, 1, legacyPeak as unknown as ReturnType<typeof peakOf>);
    const ev = evaluateSnapshot(m({ xp: xpAtPosition(40), floor: 40, seconds: 1100, mining: 80_000 }), {
      nowMs: T0 + 600_000,
      accountCreatedMs: T0 - 300 * DAY,
      entitled: true,
      saveRevision: 2,
      first: pt,
      previous: pt,
    });
    expect(ev.reasons.some((c) => c.startsWith('MINING_XP_RATE'))).toBe(false);
  });

  it('the first snapshot of a young account with a huge profession XP is flagged as ahead of the account age, never rejected', () => {
    const o = { xp: xpAtPosition(10), floor: 5, seconds: 100, mining: 500_000 };
    const r = play([{ atMs: T0, o }], T0 - 2 * DAY);
    expect(r[0].verdict).toBe('flagged');
    expect(r[0].reasons).toEqual(['BASELINE_AHEAD_OF_ACCOUNT_AGE']);
    expect(play([{ atMs: T0, o }], T0 - 400 * DAY)[0].verdict).toBe('ok');
  });
});

describe('handleSubmitProgress and the profession rankings', () => {
  it('hands the profession XP to the profession ranking after an accepted ok snapshot, with the levels the server computed', async () => {
    const store = new MemoryProgressStore();
    const body = await (await handleSubmitProgress(request(blob({ xp: xpAtPosition(10), mining: PROFESSION_XP_TO_LEVEL.mining[19] + 3, gardening: 30 })), deps(store))).json();
    expect(body.professions).toBe('updated');
    expect(store.professionCalls).toHaveLength(1);
    expect(store.professionCalls[0]).toMatchObject({ userId: USER, snapshotId: 'snap-1', verdict: 'ok' });
    expect(store.professionCalls[0].professions).toEqual([
      { profession: 'mining', xp: PROFESSION_XP_TO_LEVEL.mining[19] + 3, level: 20 },
      { profession: 'gardening', xp: 30, level: professionLevelFromXp('gardening', 30) },
    ]);
  });

  it('does not call it when the ranking said the player is not eligible or the snapshot is flagged; a failing call never turns the answer into an error', async () => {
    const store = new MemoryProgressStore();
    store.seasonStatus = 'no_pass';
    await handleSubmitProgress(request(blob({ xp: xpAtPosition(10), mining: 10 })), deps(store));
    expect(store.professionCalls).toHaveLength(0);
    store.seasonStatus = 'updated';
    store.pass = false;
    store.now += SNAPSHOT_MIN_INTERVAL_MS * 2;
    await handleSubmitProgress(request(blob({ xp: xpAtPosition(10), mining: 10, hasBattlePass: true })), deps(store));
    expect(store.professionCalls).toHaveLength(0); // flagged: PASS_FLAG_WITHOUT_ENTITLEMENT
    store.pass = true;
    store.professionFails = true;
    store.now += SNAPSHOT_MIN_INTERVAL_MS * 2;
    const res = await handleSubmitProgress(request(blob({ xp: xpAtPosition(10), mining: 20 })), deps(store));
    expect(res.status).toBe(200);
    expect((await res.json()).professions).toBeNull();
  });

  it('createProgressStore posts the professions to the rpc with the service key', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(init.body as string) });
      return new Response(JSON.stringify('updated'), { status: 200 });
    }) as typeof fetch;
    const store = createProgressStore({ supabaseUrl: 'https://p.test', serviceRoleKey: 'k', fetchFn });
    expect(await store.applyProfessionsToSeason!({ userId: USER, snapshotId: 's', verdict: 'ok', professions: [{ profession: 'mining', xp: 5, level: 2 }] })).toBe('updated');
    expect(calls[0].url).toBe('https://p.test/rest/v1/rpc/season_apply_professions');
    expect(calls[0].body).toEqual({ p_user_id: USER, p_snapshot_id: 's', p_verdict: 'ok', p_professions: [{ profession: 'mining', xp: 5, level: 2 }] });
  });
});
